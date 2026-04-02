# pen

**PEN** — Predicate-Embedded Namespace. A tiny binary expression VM compiled to WASM.

Evaluates boolean predicates against a set of typed registers. Zero dependencies. Runs identically in Node.js and the browser.

```js
const pen = require('@akaoio/pen')
const b = pen.bc

await pen.ready

// price >= 100 AND price < 200
const expr = b.prog(b.and([
  b.gte(b.r1(), b.uint(100)),
  b.lt(b.r1(), b.uint(200)),
]))

pen.run(expr, [null, 150])  // true   (r1 = 150)
pen.run(expr, [null, 250])  // false  (r1 = 250)
```

## Install

```
npm install @akaoio/pen
```

## API

### `pen.ready` → `Promise`

WASM loads asynchronously. Await `pen.ready` once before calling `pen.run`.

### `pen.run(bytecode, regs)` → `boolean`

Evaluates a compiled predicate. Returns `true` or `false`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `bytecode` | `Uint8Array` | Compiled predicate (use `pen.bc.prog(...)`) |
| `regs` | `any[]` | Register values. Accepted types: `null`, `boolean`, integer `number`, float `number`, `string` |

Throws on fatal errors:
- `PEN: bad version byte` — bytecode built for a different ISA version
- `PEN: max recursion depth exceeded` — predicate nested too deeply (limit: 32)
- `PEN: runtime error` — malformed bytecode

### `pen.bc` — bytecode builder

Helpers that return byte arrays. Compose them into a program with `bc.prog(root)`.

#### Literals

| Builder | Opcode | Description |
|---------|--------|-------------|
| `bc.null_()` | `0x00` | null |
| `bc.true_()` | `0x01` | true |
| `bc.false_()` | `0x02` | false |
| `bc.str(s)` | `0x03` | UTF-8 string (max 128 bytes) |
| `bc.uint(n)` | `0x04` | unsigned integer (ULEB128) |
| `bc.int(n)` | `0x07` | signed integer (SLEB128) |
| `bc.intn(n)` | `0xE0+n` | inline uint 0–15 (single byte) |
| `bc.pass()` | `0x23` | always-true sentinel |
| `bc.fail()` | `0x24` | always-false sentinel |

#### Registers

| Builder | Description |
|---------|-------------|
| `bc.reg(n)` | register n (0–63) |
| `bc.r0()` .. `bc.r5()` | shorthand for registers 0–5 |
| `bc.local(n)` | local variable slot n (0–3) |

Conventional register layout: `r0` = key, `r1` = value, `r2` = soul, `r3` = state timestamp, `r4` = now, `r5` = public key.

#### Logic

| Builder | Description |
|---------|-------------|
| `bc.and(exprs)` | all exprs must be truthy |
| `bc.or(exprs)` | at least one expr truthy |
| `bc.not(expr)` | logical negation |
| `bc.if_(cond, then, else)` | conditional |

#### Comparison

`bc.eq`, `bc.ne`, `bc.lt`, `bc.gt`, `bc.lte`, `bc.gte` — each takes `(a, b)`.

Strings compare lexicographically. Mixed types compare numerically.

#### Arithmetic

`bc.add`, `bc.sub`, `bc.mul`, `bc.divu`, `bc.mod` — take `(a, b)`.
`bc.abs`, `bc.neg` — take `(a)`.

#### String ops

| Builder | Description |
|---------|-------------|
| `bc.len(a)` | byte length |
| `bc.slice(a, start, end)` | substring by byte index |
| `bc.seg(a, sep, idx)` | split by separator char, return segment at index |
| `bc.concat(a, b)` | concatenate |
| `bc.pre(a, b)` | true if `a` starts with `b` |
| `bc.suf(a, b)` | true if `a` ends with `b` |
| `bc.inc(a, b)` | true if `a` includes `b` |
| `bc.upper(a)` / `bc.lower(a)` | case conversion |
| `bc.tonum(a)` | parse string to number |
| `bc.tostr(a)` | convert value to string |

#### Type checks

| Builder | Description |
|---------|-------------|
| `bc.iss(a)` | is string |
| `bc.isn(a)` | is number |
| `bc.isx(a)` | is null |
| `bc.isb(a)` | is boolean |
| `bc.lng(a, min, max)` | string byte-length in `[min, max]` |

#### Locals (LET)

```js
bc.let_(slot, def, body)
```

Binds `def` to local slot `slot` (0–31), evaluates `body` with it in scope. Access the value in `body` with `bc.local(slot)`.

#### SEGR / SEGRN macros

Single-opcode shortcuts for the common pattern "split register by separator, get segment":

```js
bc.segr(reg, sep, idx)   // → string segment
bc.segrn(reg, sep, idx)  // → numeric segment (tonum applied)
```

`reg` is a register index (0–5 for the shorthand registers). `sep` is a single-character string. `idx` is the segment index.

## Limits

| Constant | Value | Notes |
|----------|-------|-------|
| `MAX_DEPTH` | 32 | max expression nesting |
| `MAX_STR` | 128 | max string length in bytes (longer inputs are truncated) |
| `MAX_LOCALS` | 32 | LET slots |
| `MAX_REGS` | 64 | registers per run |

## Build from source

Requires [Zig](https://ziglang.org) 0.15+:

```
npm run build
```

Produces `pen.wasm` (~24 KB, `ReleaseSmall`).

## Test

```
npm test
```

142 tests covering all opcodes, type coercion, edge cases, and adversarial inputs.

## License

MIT