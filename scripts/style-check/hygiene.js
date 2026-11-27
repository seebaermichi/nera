// Per-repo hygiene checks for scripts/style-check.js, until `nera-stan` checks them
// inside each repo. Every check takes the repos of findRepos() and returns
// `{ findings, notes, tables }`:
//   findings  { check, repo, item, detail } — a gap; the allow-list matches check+repo+item
//   notes     { check, repo, detail }       — could not check (missing input)
//   tables    { caption, header, rows }     — context printed with the section
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

// The canonical .gitignore every new repo starts from (`/new-repo`), relative to the
// workspace root. A CI clone of the public fleet does not have it.
export const CANONICAL_GITIGNORE = '.claude/skills/new-repo/gitignore.txt'

// Lines a repo of a kind may add to the canonical .gitignore (`/new-repo` Step 2).
export const GITIGNORE_ADDITIONS = {
    all: ['/design'],
    theme: ['test/site/public'],
    starter: ['test/site/public'],
}

const LICENSE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt']
const LICENSE_LINE = /^Copyright \(c\) \d{4}(-\d{4})? Michael Becker$/
const HUSKY_HOOKS = ['.husky/pre-commit', '.husky/pre-push']

const result = () => ({ findings: [], notes: [], tables: [] })
const checked = (repos) => repos.filter((repo) => repo.hygiene)

/** The LICENSE carries `Copyright (c) <year> Michael Becker`, not the template's placeholders. */
export function checkLicense(repos) {
    const out = result()
    for (const repo of checked(repos)) {
        const file = LICENSE_FILES.map((name) => path.join(repo.dir, name)).find((p) => fs.existsSync(p))
        const add = (detail) => out.findings.push({ check: 'license', repo: repo.name, item: 'LICENSE', detail })
        if (!file) {
            add('missing')
            continue
        }
        const line = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).find((l) => /copyright/i.test(l))
        if (!line) add('no copyright line')
        else if (/\[.*\]/.test(line)) add(`placeholder \`${line}\``)
        else if (!LICENSE_LINE.test(line)) add(`unexpected format \`${line}\``)
    }
    return out
}

/**
 * Which of the husky hook files are committed. In a git checkout only tracked files
 * count (an untracked hook never reaches a clone); outside one, files on disk.
 * `null` when git cannot read the checkout.
 */
function committedHooks(dir) {
    if (!fs.existsSync(path.join(dir, '.git'))) {
        return HUSKY_HOOKS.filter((hook) => fs.existsSync(path.join(dir, hook)))
    }
    try {
        const tracked = execFileSync('git', ['-C', dir, 'ls-files', '--', ...HUSKY_HOOKS], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        return tracked.split('\n').filter(Boolean)
    } catch {
        return null
    }
}

/** A `prepare` script that installs husky and the committed pre-commit + pre-push hooks, both or neither. */
export function checkHusky(repos) {
    const out = result()
    for (const repo of checked(repos)) {
        if (!repo.pkg) {
            out.notes.push({ check: 'husky', repo: repo.name, detail: repo.pkgError || 'no package.json' })
            continue
        }
        const prepare = /\bhusky\b/.test(repo.pkg.scripts?.prepare || '')
        const hooks = committedHooks(repo.dir)
        if (!hooks) {
            out.notes.push({ check: 'husky', repo: repo.name, detail: 'git ls-files failed in the checkout' })
            continue
        }
        const missing = HUSKY_HOOKS.filter((hook) => !hooks.includes(hook))
        const add = (detail) => out.findings.push({ check: 'husky', repo: repo.name, item: 'husky', detail })
        if (prepare && missing.length) {
            add(`inert: \`prepare\` runs husky, but ${missing.join(' and ')} not committed`)
        } else if (!prepare && hooks.length) {
            add(`never installed: ${hooks.join(' and ')} committed, but no \`prepare\` script runs husky`)
        } else if (!prepare) {
            add('none: no `prepare` script, no pre-commit or pre-push hook')
        }
    }
    return out
}

/**
 * `engines.node` is present. The spellings differ on purpose (they follow each repo's
 * real dependencies, D7), so they are listed with their repos, not judged.
 */
export function checkEngines(repos) {
    const out = result()
    const spellings = new Map()
    for (const repo of checked(repos)) {
        if (!repo.pkg) {
            out.notes.push({ check: 'engines', repo: repo.name, detail: repo.pkgError || 'no package.json' })
            continue
        }
        const node = repo.pkg.engines?.node
        if (typeof node !== 'string' || !node.trim()) {
            out.findings.push({ check: 'engines', repo: repo.name, item: 'engines.node', detail: 'missing' })
            continue
        }
        if (!spellings.has(node)) spellings.set(node, [])
        spellings.get(node).push(repo.name)
    }
    const rows = [...spellings].sort((a, b) => b[1].length - a[1].length).map(([node, names]) => [`\`${node}\``, String(names.length), names.join(', ')])
    out.tables.push({ caption: 'Spellings of `engines.node`', header: ['engines.node', 'repos', 'which'], rows })
    return out
}

/** A published package (not `private`) with a `files` list ships its CHANGELOG.md. */
export function checkChangelogFiles(repos) {
    const out = result()
    for (const repo of checked(repos)) {
        if (!repo.pkg || repo.pkg.private) continue
        const add = (detail) => out.findings.push({ check: 'changelog-files', repo: repo.name, item: 'CHANGELOG.md', detail })
        if (!fs.existsSync(path.join(repo.dir, 'CHANGELOG.md'))) add('missing')
        else if (Array.isArray(repo.pkg.files) && !repo.pkg.files.includes('CHANGELOG.md')) add('not in `files`')
    }
    return out
}

/** Every .js file of a plugin's shipped source: index.js and src/, without tests. */
function sourceFiles(dir) {
    const files = []
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === 'test') continue
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.name.endsWith('.js')) files.push(full)
        }
    }
    if (fs.existsSync(path.join(dir, 'index.js'))) files.push(path.join(dir, 'index.js'))
    if (fs.existsSync(path.join(dir, 'src'))) walk(path.join(dir, 'src'))
    return files
}

/**
 * A plugin whose source reads `<name>.yaml` ships `config/<name>.yaml` as its
 * documented defaults: the file exists and `files` includes it.
 */
export function checkPluginConfig(repos) {
    const out = result()
    for (const repo of checked(repos).filter((r) => r.kind === 'plugin')) {
        const name = repo.name.replace(/^nera-plugin-/, '')
        const item = `config/${name}.yaml`
        const reads = sourceFiles(repo.dir).some((file) => fs.readFileSync(file, 'utf8').includes(`${name}.yaml`))
        if (!reads) continue
        const add = (detail) => out.findings.push({ check: 'plugin-config', repo: repo.name, item, detail })
        if (!fs.existsSync(path.join(repo.dir, item))) {
            add('read by the plugin, but not in the repo')
        } else if (!repo.pkg) {
            out.notes.push({ check: 'plugin-config', repo: repo.name, detail: repo.pkgError || 'no package.json' })
        } else if (Array.isArray(repo.pkg.files) && !repo.pkg.files.some((entry) => ['config', 'config/', item].includes(entry))) {
            add('not in `files`, so it does not ship')
        }
    }
    return out
}

/** The meaningful lines of a .gitignore, without a trailing slash so `public` and `public/` agree. */
export function gitignoreLines(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => (line.length > 1 ? line.replace(/\/$/, '') : line))
}

/**
 * The repo's .gitignore against the canonical one of `/new-repo`: canonical lines it
 * lacks, and lines beyond it and its kind's additions (D7). Without the canonical file
 * (a CI clone) the check is skipped with one note, never a finding per repo.
 * @param {Array} repos
 * @param {{ workspace: string }} ctx
 */
export function checkGitignore(repos, { workspace }) {
    const out = result()
    const canonicalFile = path.join(workspace, CANONICAL_GITIGNORE)
    if (!fs.existsSync(canonicalFile)) {
        out.notes.push({ check: 'gitignore', repo: '(all)', detail: `canonical ${CANONICAL_GITIGNORE} not found, so no repo was compared` })
        return out
    }
    const canonical = new Set(gitignoreLines(fs.readFileSync(canonicalFile, 'utf8')))
    for (const repo of checked(repos)) {
        const file = path.join(repo.dir, '.gitignore')
        const add = (item, detail) => out.findings.push({ check: 'gitignore', repo: repo.name, item, detail })
        if (!fs.existsSync(file)) {
            add('.gitignore', 'missing')
            continue
        }
        const lines = new Set(gitignoreLines(fs.readFileSync(file, 'utf8')))
        const allowed = new Set([...canonical, ...GITIGNORE_ADDITIONS.all, ...(GITIGNORE_ADDITIONS[repo.kind] || [])])
        for (const line of canonical) if (!lines.has(line)) add(line, 'missing')
        for (const line of lines) if (!allowed.has(line)) add(line, 'extra')
    }
    return out
}

// The hygiene sections of the report, in order.
export const HYGIENE_CHECKS = [
    { id: 'license', title: 'Hygiene: LICENSE', run: checkLicense },
    { id: 'husky', title: 'Hygiene: husky', run: checkHusky },
    { id: 'engines', title: 'Hygiene: engines', run: checkEngines },
    { id: 'changelog-files', title: 'Hygiene: CHANGELOG.md in `files`', run: checkChangelogFiles },
    { id: 'plugin-config', title: 'Hygiene: plugin `config/<name>.yaml`', run: checkPluginConfig },
    { id: 'gitignore', title: 'Hygiene: .gitignore', run: checkGitignore },
]
