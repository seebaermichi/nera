// Copied plugin files in starters and sites, for scripts/style-check.js (D4): every
// published plugin view under `[theme/]views/vendor/plugin-<x>/` and every copied
// client script (`search.js`, `contact-form.js`) under `[theme/]assets/js/`, compared
// with the plugin's own file at the version the consumer's package-lock.json locks.
// The plugin file is read from the consumer's node_modules when it holds exactly that
// version, else from the tag `v<version>` in the sibling plugin repo, never from the
// sibling's working tree (which may be ahead of what the consumer installs).
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { contentHash } from './identical.js'

// The repo kinds that copy plugin files into themselves.
export const COPY_KINDS = ['starter', 'site']

// Where a plugin's publish-template script puts its files: themed sites first, the
// deprecated root folders of a legacy site second (plugin-utils publishAllTemplates /
// publishAsset).
const VENDOR_DIRS = ['theme/views/vendor', 'views/vendor']
const SCRIPT_DIRS = ['theme/assets/js', 'assets/js']

// Client scripts a plugin publishes next to its views: consumer file name → plugin.
// Inside the plugin package both live in `views/`.
export const COPIED_SCRIPTS = {
    'search.js': 'plugin-search',
    'contact-form.js': 'plugin-contact-form',
}

const SCOPE = '@nera-static/'

const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

function listFiles(dir, rel = '') {
    const out = []
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
        const child = rel ? `${rel}/${entry.name}` : entry.name
        if (entry.isDirectory()) out.push(...listFiles(dir, child))
        else if (entry.isFile()) out.push(child)
    }
    return out.sort()
}

/**
 * The copied plugin files in one consumer repo.
 * @param {string} dir the consumer repo
 * @returns {Array<{ file: string, plugin: string, source: string }>} `file` relative
 *   to the repo, `plugin` the short name (`plugin-search`), `source` the path inside
 *   the plugin package
 */
export function findCopies(dir) {
    const copies = []
    for (const vendor of VENDOR_DIRS) {
        const root = path.join(dir, vendor)
        if (!fs.existsSync(root)) continue
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory() || !entry.name.startsWith('plugin-')) continue
            for (const rel of listFiles(path.join(root, entry.name))) {
                copies.push({ file: `${vendor}/${entry.name}/${rel}`, plugin: entry.name, source: `views/${rel}` })
            }
        }
    }
    for (const scripts of SCRIPT_DIRS) {
        for (const [name, plugin] of Object.entries(COPIED_SCRIPTS)) {
            if (fs.existsSync(path.join(dir, scripts, name))) copies.push({ file: `${scripts}/${name}`, plugin, source: `views/${name}` })
        }
    }
    return copies
}

/**
 * The version of `@nera-static/<plugin>` a lockfile locks (v2/v3 `packages`, v1
 * `dependencies`), or null when it locks none.
 * @param {object} lock the parsed package-lock.json
 * @param {string} plugin short name, `plugin-search`
 */
export function lockedVersion(lock, plugin) {
    const name = SCOPE + plugin
    return lock?.packages?.[`node_modules/${name}`]?.version || lock?.dependencies?.[name]?.version || null
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
        return null
    }
}

function git(dir, args) {
    try {
        return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
        return null
    }
}

/**
 * Where to read a plugin's files at one version. node_modules counts only when its
 * package.json names exactly that version (a stale install would compare against the
 * wrong file); else the tag `v<version>` of the sibling repo `nera-<plugin>`.
 * @returns {{ label: string, read: (source: string) => string|null } | { error: string }}
 *   `read` returns the file's text, or null when the plugin has no such file
 */
export function pluginSource({ consumerDir, workspace, plugin, version }) {
    const installed = path.join(consumerDir, 'node_modules', SCOPE + plugin)
    const installedVersion = readJson(path.join(installed, 'package.json'))?.version
    if (installedVersion === version) {
        return {
            label: 'node_modules',
            read: (source) => {
                const file = path.join(installed, source)
                return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
            },
        }
    }
    const sibling = path.join(workspace, `nera-${plugin}`)
    const tag = `v${version}`
    const why = installedVersion ? `node_modules holds ${installedVersion}` : 'not in node_modules'
    if (!fs.existsSync(sibling)) return { error: `${why}, and no sibling repo nera-${plugin}` }
    if (git(sibling, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]) === null) {
        return { error: `${why}, and nera-${plugin} has no tag ${tag}` }
    }
    return {
        label: `git tag ${tag}`,
        read: (source) => git(sibling, ['show', `${tag}:${source}`]),
    }
}

/**
 * Every copied plugin file of the starters and sites against the locked plugin
 * version: a finding when it differs or the plugin has no such file, a note when it
 * cannot be checked, and a context table per repo and plugin of what was compared.
 * @param {Array} repos the repos of findRepos()
 * @param {{ workspace: string }} ctx
 */
export function checkCopies(repos, { workspace }) {
    const out = {
        findings: [],
        notes: [],
        tables: [{ caption: 'Copies compared', header: ['repo', 'plugin', 'read from', 'files', 'same', 'differs', 'no such file'], rows: [] }],
    }
    for (const repo of repos) {
        if (!repo.hygiene || !COPY_KINDS.includes(repo.kind)) continue
        const copies = findCopies(repo.dir)
        if (!copies.length) continue
        const lock = readJson(path.join(repo.dir, 'package-lock.json'))
        if (!lock) {
            out.notes.push({ repo: repo.name, detail: `${count(copies.length, 'copied plugin file')}, but no readable package-lock.json to name the installed versions` })
            continue
        }
        const byPlugin = new Map()
        for (const copy of copies) {
            if (!byPlugin.has(copy.plugin)) byPlugin.set(copy.plugin, [])
            byPlugin.get(copy.plugin).push(copy)
        }
        for (const [plugin, files] of [...byPlugin].sort(([a], [b]) => a.localeCompare(b))) {
            const version = lockedVersion(lock, plugin)
            if (!version) {
                out.notes.push({ repo: repo.name, detail: `${count(files.length, 'copied file')} of ${plugin}, but package-lock.json locks no ${SCOPE}${plugin}` })
                continue
            }
            const source = pluginSource({ consumerDir: repo.dir, workspace, plugin, version })
            if (source.error) {
                out.notes.push({ repo: repo.name, detail: `${plugin}@${version} (${count(files.length, 'file')}): ${source.error}` })
                continue
            }
            const counts = { same: 0, differs: 0, missing: 0 }
            const at = `\`${plugin}@${version}\` (${source.label})`
            for (const copy of files) {
                const original = source.read(copy.source)
                if (original === null) {
                    counts.missing++
                    out.findings.push({ check: 'copies', repo: repo.name, item: copy.file, detail: `${at} has no \`${copy.source}\`` })
                } else if (contentHash(original) === contentHash(fs.readFileSync(path.join(repo.dir, copy.file), 'utf8'))) {
                    counts.same++
                } else {
                    counts.differs++
                    out.findings.push({ check: 'copies', repo: repo.name, item: copy.file, detail: `differs from ${at}` })
                }
            }
            out.tables[0].rows.push([repo.name, `${plugin}@${version}`, source.label, String(files.length), String(counts.same), String(counts.differs), String(counts.missing)])
        }
    }
    return out
}
