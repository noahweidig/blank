// Bumps the minor version in every file that carries it and prints the new
// version. Run by the release workflow on each push to main.
//   node scripts/bump-version.mjs        -> 0.2.0 from 0.1.8
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [major, minor] = pkg.version.split('.').map(Number)
const next = `${major}.${minor + 1}.0`
const prev = pkg.version

const edit = (path, fn) => writeFileSync(path, fn(readFileSync(path, 'utf8')))
const json = (path, fn) =>
  edit(path, (text) => JSON.stringify(fn(JSON.parse(text)), null, 2) + '\n')

json('package.json', (p) => ({ ...p, version: next }))
json('package-lock.json', (l) => {
  l.version = next
  if (l.packages?.['']) l.packages[''].version = next
  return l
})
json('src-tauri/tauri.conf.json', (c) => ({ ...c, version: next }))
// Only the [package] version, which is the first `version =` in the file.
edit('src-tauri/Cargo.toml', (t) => t.replace(/^version = ".*"$/m, `version = "${next}"`))
edit('src-tauri/Cargo.lock', (t) =>
  t.replace(/(name = "blank"\nversion = )"[^"]*"/, `$1"${next}"`),
)

for (const [path, needle] of [
  ['src-tauri/Cargo.toml', `version = "${next}"`],
  ['src-tauri/Cargo.lock', `name = "blank"\nversion = "${next}"`],
]) {
  if (!readFileSync(path, 'utf8').includes(needle)) {
    throw new Error(`${path} was not bumped from ${prev}`)
  }
}
console.log(next)
