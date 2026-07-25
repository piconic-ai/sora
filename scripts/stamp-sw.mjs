/*
 * Stamps public/sw.js's VERSION with a hash of the served assets, so any
 * deploy that changes an asset also changes the service worker's bytes —
 * which is what triggers browsers to install the new worker and rebuild
 * its cache snapshot (see public/sw.js). Runs from `npm run build` and
 * `npm run deploy`, after bf build + unocss have written their outputs.
 *
 * The hash is deterministic over file paths + contents, so rebuilding
 * unchanged sources leaves sw.js untouched.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const publicDir = fileURLToPath(new URL('../public', import.meta.url))
const swPath = join(publicDir, 'sw.js')

function collect(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue // build caches, .dev/, .assetsignore
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collect(path))
      continue
    }
    const rel = relative(publicDir, path)
    if (rel === 'sw.js') continue // the file being stamped
    if (rel.endsWith('.tsx')) continue // server-side marked templates, not browser-served
    files.push(rel)
  }
  return files.sort()
}

const hash = createHash('sha256')
for (const rel of collect(publicDir)) {
  hash.update(rel)
  hash.update(readFileSync(join(publicDir, rel)))
}
const version = hash.digest('hex').slice(0, 12)

const sw = readFileSync(swPath, 'utf8')
const stamped = sw.replace(/^const VERSION = '[^']*'$/m, `const VERSION = '${version}'`)
if (stamped === sw && !sw.includes(`'${version}'`)) {
  console.error('stamp-sw: VERSION line not found in public/sw.js')
  process.exit(1)
}
if (stamped !== sw) {
  writeFileSync(swPath, stamped)
  console.log(`stamp-sw: VERSION -> ${version}`)
} else {
  console.log(`stamp-sw: unchanged (${version})`)
}
