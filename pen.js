// pen.js — PEN WASM loader + JS API
// Works in Node.js (v16+) and browser (ESM via pen.mjs or inline script).
//
// Usage:
//   const pen = require('./pen')           // Node (CJS)
//   await pen.ready                        // wait for WASM init
//   const ok = pen.run(bytecode, regs)    // bytecode: Uint8Array, regs: any[]
//
// Register value types accepted:
//   null              → tag 0 (NULL)
//   true / false      → tag 1 (BOOL)
//   integer (safe)    → tag 2 (INT i64)
//   float             → tag 3 (F64)
//   string            → tag 4 (STR utf8)

;(function(root, factory) {
  if (typeof module !== 'undefined') module.exports = factory()
  else root.pen = factory()
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {

var pen = {}

// ── WASM init ────────────────────────────────────────────────────────────────

var _wasm = null
var _mem  = null  // Uint8Array view over WASM linear memory

function _view() {
  // Refresh DataView each time (memory may grow)
  return new Uint8Array(_wasm.instance.exports.memory.buffer)
}

pen.ready = (function() {
  var wasmPath
  if (typeof __dirname !== 'undefined') {
    // Node.js
    wasmPath = require('path').join(__dirname, 'pen.wasm')
    return require('fs').promises.readFile(wasmPath)
      .then(function(buf) { return WebAssembly.instantiate(buf, {}) })
      .then(function(result) { _wasm = result; _mem = _view() })
  } else {
    // Browser — expects pen.wasm in same directory as pen.js
    var base = (typeof document !== 'undefined' && document.currentScript)
      ? document.currentScript.src.replace(/pen\.js$/, '')
      : './'
    return fetch(base + 'pen.wasm')
      .then(function(r) { return r.arrayBuffer() })
      .then(function(buf) { return WebAssembly.instantiate(buf, {}) })
      .then(function(result) { _wasm = result; _mem = _view() })
  }
}())

// ── Wire encoding ─────────────────────────────────────────────────────────────
// Layout written into the shared 64KB buffer:
//   [0..3]     u32 LE  = bytecode length
//   [4..N+3]   bytecode bytes
//   [N+4..N+7] u32 LE  = register count
//   [N+8..]    register wire encoding

var _enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : {
  encode: function(s) {
    var bytes = []
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i)
      if (c < 0x80) bytes.push(c)
      else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F))
      else bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F))
    }
    return new Uint8Array(bytes)
  }
}

function _writeReg(view, offset, val) {
  if (val === null || val === undefined) {
    view[offset++] = 0; return offset
  }
  if (typeof val === 'boolean') {
    view[offset++] = 1; view[offset++] = val ? 1 : 0; return offset
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val >= -0x8000000000000000 && val <= 0x7FFFFFFFFFFFFFFF) {
      view[offset++] = 2
      // i64 LE (safe integer range)
      var lo = val >>> 0
      var hi = Math.floor(val / 0x100000000)
      view[offset++] = lo & 0xFF; view[offset++] = (lo >> 8) & 0xFF
      view[offset++] = (lo >> 16) & 0xFF; view[offset++] = (lo >> 24) & 0xFF
      var hlo = hi >>> 0
      view[offset++] = hlo & 0xFF; view[offset++] = (hlo >> 8) & 0xFF
      view[offset++] = (hlo >> 16) & 0xFF; view[offset++] = (hlo >> 24) & 0xFF
      return offset
    } else {
      view[offset++] = 3
      // f64 LE via DataView
      var dv = new DataView(view.buffer, view.byteOffset + offset, 8)
      dv.setFloat64(0, val, true /* little-endian */)
      offset += 8; return offset
    }
  }
  if (typeof val === 'string') {
    view[offset++] = 4
    var encoded = _enc.encode(val)
    var slen = Math.min(encoded.length, 0xFFFF)
    view[offset++] = slen & 0xFF; view[offset++] = (slen >> 8) & 0xFF
    for (var i = 0; i < slen; i++) view[offset++] = encoded[i]
    return offset
  }
  view[offset++] = 0; return offset // unknown → null
}

// ── run ───────────────────────────────────────────────────────────────────────

pen.run = function(bytecode, regs) {
  if (!_wasm) throw new Error('pen: not ready. await pen.ready first.')
  var exp = _wasm.instance.exports
  var view = _view()

  // Refresh in case memory grew
  _mem = view

  // reset bump
  exp.free()

  // Get base address of the shared buffer inside WASM linear memory
  var base = exp.mem()

  // Write bytecode length (u32 LE) at buf[0..3]
  var bclen = bytecode.length
  view[base + 0] = bclen & 0xFF
  view[base + 1] = (bclen >> 8) & 0xFF
  view[base + 2] = (bclen >> 16) & 0xFF
  view[base + 3] = (bclen >> 24) & 0xFF

  // Write bytecode
  for (var i = 0; i < bclen; i++) view[base + 4 + i] = bytecode[i]

  // Write register count (u32 LE)
  var regOff = base + 4 + bclen
  var nregs = regs ? regs.length : 0
  view[regOff + 0] = nregs & 0xFF
  view[regOff + 1] = (nregs >> 8) & 0xFF
  view[regOff + 2] = (nregs >> 16) & 0xFF
  view[regOff + 3] = (nregs >> 24) & 0xFF

  // Write registers
  var off = regOff + 4
  for (var j = 0; j < nregs; j++) off = _writeReg(view, off, regs[j])

  // Execute
  var result = exp.run()
  if (result === 1) return true
  if (result === 0) return false
  if (result === -2) throw new Error('PEN: bad version byte')
  if (result === -3) throw new Error('PEN: max recursion depth exceeded')
  throw new Error('PEN: runtime error (' + result + ')')
}

// ── Bytecode builder helpers ──────────────────────────────────────────────────
// pen.bc is a minimal assembler for building bytecode from JS.
// Primarily used by tests and the compiler layer.

var bc = pen.bc = {}

bc.buf = function() { return [] }

// ULEB128 encode
bc.uleb = function(n) {
  var bytes = []
  n = n >>> 0
  do {
    var b = n & 0x7F; n >>>= 7
    if (n !== 0) b |= 0x80
    bytes.push(b)
  } while (n !== 0)
  return bytes
}

// SLEB128 encode
bc.sleb = function(n) {
  var bytes = []
  var more = true
  while (more) {
    var b = n & 0x7F; n >>= 7
    if ((n === 0 && (b & 0x40) === 0) || (n === -1 && (b & 0x40) !== 0)) more = false
    else b |= 0x80
    bytes.push(b)
  }
  return bytes
}

bc.prog = function(root) {
  return new Uint8Array([0x01].concat(root))        // version byte + root expr
}
bc.null_  = function() { return [0x00] }
bc.true_  = function() { return [0x01] }
bc.false_ = function() { return [0x02] }
bc.str    = function(s) {
  var bytes = Array.from(_enc.encode(s.slice(0, 255)))
  return [0x03, bytes.length].concat(bytes)
}
bc.uint   = function(n) { return [0x04].concat(bc.uleb(n)) }
bc.int    = function(n) { return [0x07].concat(bc.sleb(n)) }
bc.pass   = function() { return [0x23] }
bc.fail   = function() { return [0x24] }
bc.reg    = function(n) { return [0x10, n] }
bc.r0     = function() { return [0xF0] }  // key
bc.r1     = function() { return [0xF1] }  // val
bc.r2     = function() { return [0xF2] }  // soul
bc.r3     = function() { return [0xF3] }  // state
bc.r4     = function() { return [0xF4] }  // now
bc.r5     = function() { return [0xF5] }  // pub
bc.local  = function(n) { return [0xF8 + n] }  // n = 0..3
bc.intn   = function(n) {  // inline 0..15
  if (n >= 0 && n <= 15) return [0xE0 + n]
  return bc.uint(n)
}

bc.and    = function(exprs) { return [0x20, exprs.length].concat(...exprs) }
bc.or     = function(exprs) { return [0x21, exprs.length].concat(...exprs) }
bc.not    = function(expr)  { return [0x22].concat(expr) }

bc.eq     = function(a, b)  { return [0x30].concat(a, b) }
bc.ne     = function(a, b)  { return [0x31].concat(a, b) }
bc.lt     = function(a, b)  { return [0x32].concat(a, b) }
bc.gt     = function(a, b)  { return [0x33].concat(a, b) }
bc.lte    = function(a, b)  { return [0x34].concat(a, b) }
bc.gte    = function(a, b)  { return [0x35].concat(a, b) }

bc.add    = function(a, b)  { return [0x40].concat(a, b) }
bc.sub    = function(a, b)  { return [0x41].concat(a, b) }
bc.mul    = function(a, b)  { return [0x42].concat(a, b) }
bc.divu   = function(a, b)  { return [0x43].concat(a, b) }
bc.mod    = function(a, b)  { return [0x44].concat(a, b) }
bc.abs    = function(a)     { return [0x46].concat(a) }
bc.neg    = function(a)     { return [0x47].concat(a) }

bc.len    = function(a)     { return [0x50].concat(a) }
bc.slice  = function(a,s,e) { return [0x51].concat(a, s, e) }
bc.seg    = function(a,sep,idx) { return [0x52].concat(a, [sep.charCodeAt(0)], idx) }
bc.tonum  = function(a)     { return [0x53].concat(a) }
bc.tostr  = function(a)     { return [0x54].concat(a) }
bc.concat = function(a, b)  { return [0x55].concat(a, b) }
bc.pre    = function(a, b)  { return [0x56].concat(a, b) }
bc.suf    = function(a, b)  { return [0x57].concat(a, b) }
bc.inc    = function(a, b)  { return [0x58].concat(a, b) }
bc.upper  = function(a)     { return [0x5A].concat(a) }
bc.lower  = function(a)     { return [0x5B].concat(a) }

bc.iss    = function(a)     { return [0x60].concat(a) }
bc.isn    = function(a)     { return [0x61].concat(a) }
bc.isx    = function(a)     { return [0x62].concat(a) }
bc.isb    = function(a)     { return [0x63].concat(a) }
bc.lng    = function(a,mn,mx){ return [0x64].concat(a, [mn, mx]) }

bc.let_   = function(slot, def, body) { return [0x70, slot].concat(def, body) }
bc.if_    = function(c,t,e) { return [0x71].concat(c, t, e) }

bc.segr   = function(reg, sep, idx) { return [0x80, reg, sep.charCodeAt(0), idx] }
bc.segrn  = function(reg, sep, idx) { return [0x81, reg, sep.charCodeAt(0), idx] }

return pen

}))
