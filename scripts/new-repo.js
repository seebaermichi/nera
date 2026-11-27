#!/usr/bin/env node
// Writes the canonical file set of a new Nera repo from scripts/templates/ (roadmap
// "One handwriting", issue "Repo templates replace copy a sibling"): the common layer,
// then the layer of the kind, whose files replace common ones of the same path.
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

/** The folder prefix a repo of the kind carries: `nera-<kind>-`, or `nera-` for a tool. */
const kindPrefix = (kind) => (kind === 'tool' ? 'nera-' : `nera-${kind}-`)

const USAGE = 'usage: node scripts/new-repo.js <plugin|theme|starter|tool> <name> [--dir <parent>] [--description <text>]'

/**
 * The placeholder values for a repo: `{{name}}` the folder, `{{package}}` the npm name,
 * `{{short}}` the name without its kind prefix, `{{year}}`, `{{description}}`.
 * @param {{ kind: string, name: string, description?: string, year?: number }} options
 * @returns {Record<string, string>}
 */
export function placeholders({ kind, name, description, year = new Date().getFullYear() }) {
    const prefix = kindPrefix(kind)
    return {
        name,
        package: `@nera-static/${name.slice('nera-'.length)}`,
        short: name.slice(prefix.length),
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

/**
 * Render the file set of a kind in memory: common first, then the kind's layer, whose
 * files replace common ones at the same output path.
 * @returns {{ files: Map<string, { text: string, mode: number }>, errors: string[] }}
 */
export function renderTemplates({ kind, values, templates = TEMPLATES }) {
    const files = new Map()
    const errors = []
    for (const layer of ['common', kind]) {
        const dir = path.join(templates, layer)
        if (!fs.existsSync(dir)) continue
        for (const rel of listFiles(dir)) {
            const source = path.join(dir, rel)
            const { text, unresolved } = fill(fs.readFileSync(source, 'utf8'), values, rel.endsWith('.json'))
            for (const match of unresolved) errors.push(`${layer}/${rel}: unresolved placeholder ${match}`)
            files.set(outputPath(rel), { text, mode: fs.statSync(source).mode & 0o777 })
        }
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
