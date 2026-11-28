// Repo discovery for scripts/style-check.js: which workspace folders are Nera repos,
// what kind each one is, and which checks apply to it.
import fs from 'node:fs'
import path from 'node:path'

// Folders that look like Nera repos but are not checked, with the reason the report
// prints for them.
export const EXCLUDED = {
    'nera-platform': 'planning docs only, no code',
    'nera-plugin-main-navigation': 'archived',
}

// nera-pro is a private app: only its Node format plane takes part, and only in the
// helper scan (its own conventions are not the fleet's).
const NERA_PRO_PART = 'file-service'

/**
 * The kind of a repo, from its folder name, as `/new-repo` decides it.
 * `nera-plugin-utils` is a library despite its prefix.
 * @param {string} name folder name
 * @returns {'plugin'|'theme'|'starter'|'site'|'library'}
 */
export function repoKind(name) {
    if (name === 'nera-plugin-utils') return 'library'
    if (name.startsWith('nera-plugin-')) return 'plugin'
    if (name.startsWith('nera-theme-')) return 'theme'
    if (name.startsWith('nera-starter-')) return 'starter'
    if (name === 'nera-website') return 'site'
    return 'library'
}

/**
 * Read a package.json. A missing file is `{ pkg: null }`, an unreadable or
 * non-object one also carries an `error` the checks report as "could not check".
 * @param {string} dir
 * @returns {{ pkg: object|null, error?: string }}
 */
export function readPackage(dir) {
    const file = path.join(dir, 'package.json')
    if (!fs.existsSync(file)) return { pkg: null }
    try {
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
        if (pkg && typeof pkg === 'object' && !Array.isArray(pkg)) return { pkg }
        return { pkg: null, error: 'package.json is not an object' }
    } catch (error) {
        return { pkg: null, error: `package.json unreadable: ${error.message}` }
    }
}

const isDir = (p) => {
    try {
        return fs.statSync(p).isDirectory()
    } catch {
        return false
    }
}

const isRepoFolder = (dir) =>
    fs.existsSync(path.join(dir, 'package.json')) || fs.existsSync(path.join(dir, '.git'))

/**
 * Find the Nera repos in a workspace: every folder `generator` or `nera-*` with a
 * package.json or a git checkout (so a fresh `/new-repo` repo such as nera-stan
 * counts before it has a package.json), except the EXCLUDED ones. nera-pro takes
 * part only through nera-pro/file-service, and only in the helper scan.
 * @param {string} workspace absolute path of the workspace root
 * @returns {{ repos: Array<{ name: string, dir: string, kind: string, pkg: object|null,
 *   pkgError?: string, hygiene: boolean }>, skipped: Array<{ name: string, reason: string }> }}
 */
export function findRepos(workspace) {
    const repos = []
    const skipped = []
    const names = fs.readdirSync(workspace).filter((name) => name === 'generator' || name.startsWith('nera-')).sort()

    for (const name of names) {
        const dir = path.join(workspace, name)
        if (!isDir(dir)) continue
        if (EXCLUDED[name]) {
            skipped.push({ name, reason: EXCLUDED[name] })
            continue
        }
        if (name === 'nera-pro') {
            const partDir = path.join(dir, NERA_PRO_PART)
            if (isRepoFolder(partDir)) {
                const { pkg, error } = readPackage(partDir)
                repos.push({ name: `${name}/${NERA_PRO_PART}`, dir: partDir, kind: 'app', pkg, pkgError: error, hygiene: false })
            }
            skipped.push({ name, reason: `private app: only ${NERA_PRO_PART}/, helper scan only` })
            continue
        }
        if (!isRepoFolder(dir)) {
            skipped.push({ name, reason: 'no package.json and no git checkout' })
            continue
        }
        const { pkg, error } = readPackage(dir)
        repos.push({ name, dir, kind: repoKind(name), pkg, pkgError: error, hygiene: true })
    }

    return { repos, skipped }
}
