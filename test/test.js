// test/test.js — PEN ISA v1 exhaustive test suite
// Run with: node test/test.js
// Tests every opcode, edge case, adversarial input, and candle-like use case.

import pen from '../pen.js'
const b = pen.bc

var passed = 0
var failed = 0
var errors = []

function assert(name, got, expected) {
  if (got === expected) {
    passed++
    process.stdout.write('.')
  } else {
    failed++
    errors.push({ name, got, expected })
    process.stdout.write('F')
  }
}

function assertThrows(name, fn, msgContains) {
  try {
    fn()
    failed++
    errors.push({ name, got: 'no throw', expected: 'throw ' + msgContains })
    process.stdout.write('F')
  } catch(e) {
    if (!msgContains || String(e.message || e).includes(msgContains)) {
      passed++
      process.stdout.write('.')
    } else {
      failed++
      errors.push({ name, got: e.message, expected: msgContains })
      process.stdout.write('F')
    }
  }
}

function run(expr, regs) {
  return pen.run(b.prog(expr), regs || [])
}

// ── Wait for WASM init ────────────────────────────────────────────────────────
pen.ready.then(function() {
  console.log('\nPEN ISA v1 — test suite\n')

  // ── Constants ──────────────────────────────────────────────────────────────
  console.log('\n[constants]')
  assert('PASS',    run(b.pass()),  true)
  assert('FAIL',    run(b.fail()),  false)
  assert('NULL→false', run(b.null_()), false)
  assert('TRUE',    run(b.true_()), true)
  assert('FALSE',   run(b.false_()), false)
  assert('UINT 0',  run(b.eq(b.uint(0), b.intn(0))), true)
  assert('UINT 1',  run(b.eq(b.uint(1), b.intn(1))), true)
  assert('UINT 127',run(b.eq(b.uint(127), b.uint(127))), true)
  assert('UINT 128',run(b.gt(b.uint(128), b.uint(127))), true)
  assert('UINT 300000', run(b.eq(b.uint(300000), b.uint(300000))), true)
  assert('UINT 300000 ne 300001', run(b.ne(b.uint(300000), b.uint(300001))), true)
  assert('INT -1',  run(b.lt(b.int(-1), b.intn(0))), true)
  assert('INT -100',run(b.eq(b.int(-100), b.int(-100))), true)
  assert('INLINE 0..15', run(b.eq(b.intn(15), b.uint(15))), true)
  assert('STR hello', run(b.eq(b.str('hello'), b.str('hello'))), true)
  assert('STR empty', run(b.eq(b.str(''), b.str(''))), true)
  assert('STR ne',  run(b.ne(b.str('a'), b.str('b'))), true)

  // ── Logic ──────────────────────────────────────────────────────────────────
  console.log('\n[logic]')
  assert('AND T,T',  run(b.and([b.true_(), b.true_()])), true)
  assert('AND T,F',  run(b.and([b.true_(), b.false_()])), false)
  assert('AND F,T',  run(b.and([b.false_(), b.true_()])), false)
  assert('AND 3 all T', run(b.and([b.true_(), b.true_(), b.true_()])), true)
  assert('OR T,F',   run(b.or([b.true_(), b.false_()])), true)
  assert('OR F,F',   run(b.or([b.false_(), b.false_()])), false)
  assert('OR F,T',   run(b.or([b.false_(), b.true_()])), true)
  assert('NOT T',    run(b.not(b.true_())), false)
  assert('NOT F',    run(b.not(b.false_())), true)
  assert('NOT NULL', run(b.not(b.null_())), true)

  // ── Comparison ────────────────────────────────────────────────────────────
  console.log('\n[comparison]')
  assert('EQ num',  run(b.eq(b.uint(42), b.uint(42))), true)
  assert('EQ str',  run(b.eq(b.str('hi'), b.str('hi'))), true)
  assert('NE num',  run(b.ne(b.uint(1), b.uint(2))), true)
  assert('LT',      run(b.lt(b.uint(1), b.uint(2))), true)
  assert('LT eq',   run(b.lt(b.uint(2), b.uint(2))), false)
  assert('GT',      run(b.gt(b.uint(2), b.uint(1))), true)
  assert('GT eq',   run(b.gt(b.uint(2), b.uint(2))), false)
  assert('LTE eq',  run(b.lte(b.uint(2), b.uint(2))), true)
  assert('LTE lt',  run(b.lte(b.uint(1), b.uint(2))), true)
  assert('LTE gt',  run(b.lte(b.uint(3), b.uint(2))), false)
  assert('GTE eq',  run(b.gte(b.uint(2), b.uint(2))), true)
  assert('GTE gt',  run(b.gte(b.uint(3), b.uint(2))), true)
  assert('GTE lt',  run(b.gte(b.uint(1), b.uint(2))), false)
  // String lexicographic
  assert('LT str a<b', run(b.lt(b.str('a'), b.str('b'))), true)
  assert('GT str b>a', run(b.gt(b.str('b'), b.str('a'))), true)
  assert('EQ str case', run(b.eq(b.str('A'), b.str('a'))), false)

  // ── Arithmetic ────────────────────────────────────────────────────────────
  console.log('\n[arithmetic]')
  assert('ADD 2+3=5',   run(b.eq(b.add(b.uint(2), b.uint(3)), b.uint(5))), true)
  assert('SUB 5-3=2',   run(b.eq(b.sub(b.uint(5), b.uint(3)), b.uint(2))), true)
  assert('MUL 3*4=12',  run(b.eq(b.mul(b.uint(3), b.uint(4)), b.uint(12))), true)
  assert('DIVU 7/2=3',  run(b.eq(b.divu(b.uint(7), b.uint(2)), b.uint(3))), true)
  assert('DIVU 6/2=3',  run(b.eq(b.divu(b.uint(6), b.uint(2)), b.uint(3))), true)
  assert('DIVU floor',  run(b.eq(b.divu(b.uint(300000), b.uint(300000)), b.uint(1))), true)
  assert('MOD 7%3=1',   run(b.eq(b.mod(b.uint(7), b.uint(3)), b.uint(1))), true)
  assert('ABS -5=5',    run(b.eq(b.abs(b.int(-5)), b.uint(5))), true)
  assert('ABS +5=5',    run(b.eq(b.abs(b.uint(5)), b.uint(5))), true)
  assert('NEG 5=-5',    run(b.lt(b.neg(b.uint(5)), b.uint(0))), true)
  assert('NEG -3=3',    run(b.gt(b.neg(b.int(-3)), b.uint(0))), true)
  // Large number: candle 5-min  
  assert('candle div',  run(b.eq(b.divu(b.uint(1800000), b.uint(300000)), b.uint(6))), true)

  // ── String ops ───────────────────────────────────────────────────────────
  console.log('\n[string]')
  assert('LEN 5',    run(b.eq(b.len(b.str('hello')), b.uint(5))), true)
  assert('LEN 0',    run(b.eq(b.len(b.str('')), b.uint(0))), true)
  assert('SLICE',    run(b.eq(b.slice(b.str('hello'), b.uint(1), b.uint(3)), b.str('el'))), true)
  assert('SLICE 0 end', run(b.eq(b.slice(b.str('abc'), b.uint(0), b.uint(3)), b.str('abc'))), true)
  assert('SEG _0',   run(b.eq(b.seg(b.str('a_b_c'), '_', b.intn(0)), b.str('a'))), true)
  assert('SEG _1',   run(b.eq(b.seg(b.str('a_b_c'), '_', b.intn(1)), b.str('b'))), true)
  assert('SEG _2',   run(b.eq(b.seg(b.str('a_b_c'), '_', b.intn(2)), b.str('c'))), true)
  assert('TONUM int', run(b.eq(b.tonum(b.str('42')), b.uint(42))), true)
  assert('TOSTR int', run(b.eq(b.tostr(b.uint(7)), b.str('7'))), true)
  assert('CONCAT',   run(b.eq(b.concat(b.str('foo'), b.str('bar')), b.str('foobar'))), true)
  assert('PRE yes',  run(b.pre(b.str('hello'), b.str('hel'))), true)
  assert('PRE no',   run(b.pre(b.str('hello'), b.str('ell'))), false)
  assert('SUF yes',  run(b.suf(b.str('hello'), b.str('llo'))), true)
  assert('SUF no',   run(b.suf(b.str('hello'), b.str('hel'))), false)
  assert('INC yes',  run(b.inc(b.str('hello world'), b.str('world'))), true)
  assert('INC no',   run(b.inc(b.str('hello'), b.str('xyz'))), false)
  assert('UPPER',    run(b.eq(b.upper(b.str('hello')), b.str('HELLO'))), true)
  assert('LOWER',    run(b.eq(b.lower(b.str('HELLO')), b.str('hello'))), true)
  assert('UPPER NOP', run(b.eq(b.upper(b.str('ABC')), b.str('ABC'))), true)

  // ── Type checks ──────────────────────────────────────────────────────────
  console.log('\n[type]')
  assert('ISS str',   run(b.iss(b.str('hi'))), true)
  assert('ISS num',   run(b.iss(b.uint(1))), false)
  assert('ISN int',   run(b.isn(b.uint(99))), true)
  assert('ISN str',   run(b.isn(b.str('3'))), false)
  assert('ISX null',  run(b.isx(b.null_())), true)
  assert('ISX str',   run(b.isx(b.str(''))), false)
  assert('ISB T',     run(b.isb(b.true_())), true)
  assert('ISB num',   run(b.isb(b.uint(1))), false)
  assert('LNG ok',    run(b.lng(b.str('hello'), 3, 10)), true)
  assert('LNG too short', run(b.lng(b.str('hi'), 3, 10)), false)
  assert('LNG too long',  run(b.lng(b.str('hello world extra'), 3, 10)), false)
  assert('LNG exact', run(b.lng(b.str('abc'), 3, 3)), true)

  // ── LET ──────────────────────────────────────────────────────────────────
  console.log('\n[let]')
  // LET(0, 42, eq(local[0], 42))
  assert('LET basic', run(b.let_(0, b.uint(42), b.eq(b.local(0), b.uint(42)))), true)
  // LET(0, 10, LET(1, 20, eq(add(local[0], local[1]), 30)))
  assert('LET nested', run(
    b.let_(0, b.uint(10),
      b.let_(1, b.uint(20),
        b.eq(b.add(b.local(0), b.local(1)), b.uint(30))
      )
    )
  ), true)
  // LET shadows: rebind slot 0
  assert('LET rebind', run(
    b.let_(0, b.uint(5),
      b.let_(0, b.uint(99),
        b.eq(b.local(0), b.uint(99))
      )
    )
  ), true)

  // ── IF ───────────────────────────────────────────────────────────────────
  console.log('\n[if]')
  assert('IF true branch',  run(b.if_(b.true_(), b.uint(1), b.uint(2))), true)  // 1 → truthy
  assert('IF false branch', run(b.if_(b.false_(), b.uint(1), b.fail())), false)  // FAIL → false

  // ── Register shorthands ──────────────────────────────────────────────────
  console.log('\n[reg shorthands]')
  // R0=key, R4=now
  assert('r0 shorthand', run(b.eq(b.r0(), b.str('buy')), ['buy']), true)
  assert('r4 shorthand', run(b.gt(b.r4(), b.uint(0)), [null, null, null, null, 1000]), true)
  assert('r5 shorthand', run(b.eq(b.r5(), b.str('pubkey')), [null,null,null,null,null,'pubkey']), true)
  // local shorthand via LET
  assert('local shorthand', run(
    b.let_(0, b.uint(77), b.eq(b.local(0), b.uint(77)))
  ), true)

  // ── SEGR macros ──────────────────────────────────────────────────────────
  console.log('\n[segr macros]')
  // R[0] = '5820000_ETH_USDT_buy_abc'
  var orderKey = '5820000_ETH_USDT_buy_abc'
  assert('SEGR[0,_,0]', run(b.eq(b.segr(0,'_',0), b.str('5820000')), [orderKey]), true)
  assert('SEGR[0,_,1]', run(b.eq(b.segr(0,'_',1), b.str('ETH')), [orderKey]), true)
  assert('SEGR[0,_,3]', run(b.eq(b.segr(0,'_',3), b.str('buy')), [orderKey]), true)
  assert('SEGRN[0,_,0]', run(b.gt(b.segrn(0,'_',0), b.uint(5000000)), [orderKey]), true)
  assert('SEGRN parse',  run(b.eq(b.segrn(0,'_',0), b.uint(5820000)), [orderKey]), true)

  // ── Registers ────────────────────────────────────────────────────────────
  console.log('\n[registers]')
  assert('REG null reg',   run(b.isx(b.reg(20)), []), true)  // unbound → null
  assert('REG str',        run(b.eq(b.reg(0), b.str('test')), ['test']), true)
  assert('REG int',        run(b.gt(b.reg(1), b.uint(0)), ['x', 42]), true)

  // ── Candle use case ───────────────────────────────────────────────────────
  // Simulate: R[4] = now (in ms), R[0] = key "5820000_ETH_USDT_buy_nonce"
  // Validate: candle_in_key within [current-100, current+2]
  // current candle = floor(R[4] / 300000)
  console.log('\n[candle use case]')

  var SIZE = 300000
  var now = 5820000 * SIZE + 1000  // middle of candle 5820000
  var candleNow = Math.floor(now / SIZE)  // = 5820000

  function candleTest(keyCandle, regs_now) {
    var t = now  // default
    if (regs_now !== undefined) t = regs_now
    var key = keyCandle + '_ETH_USDT_buy_abc'
    // LET(0, DIVU(R[4], 300000),     ← current candle
    //   LET(1, SEGRN(0, '_', 0),     ← candle from key
    //     AND(2,
    //       GTE(local[1], SUB(local[0], 100)),
    //       LTE(local[1], ADD(local[0], 2))
    //     )
    //   )
    // )
    var prog = b.let_(0,
      b.divu(b.r4(), b.uint(SIZE)),
      b.let_(1,
        b.segrn(0, '_', 0),
        b.and([
          b.gte(b.local(1), b.sub(b.local(0), b.uint(100))),
          b.lte(b.local(1), b.add(b.local(0), b.uint(2)))
        ])
      )
    )
    return pen.run(b.prog(prog), [key, null, null, null, t])
  }

  assert('candle exact',      candleTest(5820000), true)
  assert('candle +1',         candleTest(5820001), true)
  assert('candle +2',         candleTest(5820002), true)
  assert('candle +3 reject',  candleTest(5820003), false)
  assert('candle -1',         candleTest(5819999), true)
  assert('candle -100',       candleTest(5819900), true)
  assert('candle -101 reject',candleTest(5819899), false)
  assert('candle old reject', candleTest(100), false)
  assert('candle future big', candleTest(9999999), false)

  // ── Direction check (OR of segments) ─────────────────────────────────────
  console.log('\n[direction check]')
  function dirTest(key) {
    var prog = b.or([
      b.eq(b.segr(0,'_',3), b.str('buy')),
      b.eq(b.segr(0,'_',3), b.str('sell'))
    ])
    return pen.run(b.prog(prog), [key])
  }
  assert('dir buy',   dirTest('5820000_ETH_USDT_buy_abc'), true)
  assert('dir sell',  dirTest('5820000_ETH_USDT_sell_abc'), true)
  assert('dir other', dirTest('5820000_ETH_USDT_mint_abc'), false)

  // ── Order schema full ─────────────────────────────────────────────────────
  console.log('\n[order schema full]')
  function orderTest(key, regsNow) {
    var prog = b.and([
      b.let_(0,
        b.divu(b.r4(), b.uint(SIZE)),
        b.let_(1,
          b.segrn(0, '_', 0),
          b.and([
            b.gte(b.local(1), b.sub(b.local(0), b.uint(100))),
            b.lte(b.local(1), b.add(b.local(0), b.uint(2)))
          ])
        )
      ),
      b.or([
        b.eq(b.segr(0,'_',3), b.str('buy')),
        b.eq(b.segr(0,'_',3), b.str('sell'))
      ])
    ])
    return pen.run(b.prog(prog), [key, null, null, null, regsNow || now])
  }
  assert('order full ok',          orderTest('5820000_ETH_USDT_buy_abc'), true)
  assert('order bad dir',          orderTest('5820000_ETH_USDT_mint_abc'), false)
  assert('order stale candle',     orderTest('5819899_ETH_USDT_buy_abc'), false)
  assert('order future candle',    orderTest('5820003_ETH_USDT_sell_abc'), false)
  assert('order valid sell',       orderTest('5819999_ETH_USDT_sell_abc'), true)

  // ── Adversarial / edge cases ───────────────────────────────────────────────
  console.log('\n[adversarial]')
  // Bad version byte
  assertThrows('bad version', function() {
    pen.run(new Uint8Array([0x02, 0x23]), [])
  }, 'bad version')

  // Empty bytecode
  assertThrows('empty bytecode', function() {
    pen.run(new Uint8Array([]), [])
  }, '')

  // Max depth (nested NOT 70 deep)
  function deepNot(n, inner) {
    if (n === 0) return inner
    return b.not(deepNot(n - 1, inner))
  }
  // 30 NOTs of TRUE: 30 is even so double-negation = true
  assert('depth 30', pen.run(b.prog(deepNot(30, b.true_())), []), true)
  // 31 NOTs of TRUE = false
  assert('depth 31', pen.run(b.prog(deepNot(31, b.true_())), []), false)
  // 33 NOTs exceeds MAX_DEPTH=32, should throw
  assertThrows('max depth 33', function() {
    pen.run(b.prog(deepNot(33, b.true_())), [])
  }, 'max recursion')

  // Truncated string constant
  assertThrows('truncated str', function() {
    pen.run(new Uint8Array([0x01, 0x03, 10, 65, 65]), []) // len=10 but only 2 bytes
  }, '')

  // Out-of-bounds register → null (no throw)
  assert('oob reg → null', run(b.isx(b.reg(63)), []), true)

  // Division by zero
  assertThrows('div zero', function() {
    pen.run(b.prog(b.divu(b.uint(5), b.uint(0))), [])
  }, '')

  // String compare null vs str
  assert('null ne str',  run(b.ne(b.null_(), b.str('x'))), true)
  assert('null eq null', run(b.eq(b.null_(), b.null_())), true)

  // LET slot 31 (max - 1)
  assert('LET slot 31', run(b.let_(31, b.uint(999), b.eq(b.reg(128+31), b.uint(999)))), true)

  // AND with 0 args = true
  assert('AND 0 args', pen.run(b.prog([0x20, 0x00]), []), true)
  // OR with 0 args = false
  assert('OR 0 args', pen.run(b.prog([0x21, 0x00]), []), false)

  // ULEB128 multi-byte boundary: 128
  assert('UINT 128', run(b.eq(b.uint(128), b.uint(128))), true)
  // ULEB128 boundary: 16383
  assert('UINT 16383', run(b.eq(b.uint(16383), b.uint(16383))), true)
  // ULEB128 boundary: 16384
  assert('UINT 16384', run(b.gt(b.uint(16384), b.uint(16383))), true)

  // SLEB128 negative
  assert('INT -1 sleb',   run(b.eq(b.int(-1), b.int(-1))), true)
  assert('INT -128 sleb', run(b.lt(b.int(-128), b.int(-1))), true)

  // Inline shortcut boundary
  assert('inline 0', pen.run(new Uint8Array([0x01, 0xE0]), []), false)  // inline 0 is falsy
  assert('inline 15', run(b.eq([0xEF], b.uint(15))), true)

  // Long string (127 chars — MAX_STR=128)
  var longStr = 'x'.repeat(127)
  assert('LNG 127 max', run(b.lng(b.str(longStr), 1, 127)), true)
  // String truncated to MAX_STR=128 if longer
  var longStr2 = 'x'.repeat(200)
  assert('LNG truncated', run(b.lng(b.str(longStr2), 1, 128)), true)

  // ── Edge case tests (remaining dangerous scenarios) ─────────────────────
  console.log('\n[edge cases]')

  // Edge A: f64ToStr large finite float (val > i64.MAX ≈ 9.2e18)
  // @intFromFloat(1e20) into i64 is UB → should not crash/produce garbage
  assert('edgeA f64ToStr 9e18 exact', run(b.eq(b.tostr(b.f64(9e18)), b.str('9000000000000000000'))), true)
  assert('edgeA f64ToStr 1e20 no crash', (function() {
    try { return run(b.lng(b.tostr(b.f64(1e20)), 1, 30)) }
    catch(e) { return false }
  })(), true)
  assert('edgeA f64ToStr 1e50 no crash', (function() {
    try { return run(b.iss(b.tostr(b.f64(1e50)))) }
    catch(e) { return false }
  })(), true)

  // Edge B: SLICE with large float indices
  assert('edgeB SLICE large float', (function() {
    try { return run(b.eq(b.slice(b.str('hello'), b.f64(1e30), b.f64(1e30)), b.str(''))) }
    catch(e) { return 'threw:' + e.message }
  })(), true)
  assert('edgeB SLICE NaN start', (function() {
    try {
      var nan = [0x45].concat(b.uint(0), b.uint(0))  // DIVF(0,0) = NaN
      // SLICE("hello", NaN, 5) → NaN clamped to 0 → slice [0,5] = "hello"
      return run([0x60, 0x51].concat(b.str('hello'), nan, b.uint(5)))  // ISS(SLICE(...))
    } catch(e) { return 'threw:' + e.message }
  })(), true)
  assert('edgeB SLICE negative large', (function() {
    try { return run(b.eq(b.slice(b.str('hello'), b.f64(-1e30), b.f64(-1e30)), b.str(''))) }
    catch(e) { return 'threw:' + e.message }
  })(), true)

  // Edge C: SEG with large/NaN float index → ""
  assert('edgeC SEG large float idx', (function() {
    try { return run(b.eq(b.seg(b.str('a_b_c'), '_', b.f64(1e30)), b.str(''))) }
    catch(e) { return 'threw:' + e.message }
  })(), true)
  assert('edgeC SEG NaN idx', (function() {
    try {
      var nan = [0x45].concat(b.uint(0), b.uint(0))  // DIVF(0,0) = NaN
      // SEG with NaN idx → "" (NaN treated as out-of-range)
      return run([0x60, 0x52].concat(b.str('a_b_c'), [95], nan))  // ISS(SEG(...)) → true (returns "")
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // Edge D: skipExpr depth bomb — deeply nested skipped branch must not stack-overflow
  assert('edgeD skipExpr depth bomb', (function() {
    function deepAnd(n) {
      if (n === 0) return b.pass()
      return b.and([b.false_(), deepAnd(n - 1)])
    }
    try {
      pen.run(b.prog(deepAnd(200)), [])
      return false  // must throw MaxDepth, not succeed
    } catch(e) {
      return e.message.includes('max recursion')
    }
  })(), true)

  // Edge E: ABS(i64.MIN) — overflow: -i64.MIN = i64.MIN in two's complement
  assert('edgeE ABS i64.MIN positive', (function() {
    try {
      var i64min_sleb = [0x07, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x7F]
      return run([0x33, 0x46].concat(i64min_sleb).concat(b.uint(0)))  // GT(ABS(i64.MIN), 0)
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // Edge F: NEG(i64.MIN) — same overflow
  assert('edgeF NEG i64.MIN positive', (function() {
    try {
      var i64min_sleb = [0x07, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x7F]
      return run([0x33, 0x47].concat(i64min_sleb).concat(b.uint(0)))  // GT(NEG(i64.MIN), 0)
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // Edge G: UINT > i64.MAX — must not crash in any build mode
  assert('edgeG UINT u64.MAX no crash', (function() {
    try {
      var u64max = [0x04, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01]
      pen.run(b.prog(u64max), [])
      return true
    } catch(e) { return e.message.includes('runtime error') ? false : true }
  })(), true)

  // ── Bug regression tests ──────────────────────────────────────────────────
  // These tests EXPOSE known bugs. They FAIL on buggy builds and PASS after fixes.
  console.log('\n[bugs]')

  // Bug #1: IF evaluates both branches (no lazy eval)
  // IF(false, DIVU(1,0), PASS) — with lazy eval: skips then-branch, evaluates else=PASS → true
  assert('bug#1 IF lazy else', (function() {
    try { return run(b.if_(b.false_(), b.divu(b.uint(1), b.uint(0)), b.pass())) }
    catch(e) { return 'threw:' + e.message }
  })(), true)
  // IF(true, PASS, DIVU(1,0)) — with lazy eval: skips else-branch, evaluates then=PASS → true
  assert('bug#1 IF lazy then', (function() {
    try { return run(b.if_(b.true_(), b.pass(), b.divu(b.uint(1), b.uint(0)))) }
    catch(e) { return 'threw:' + e.message }
  })(), true)

  // Bug #2: AND no short-circuit (evaluates all args even after false)
  // AND(false, DIVU(1,0)) should return false (not throw)
  assert('bug#2 AND short-circuit', (function() {
    try { return run(b.and([b.false_(), b.divu(b.uint(1), b.uint(0))])) }
    catch(e) { return 'threw:' + e.message }
  })(), false)
  // OR(true, DIVU(1,0)) should return true (not throw)
  assert('bug#2 OR short-circuit', (function() {
    try { return run(b.or([b.true_(), b.divu(b.uint(1), b.uint(0))])) }
    catch(e) { return 'threw:' + e.message }
  })(), true)

  // Bug #3: SEGR/REG locals out-of-bounds
  // REG(128+32) accesses locals[32] which is out of bounds (MAX_LOCALS=32)
  // Should return null, not crash/garbage
  assert('bug#3 REG local oob → null', (function() {
    try {
      // 0x10 [160] = REG(128+32) → locals[32] OOB → vNull()
      return pen.run(b.prog([0x62, 0x10, 160]), [])  // ISX(REG(160)) → ISX(null) → true
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // SEGR with local reg index ≥ MAX_LOCALS — gets vNull from OOB guard, strSeg returns ""
  // ISX("") = false (empty string, not null), so the right check is ISS (is string)
  assert('bug#3 SEGR local oob → empty str', (function() {
    try {
      // 0x80 [160, '_', 0] = SEGR(local[32], '_', 0) → strSeg(null,...) → "" (TAG_STR)
      return pen.run(b.prog([0x60, 0x80, 160, 95, 0]), [])  // ISS(SEGR(...)) → true (is string "")
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // Bug #4: intToStr i64.MIN overflow
  // -(-9223372036854775808) = -9223372036854775808 in two's complement overflow
  // EQ(TOSTR(i64.MIN), STR("-9223372036854775808")) should be true
  assert('bug#4 intToStr i64.MIN', (function() {
    try {
      // i64.MIN via SLEB128: 0x80 0x80 0x80 0x80 0x80 0x80 0x80 0x80 0x80 0x7F (10 bytes)
      var i64min_sleb = [0x07, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x7F]
      // EQ(TOSTR(i64.MIN), STR("-9223372036854775808"))
      return run([0x30, 0x54].concat(i64min_sleb).concat(b.str('-9223372036854775808')))
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // Bug #5: f64ToStr Infinity undefined behavior
  // TOSTR(DIVF(1, 0)) should equal "Inf" not crash or produce garbage
  assert('bug#5 f64ToStr +Inf', (function() {
    try {
      // EQ(TOSTR(DIVF(1,0)), STR("Inf"))
      return run([0x30, 0x54, 0x45].concat(b.uint(1), b.uint(0)).concat(b.str('Inf')))
    } catch(e) { return 'threw:' + e.message }
  })(), true)
  // -Inf: TOSTR(DIVF(-1, 1)) ... actually DIVF(-1,0)
  assert('bug#5 f64ToStr -Inf', (function() {
    try {
      // NEG(DIVF(1,0)) = -Inf; EQ(TOSTR(-Inf), STR("-Inf"))
      return run([0x30, 0x54, 0x47, 0x45].concat(b.uint(1), b.uint(0)).concat(b.str('-Inf')))
    } catch(e) { return 'threw:' + e.message }
  })(), true)

  // Bug #6: ULEB128 shift overflow (shift: u6 wraps at ≥64)
  // A 10-byte ULEB128 has shift reaching 63 on byte 9 then +7 = 70 which wraps to 6
  // Construct a pathological ULEB: 10 continuation bytes
  assert('bug#6 ULEB128 shift overflow no UB', (function() {
    try {
      // 10 bytes of 0x81 (continuation) then 0x00: oversized ULEB
      // Should not crash or produce wildly wrong result
      var oversized = [0x04, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x81, 0x00]
      // Just must not throw/crash
      pen.run(b.prog(oversized), [])
      return true
    } catch(e) {
      // BadBytecode is acceptable — crash/UB is not
      return e.message.includes('runtime error') ? false : true
    }
  })(), true)

  // Bug #7: @intCast(u64 → i64) can panic on values > i64.MAX
  // UINT with value = 2^63 (i64.MAX+1) encodes as u64 but @intCast to i64 wraps/panics
  assert('bug#7 UINT i64.MAX+1 no panic', (function() {
    try {
      // 2^63 = 9223372036854775808 in ULEB128 (9 bytes)
      // 0x80 0x80 0x80 0x80 0x80 0x80 0x80 0x80 0x80 0x01
      var bc2 = [0x04, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]
      pen.run(b.prog(bc2), [])
      return true
    } catch(e) {
      return e.message.includes('runtime error') ? false : true
    }
  })(), true)

  // Bug #9: TONUM type inconsistency — str→vFloat, int→vInt causes ISN to differ
  // TONUM("42") should be numeric; ISN(TONUM("42")) = true
  assert('bug#9 TONUM str is numeric', run(b.isn(b.tonum(b.str('42')))), true)
  // The inconsistency: TONUM("42") returns vFloat but TONUM(42) returns vInt
  // They should compare equal
  assert('bug#9 TONUM("42") eq TONUM(42)', run(b.eq(b.tonum(b.str('42')), b.tonum(b.uint(42)))), true)

  // Bug #11: LNG(null, 0, 5) → should be false (null is not a string)
  // l = if (s.tag == TAG_STR) s.slen else 0  → 0 >= 0 → true  (BUG: should be false for non-string)
  assert('bug#11 LNG null 0 5 → false', run(b.lng(b.null_(), 0, 5)), false)

  // Bug #12: CONCAT non-string → should coerce or signal, not silently return ""
  // CONCAT(42, "bar") → "42bar" or at minimum not silently discard
  // Current behavior: returns "" because a.tag != TAG_STR
  assert('bug#12 CONCAT int+str → coerce', (function() {
    var result = run(b.eq(b.concat(b.uint(42), b.str('bar')), b.str('42bar')))
    return result
  })(), true)

  // Bug #13: SLICE with NaN indices (fromFloat(NaN))
  // SLICE(str, DIVF(0,0), DIVF(0,0)) — NaN as slice bounds
  assert('bug#13 SLICE NaN indices safe', (function() {
    try {
      // DIVF(0,0) = NaN; SLICE("hello", NaN, NaN) must not UB/crash
      var nanExpr = [0x45].concat(b.uint(0), b.uint(0))  // DIVF(0,0) = NaN
      run([0x51].concat(b.str('hello'), nanExpr, nanExpr))
      return true
    } catch(e) {
      return e.message.includes('runtime error') ? false : true
    }
  })(), true)

  // ── Print summary ─────────────────────────────────────────────────────────
  console.log('\n')
  console.log('─'.repeat(50))
  console.log('passed: ' + passed + '  failed: ' + failed + '  total: ' + (passed + failed))
  if (errors.length) {
    console.log('\nFailed tests:')
    errors.forEach(function(e) {
      console.log('  FAIL [' + e.name + '] got=' + JSON.stringify(e.got) + ' expected=' + JSON.stringify(e.expected))
    })
    process.exitCode = 1
  } else {
    console.log('\nAll tests passed.')
  }
}).catch(function(e) {
  console.error('WASM load failed:', e)
  process.exitCode = 1
})
