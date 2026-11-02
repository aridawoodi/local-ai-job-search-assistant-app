#!/usr/bin/env node
/**
 * Packaging entrypoint — builds the Electron app then runs electron-builder.
 *
 * Usage:
 *   node scripts/package.mjs              # mac + win (default)
 *   node scripts/package.mjs --mac        # macOS universal dmg + zip
 *   node scripts/package.mjs --win        # Windows nsis + zip (x64)
 *   node scripts/package.mjs --dir        # unpackaged dirs only (fast smoke)
 *
 * Artifacts land in ./release/. On macOS, Windows NSIS may require Wine;
 * the zip target is always attempted as a portable artifact.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const wantMac = args.includes('--mac') || (!args.includes('--win') && !args.includes('--dir'))
const wantWin = args.includes('--win') || (!args.includes('--mac') && !args.includes('--dir'))
const dirOnly = args.includes('--dir')
// If both flags omitted and not --dir, package both (matches npm run dist).
const both = !args.includes('--mac') && !args.includes('--win') && !args.includes('--dir')

function run(cmd, cmdArgs) {
  console.log(`\n> ${cmd} ${cmdArgs.join(' ')}`)
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    process.exit(r.status || 1)
  }
}

run('npm', ['run', 'typecheck'])
run('npm', ['run', 'build'])

const eb = ['npx', 'electron-builder']
if (dirOnly) {
  eb.push('--dir')
  if (process.platform === 'darwin') eb.push('--mac')
  else if (process.platform === 'win32') eb.push('--win')
} else {
  if (both || wantMac) eb.push('--mac')
  if (both || wantWin) eb.push('--win')
}

const built = spawnSync(eb[0], eb.slice(1), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
})

const release = join(process.cwd(), 'release')
if (existsSync(release)) {
  console.log('\nArtifacts in release/:')
  for (const name of readdirSync(release)) {
    const p = join(release, name)
    try {
      const st = statSync(p)
      if (st.isFile()) {
        console.log(`  - ${name} (${(st.size / (1024 * 1024)).toFixed(1)} MB)`)
      } else {
        console.log(`  - ${name}/`)
      }
    } catch {
      console.log(`  - ${name}`)
    }
  }
}

if (built.status !== 0) {
  console.error(
    '\nelectron-builder exited non-zero. Mac artifacts may still exist; Windows NSIS on macOS often needs Wine — use `npm run dist:win` on Windows or rely on the zip target / CI.'
  )
  process.exit(built.status || 1)
}

console.log('\nPackaging complete.')
