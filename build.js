// build.js — build pen.wasm using the local Zig installation
const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ZIG = 'C:\\Users\\x\\AppData\\Local\\Microsoft\\WinGet\\Packages\\zig.zig_Microsoft.Winget.Source_8wekyb3d8bbwe\\zig-x86_64-windows-0.15.2\\zig.exe'

const src = path.join(__dirname, 'src', 'wasm.zig')
const out = path.join(__dirname, 'pen.wasm')

const args = [
  'build-exe',
  src,
  '-target', 'wasm32-freestanding',
  '-O', 'ReleaseSmall',
  '-fno-entry',
  '-rdynamic',
  '--export=run',
  '--export=alloc',
  '--export=free',
  '--export=mem',
  '-femit-bin=' + out,
]

console.log('building pen.wasm...')
const result = spawnSync(ZIG, args, { stdio: 'inherit', cwd: __dirname })
if (result.status !== 0) {
  process.exit(result.status || 1)
}
const size = fs.statSync(out).size
console.log(`pen.wasm built: ${size} bytes`)
