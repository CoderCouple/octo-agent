#!/usr/bin/env node
// Shows download counts for all GitHub releases of Broomy.
// Usage: node scripts/download-stats.cjs
// Requires: gh CLI authenticated with access to Broomy-AI/broomy

const { execSync } = require('child_process')

const REPO = 'Broomy-AI/broomy'

try {
  execSync('gh --version', { stdio: 'ignore' })
} catch {
  console.error('Error: GitHub CLI (gh) is not installed or not in PATH.')
  process.exit(1)
}

const json = execSync(
  `gh api repos/${REPO}/releases --paginate`,
  { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
)
const releases = JSON.parse(json)

if (releases.length === 0) {
  console.log('No releases found.')
  process.exit(0)
}

// Build rows: one per release with per-asset breakdown
const rows = []
for (const release of releases) {
  const tag = release.tag_name
  const date = release.published_at ? release.published_at.slice(0, 10) : 'draft'
  const pre = release.prerelease ? ' (pre)' : ''
  const assets = (release.assets || []).filter(a => a.download_count > 0)
  const total = assets.reduce((sum, a) => sum + a.download_count, 0)

  rows.push({ tag, date, pre, total, assets })
}

// Print summary table
const tagWidth = Math.max(7, ...rows.map(r => (r.tag + r.pre).length))
const PAD = 2

console.log()
console.log(
  'Release'.padEnd(tagWidth + PAD) +
  'Date'.padEnd(12 + PAD) +
  'Downloads'
)
console.log('-'.repeat(tagWidth + 12 + 10 + PAD * 2))

let grandTotal = 0
for (const r of rows) {
  const label = (r.tag + r.pre).padEnd(tagWidth + PAD)
  const date = r.date.padEnd(12 + PAD)
  console.log(`${label}${date}${r.total}`)
  grandTotal += r.total
}

console.log('-'.repeat(tagWidth + 12 + 10 + PAD * 2))
console.log(
  'Total'.padEnd(tagWidth + PAD) +
  ''.padEnd(12 + PAD) +
  String(grandTotal)
)

// Per-asset breakdown
console.log()
console.log('Breakdown by asset:')
console.log()

for (const r of rows) {
  if (r.assets.length === 0) continue
  console.log(`  ${r.tag}${r.pre}`)
  for (const a of r.assets) {
    console.log(`    ${a.name.padEnd(50)} ${a.download_count}`)
  }
}

console.log()
