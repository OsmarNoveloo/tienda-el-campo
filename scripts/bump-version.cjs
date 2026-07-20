const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const [major, minor, patch] = pkg.version.split('.').map(Number)
pkg.version = `${major}.${minor}.${patch + 1}`

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
execSync('git add package.json', { stdio: 'inherit' })

console.log(`Version bumped to ${pkg.version}`)
