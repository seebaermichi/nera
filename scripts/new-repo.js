#!/usr/bin/env node
// Writes the canonical file set of a new Nera repo from scripts/templates/ (roadmap
// "One handwriting", issue "Repo templates replace copy a sibling"): the common layer,
// then the layer of the kind, whose files replace common ones of the same path. The
// exceptions are package.json, which the kind's layer extends (see mergePackage), and
// .gitignore, to which it appends its `# <repo>-specific` block.
// Placeholders are filled in file names too (config/{{short}}.yaml).
// It writes files only: git init, snagio install, .env and the first commit stay with
// the workspace skill /new-repo.
//
// Usage: node scripts/new-repo.js <plugin|theme|starter|tool> <name> [--dir <parent>] [--description <text>]
//   <name>         the repo folder, e.g. nera-plugin-sitemap (nera-<kind>-… for plugin, theme
//                  and starter; nera-… for a tool)
//   --dir          the folder the repo is created in (default: the parent of generator/)
//   --description  package.json's description (default: one sentence naming the kind)
//
// Exit 0 when the repo is written; 1 when a template is broken (an unresolved
// placeholder), and then nothing is written; 2 on a usage error: an unknown kind, a
// name that does not fit the kind, or a target that already exists.
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

export const TEMPLATES = path.join(scriptDir, 'templates')

// The kinds `/new-repo` knows; a tool gets the common layer only.
export const KINDS = ['plugin', 'theme', 'starter', 'tool']

// Template files stored under a neutral name, because git would treat the real name
// specially inside generator: a tracked .gitignore would ignore parts of the tree, and
// a global excludes file may ignore .editorconfig.
export const RENAMES = { gitignore: '.gitignore', editorconfig: '.editorconfig' }

const PLACEHOLDER = /\{\{([a-z]+)\}\}/g
const NAME = /^nera-[a-z0-9]+(-[a-z0-9]+)*$/

const PACKAGE = 'package.json'

// A kind's file at this path is appended to the common one instead of replacing it:
// the canonical .gitignore stays verbatim, the kind adds its own block below it.
const APPENDED = '.gitignore'

// The top-level key order of package.json (2-plugin-anatomy §4.4): `nera` (a theme's
// core range, a starter's label) right after `engines`, the other requirement; keys
// not listed follow in the order the templates give them.
export const PACKAGE_KEYS = [
    'name', 'version', 'description', 'main', 'type', 'exports', 'bin', 'scripts', 'files',
    'keywords', 'author', 'license', 'repository', 'bugs', 'homepage', 'publishConfig',
    'sideEffects', 'engines', 'nera', 'peerDependencies', 'dependencies', 'devDependencies',
]

// Dependency maps, written in name order as npm writes them.
const DEPENDENCY_KEYS = ['peerDependencies', 'dependencies', 'devDependencies']

/** The folder prefix a repo of the kind carries: `nera-<kind>-`, or `nera-` for a tool. */
const kindPrefix = (kind) => (kind === 'tool' ? 'nera-' : `nera-${kind}-`)

const USAGE = 'usage: node scripts/new-repo.js <plugin|theme|starter|tool> <name> [--dir <parent>] [--description <text>]'

/**
 * `photo-blog` → `Photo blog`: dashes as spaces, the first letter capitalised, as the
 * fleet's starter labels are written ("Blog for developers", "Travel blog").
 */
const asTitle = (short) => {
    const words = short.replaceAll('-', ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The placeholder values for a repo: `{{name}}` the folder, `{{package}}` the npm name,
 * `{{short}}` the name without its kind prefix, `{{title}}` that short name as a
 * title (a starter's label), `{{year}}`, `{{description}}`.
 * @param {{ kind: string, name: string, description?: string, year?: number }} options
 * @returns {Record<string, string>}
 */
export function placeholders({ kind, name, description, year = new Date().getFullYear() }) {
    const short = name.slice(kindPrefix(kind).length)
    return {
        name,
        package: `@nera-static/${name.slice('nera-'.length)}`,
        short,
        title: asTitle(short),
        year: String(year),
        description: description || `A ${kind} for the Nera static site generator.`,
    }
}

/** Every file below `dir`, as paths relative to it with `/` separators, dotfiles included. */
function listFiles(dir) {
    return fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort()
}

/** The output path of a template file: a neutral basename gets its real name. */
function outputPath(rel) {
    const base = path.posix.basename(rel)
    return RENAMES[base] ? path.posix.join(path.posix.dirname(rel), RENAMES[base]) : rel
}

/**
 * Replace the placeholders of one template file. In JSON files the values are
 * JSON-escaped, so a description with a quote still yields valid package.json.
 * @returns {{ text: string, unresolved: string[] }}
 */
function fill(text, values, json) {
    const unresolved = []
    const out = text.replace(PLACEHOLDER, (match, key) => {
        if (!(key in values)) {
            unresolved.push(match)
            return match
        }
        return json ? JSON.stringify(values[key]).slice(1, -1) : values[key]
    })
    return { text: out, unresolved }
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The kind's package.json over the common one: objects (scripts, dependencies, …) are
 * merged key by key, everything else, arrays included, is replaced, so a kind lists
 * its whole `files` and `keywords`.
 */
export function mergePackage(base, overlay) {
    const merged = { ...base }
    for (const [key, value] of Object.entries(overlay)) {
        merged[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergePackage(base[key], value) : value
    }
    return merged
}

/** package.json in the key order of PACKAGE_KEYS, dependencies by name, as npm writes it. */
export function formatPackage(pkg) {
    const keys = Object.keys(pkg)
    const ordered = [
        ...PACKAGE_KEYS.filter((key) => keys.includes(key)),
        ...keys.filter((key) => !PACKAGE_KEYS.includes(key)),
    ]
    const out = {}
    for (const key of ordered) {
        out[key] = DEPENDENCY_KEYS.includes(key) && isPlainObject(pkg[key])
            ? Object.fromEntries(Object.entries(pkg[key]).sort(([a], [b]) => a.localeCompare(b, 'en')))
            : pkg[key]
    }
    return `${JSON.stringify(out, null, 4)}\n`
}

/**
 * Render the file set of a kind in memory: common first, then the kind's layer, whose
 * files replace common ones at the same output path, except package.json, whose layers
 * are merged (mergePackage) and written in the canonical key order (formatPackage), and
 * .gitignore, whose kind layer is appended to the common one after a blank line.
 * @returns {{ files: Map<string, { text: string, mode: number }>, errors: string[] }}
 */
export function renderTemplates({ kind, values, templates = TEMPLATES }) {
    const files = new Map()
    const errors = []
    const packages = []
    for (const layer of ['common', kind]) {
        const dir = path.join(templates, layer)
        if (!fs.existsSync(dir)) continue
        for (const rel of listFiles(dir)) {
            const source = path.join(dir, rel)
            const where = fill(rel, values, false)
            const { text, unresolved } = fill(fs.readFileSync(source, 'utf8'), values, rel.endsWith('.json'))
            for (const match of [...where.unresolved, ...unresolved]) {
                errors.push(`${layer}/${rel}: unresolved placeholder ${match}`)
            }
            const out = outputPath(where.text)
            const mode = fs.statSync(source).mode & 0o777
            if (out === APPENDED && files.has(out)) {
                const common = files.get(out)
                files.set(out, { text: `${common.text.replace(/\n*$/, '\n')}\n${text}`, mode: common.mode })
                continue
            }
            if (out !== PACKAGE) {
                files.set(out, { text, mode })
                continue
            }
            let pkg
            try {
                pkg = JSON.parse(text)
            } catch (error) {
                errors.push(`${layer}/${rel}: not valid JSON (${error.message})`)
                continue
            }
            packages.push({ pkg, mode })
        }
    }
    if (packages.length) {
        const pkg = packages.map((layer) => layer.pkg).reduce(mergePackage)
        files.set(PACKAGE, { text: formatPackage(pkg), mode: packages.at(-1).mode })
    }
    return { files, errors }
}

/**
 * Write a new repo of a kind.
 * @param {{ kind: string, name: string, dir: string, description?: string, year?: number,
 *   templates?: string }} options
 * @returns {{ code: number, target?: string, written?: string[], error?: string }}
 */
export function newRepo({ kind, name, dir, description, year, templates = TEMPLATES }) {
    if (!KINDS.includes(kind)) {
        return { code: 2, error: `new-repo: unknown kind "${kind}" (use ${KINDS.join(', ')})` }
    }
    const prefix = kindPrefix(kind)
    if (typeof name !== 'string' || !NAME.test(name) || !name.startsWith(prefix)) {
        return { code: 2, error: `new-repo: name "${name}" does not fit a ${kind}: use ${prefix}<name>, lower case, digits and dashes` }
    }
    const target = path.join(dir, name)
    if (fs.existsSync(target)) {
        return { code: 2, error: `new-repo: ${target} already exists; choose another name or remove it first` }
    }
    const values = placeholders({ kind, name, description, year })
    const { files, errors } = renderTemplates({ kind, values, templates })
    if (errors.length) {
        return { code: 1, error: `new-repo: nothing written, the templates are broken:\n${errors.join('\n')}` }
    }
    for (const [rel, { text, mode }] of files) {
        const file = path.join(target, rel)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, text, { mode })
    }
    return { code: 0, target, written: [...files.keys()] }
}

function parseArgs(argv) {
    const options = { dir: path.resolve(scriptDir, '../..') }
    const positional = []
    for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) {
            positional.push(argv[i])
            continue
        }
        const key = argv[i].slice(2)
        if (!['dir', 'description'].includes(key) || argv[i + 1] === undefined) {
            throw new Error(`new-repo: unknown or incomplete option ${argv[i]}\n${USAGE}`)
        }
        options[key] = key === 'dir' ? path.resolve(argv[++i]) : argv[++i]
    }
    if (positional.length !== 2) throw new Error(`new-repo: expected <kind> and <name>\n${USAGE}`)
    return { ...options, kind: positional[0], name: positional[1] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    let result
    try {
        result = newRepo(parseArgs(process.argv.slice(2)))
    } catch (error) {
        result = { code: 2, error: error.message }
    }
    if (result.error) console.error(result.error)
    if (result.code === 0) console.log(`new-repo: wrote ${result.written.length} files to ${result.target}`)
    process.exitCode = result.code
}
