import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const releasesDir = path.join(rootDir, 'releases')

const version = process.argv[2]

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: npm run release:prepare -- <version>')
  process.exit(1)
}

mkdirSync(releasesDir, { recursive: true })

const packageJsonPath = path.join(rootDir, 'package.json')
const packageLockPath = path.join(rootDir, 'package-lock.json')
const manifestPath = path.join(rootDir, 'src', 'manifest.json')
const notesPath = path.join(releasesDir, `v${version}.md`)
const archivePath = path.join(releasesDir, `request-forwarder-v${version}.zip`)

updateJsonVersion(packageJsonPath, version)
updatePackageLockVersion(packageLockPath, version)
updateJsonVersion(manifestPath, version)

if (!existsSync(notesPath)) {
  writeFileSync(notesPath, createReleaseNotesTemplate(version), 'utf8')
}

run('npm', ['run', 'lint'])
run('npm', ['test'])
run('npm', ['run', 'build'])

if (existsSync(archivePath)) {
  rmSync(archivePath)
}

run('zip', ['-rq', archivePath, 'dist'], { cwd: rootDir })

const ghCommand =
  `gh release create v${version} ${path.relative(rootDir, archivePath)} ` +
  `--title "v${version}" --notes-file ${path.relative(rootDir, notesPath)}`

console.log('')
console.log('Release prepared successfully.')
console.log(`Version: ${version}`)
console.log(`Notes: ${path.relative(rootDir, notesPath)}`)
console.log(`Archive: ${path.relative(rootDir, archivePath)}`)
console.log('GitHub release command:')
console.log(ghCommand)

function updateJsonVersion(filePath, nextVersion) {
  const json = JSON.parse(readFileSync(filePath, 'utf8'))
  json.version = nextVersion
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

function updatePackageLockVersion(filePath, nextVersion) {
  const json = JSON.parse(readFileSync(filePath, 'utf8'))
  json.version = nextVersion
  if (json.packages?.['']) {
    json.packages[''].version = nextVersion
  }
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
}

function createReleaseNotesTemplate(nextVersion) {
  return `# Request Forwarder v${nextVersion}

Release date: ${new Date().toISOString().slice(0, 10)}

## Summary

Describe the main release outcome here.

## Highlights

- Highlight 1
- Highlight 2
- Highlight 3

## Validation

- npm run lint
- npm run test
- npm run build

## GitHub Release Assets

- releases/request-forwarder-v${nextVersion}.zip
- releases/v${nextVersion}.md

## Publish Command

\`\`\`bash
gh release create v${nextVersion} releases/request-forwarder-v${nextVersion}.zip --title "v${nextVersion}" --notes-file releases/v${nextVersion}.md
\`\`\`
`
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  })
}
