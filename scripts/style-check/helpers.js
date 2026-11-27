// Cross-repo helper scan for scripts/style-check.js (D3): top-level functions defined in
// two or more repos, either copies of a `@nera-static/plugin-utils` export or candidates
// for one. Regex over column-0 declarations, not an AST: good enough to see the drift,
// and a false positive costs one allow-list line.
import fs from 'fs'
import path from 'path'

export const PLUGIN_UTILS_REPO = 'nera-plugin-utils'

// Contract names every plugin, script or CLI defines on purpose.
export const IGNORED_NAMES = new Set(['getAppData', 'getMetaData', 'getAssets', 'run', 'main'])

// Folders that hold no shipped source: tests, build output, internal files, caches,
// and the repo's own maintenance scripts.
export const SKIP_DIRS = new Set(['node_modules', 'test', 'tests', 'public', 'dist', 'plans', 'scripts', '.theme-demos', '.git', '.claude', '.nera-cache', 'coverage'])

const SOURCE_FILE = /\.(m|c)?js$/
// Shipped source, not a minified bundle or a test file kept next to the code.
const isScanned = (name) => SOURCE_FILE.test(name) && !/\.min\.js$|\.(test|spec)\.(m|c)?js$/.test(name)
const NAME = '[A-Za-z_$][\\w$]*'
const FUNCTION_DECL = new RegExp(`^(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s*\\*?\\s*(${NAME})\\s*\\(`, 'gm')
const CONST_DECL = new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+(${NAME})\\s*=\\s*(?:async\\s+)?(function\\b|${NAME}\\s*=>|\\()`, 'gm')

/** The index just past the parenthesis that closes the one at `open`, or -1. */
function closingParen(text, open) {
    let depth = 0
    for (let i = open; i < text.length; i++) {
        if (text[i] === '(') depth++
        else if (text[i] === ')' && --depth === 0) return i + 1
    }
    return -1
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length

/**
 * The top-level functions a source text declares, with their line:
 * `function x(`, `const x = function`, `const x = y =>` and `const x = (…) =>`
 * (parameters may span lines and nest parentheses), each optionally exported.
 * @param {string} text
 * @returns {Array<{ name: string, line: number }>}
 */
export function declaredFunctions(text) {
    const found = []
    for (const match of text.matchAll(FUNCTION_DECL)) found.push({ name: match[1], line: lineAt(text, match.index) })
    for (const match of text.matchAll(CONST_DECL)) {
        if (match[2] === '(') {
            const end = closingParen(text, match.index + match[0].length - 1)
            if (end === -1 || !/^\s*=>/.test(text.slice(end))) continue
        }
        found.push({ name: match[1], line: lineAt(text, match.index) })
    }
    return found.sort((a, b) => a.line - b.line)
}

/** Every file below `dir` whose name passes `keep`, skipping SKIP_DIRS; paths relative to `dir`. */
function listFiles(dir, keep) {
    const files = []
    const walk = (current) => {
        let entries
        try {
            entries = fs.readdirSync(current, { withFileTypes: true })
        } catch {
            return
        }
        for (const entry of entries) {
            if (SKIP_DIRS.has(entry.name)) continue
            const full = path.join(current, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (entry.isFile() && keep(entry.name)) files.push(path.relative(dir, full))
        }
    }
    walk(dir)
    return files.sort()
}

/**
 * The browser scripts the plugins ship in `views/` (`search.js`, `contact-form.js`).
 * Their copies in sites and starters belong to the copy check, not to this scan.
 */
export function pluginBrowserScripts(repos) {
    const names = new Set()
    for (const repo of repos.filter((r) => r.kind === 'plugin')) {
        const views = path.join(repo.dir, 'views')
        if (!fs.existsSync(views)) continue
        for (const name of fs.readdirSync(views)) if (SOURCE_FILE.test(name)) names.add(name)
    }
    return names
}

/**
 * Whether a file of a repo is a copy the copy check covers: anything under
 * `views/vendor/`, or a plugin browser script, in a repo that is not a plugin.
 */
function isCoveredCopy(repo, rel, browserScripts) {
    if (repo.kind === 'plugin') return false
    const parts = rel.split(path.sep)
    if (parts.some((part, i) => part === 'views' && parts[i + 1] === 'vendor')) return true
    return browserScripts.has(path.basename(rel))
}

/**
 * The JavaScript entry files of a package's `exports` map: a string, a conditional
 * object (any depth), or subpath keys. Without `exports`, `main`, else `index.js`.
 * Patterns (`./*`) and non-JavaScript targets are left out.
 * @param {object} pkg
 * @returns {string[]} paths relative to the package root
 */
export function exportEntryFiles(pkg) {
    const targets = []
    const collect = (value) => {
        if (typeof value === 'string') targets.push(value)
        else if (Array.isArray(value)) value.forEach(collect)
        else if (value && typeof value === 'object') Object.values(value).forEach(collect)
    }
    collect(pkg.exports ?? pkg.main ?? 'index.js')
    return [...new Set(targets.filter((t) => SOURCE_FILE.test(t) && !t.includes('*')).map((t) => path.normalize(t)))]
}

const EXPORT_DECL = new RegExp(`^export\\s+(?:async\\s+)?(?:function\\s*\\*?|const|let|var|class)\\s*(${NAME})`, 'gm')
const EXPORT_LIST = /^export\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/gm
const EXPORT_STAR = /^export\s*\*\s*from\s*['"]([^'"]+)['"]/gm

/**
 * The public names a module exports: declarations, `export { a, b as c }` (the
 * public name `c`), and everything of `export * from './x.js'`, followed relatively.
 * @param {string} file absolute path
 * @param {Set<string>} [seen] files already read (re-export cycles)
 * @returns {Set<string>}
 */
export function exportedNames(file, seen = new Set()) {
    const names = new Set()
    if (seen.has(file) || !fs.existsSync(file)) return names
    seen.add(file)
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(EXPORT_DECL)) names.add(match[1])
    for (const match of text.matchAll(EXPORT_LIST)) {
        for (const part of match[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()
            if (name && name !== 'default') names.add(name)
        }
    }
    for (const match of text.matchAll(EXPORT_STAR)) {
        if (!match[1].startsWith('.')) continue
        for (const name of exportedNames(path.resolve(path.dirname(file), match[1]), seen)) names.add(name)
    }
    return names
}

/**
 * The names `@nera-static/plugin-utils` exports, read from the entry files of its
 * `exports` map, so subpath exports count as soon as they exist. `null` when the repo
 * or its package.json is not in the workspace.
 */
function pluginUtilsExports(repos) {
    const repo = repos.find((r) => r.name === PLUGIN_UTILS_REPO)
    if (!repo?.pkg) return null
    const names = new Set()
    for (const entry of exportEntryFiles(repo.pkg)) {
        for (const name of exportedNames(path.join(repo.dir, entry))) names.add(name)
    }
    return names
}

export const STATUS = {
    copy: 'copy of a plugin-utils export',
    candidate: 'candidate',
}

/**
 * Helpers defined in two or more repos. One finding per name (repo `(fleet)`, since
 * the duplication is the fleet's, not one repo's), with every `repo: file:line`.
 * Copies of plugin-utils exports come first, then candidates by how many repos
 * define them. plugin-utils itself counts as a repo: one copy of an export is a finding.
 */
export function checkHelpers(repos) {
    const out = { findings: [], notes: [], tables: [] }
    const utils = pluginUtilsExports(repos)
    if (!utils) out.notes.push({ check: 'helpers', repo: PLUGIN_UTILS_REPO, detail: 'not in the workspace, so every helper is reported as a candidate' })
    const browserScripts = pluginBrowserScripts(repos)

    const byName = new Map()
    for (const repo of repos) {
        for (const rel of listFiles(repo.dir, isScanned)) {
            if (isCoveredCopy(repo, rel, browserScripts)) continue
            const text = fs.readFileSync(path.join(repo.dir, rel), 'utf8')
            for (const { name, line } of declaredFunctions(text)) {
                if (IGNORED_NAMES.has(name)) continue
                if (!byName.has(name)) byName.set(name, new Map())
                const where = byName.get(name)
                if (!where.has(repo.name)) where.set(repo.name, [])
                where.get(repo.name).push(`${rel.split(path.sep).join('/')}:${line}`)
            }
        }
    }

    for (const [name, where] of byName) {
        if (where.size < 2) continue
        const status = utils?.has(name) ? STATUS.copy : STATUS.candidate
        out.findings.push({
            check: 'helpers',
            repo: '(fleet)',
            item: name,
            detail: `${status}, ${where.size} repos`,
            status,
            where: [...where].map(([repo, places]) => `${repo}: ${places.join(', ')}`),
        })
    }
    const rank = (f) => (f.status === STATUS.copy ? 0 : 1)
    out.findings.sort((a, b) => rank(a) - rank(b) || b.where.length - a.where.length || a.item.localeCompare(b.item))
    return out
}

// The report table of this section: one row per helper, not per repo.
export const HELPER_COLUMNS = {
    header: ['helper', 'status', 'repos', 'defined at'],
    row: (f) => [`\`${f.item}\``, f.status, String(f.where.length), f.where.join('<br>')],
}
