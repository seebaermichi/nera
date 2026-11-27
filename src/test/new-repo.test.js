import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { formatPackage, mergePackage, newRepo, PACKAGE_KEYS, placeholders, TEMPLATES } from '../../scripts/new-repo.js'

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/new-repo.js')

// The common set every kind gets, as written into the new repo.
const COMMON = [
    '.editorconfig',
    '.github/FUNDING.yml',
    '.github/dependabot.yml',
    '.github/workflows/publish.yml',
    '.github/workflows/test.yml',
    '.gitignore',
    '.husky/pre-commit',
    '.husky/pre-push',
    'CHANGELOG.md',
    'LICENSE',
    'eslint.config.js',
    'package.json',
    'vitest.config.js',
]

// What the plugin kind adds to the common set (2-plugin-anatomy §4.1).
const PLUGIN = [
    'README.md',
    'config/demo.yaml',
    'index.js',
    'src/config.js',
    'test/config.test.js',
    'test/index.test.js',
    'test/shipped-config.test.js',
]

const PLACEHOLDER = /\{\{[a-z]+\}\}/

/** Every file below `dir`, relative to it. */
const filesBelow = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .sort()

let parent

const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
const read = (rel) => fs.readFileSync(path.join(parent, 'nera-demo', rel), 'utf8')

beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), '.nera-new-repo-'))
})

afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true })
})

describe('placeholders', () => {
    it('derives the package and short name from the folder per kind', () => {
        expect(placeholders({ kind: 'plugin', name: 'nera-plugin-sitemap', year: 2030 })).toEqual({
            name: 'nera-plugin-sitemap',
            package: '@nera-static/plugin-sitemap',
            short: 'sitemap',
            year: '2030',
            description: 'A plugin for the Nera static site generator.',
        })
        expect(placeholders({ kind: 'tool', name: 'nera-stan', description: 'Lint.' })).toMatchObject({
            package: '@nera-static/stan',
            short: 'stan',
            description: 'Lint.',
        })
    })
})

describe('new-repo.js tool', () => {
    it('writes the common set with every placeholder resolved', () => {
        const result = run('tool', 'nera-demo', '--dir', parent, '--description', 'A "demo" tool.')
        expect(result.status).toBe(0)
        expect(result.stdout).toContain(`wrote ${COMMON.length} files`)

        expect(filesBelow(path.join(parent, 'nera-demo'))).toEqual([...COMMON].sort())
        for (const rel of COMMON) expect(read(rel), rel).not.toMatch(PLACEHOLDER)
    })

    it('fills package.json and LICENSE from the name, year and description', () => {
        run('tool', 'nera-demo', '--dir', parent, '--description', 'A "demo" tool.')
        const pkg = JSON.parse(read('package.json'))
        expect(pkg).toMatchObject({
            name: '@nera-static/demo',
            description: 'A "demo" tool.',
            scripts: { lint: 'nera-stan', test: 'vitest run' },
            engines: { node: '>=22.12.0' },
            repository: { url: 'git+https://github.com/seebaermichi/nera-demo.git' },
        })
        expect(read('LICENSE')).toContain(`Copyright (c) ${new Date().getFullYear()} Michael Becker`)
        expect(read('CHANGELOG.md')).toContain('First release of `@nera-static/demo`.')
    })

    it('copies the files that need no placeholder verbatim', () => {
        run('tool', 'nera-demo', '--dir', parent)
        const common = path.join(TEMPLATES, 'common')
        expect(read('.gitignore')).toBe(fs.readFileSync(path.join(common, 'gitignore'), 'utf8'))
        expect(read('.editorconfig')).toBe(fs.readFileSync(path.join(common, 'editorconfig'), 'utf8'))
        expect(read('.github/workflows/test.yml')).toContain('${{ matrix.node-version }}')
        expect(read('eslint.config.js')).toBe('import nera from \'@nera-static/stan\'\n\nexport default [...nera]\n')
        expect(fs.statSync(path.join(parent, 'nera-demo', '.husky/pre-commit')).mode & 0o111).not.toBe(0)
    })
})

describe('new-repo.js plugin', () => {
    const plugin = (rel) => fs.readFileSync(path.join(parent, 'nera-plugin-demo', rel), 'utf8')

    it('writes the common set plus the plugin tree, the config file named after the plugin', () => {
        const result = run('plugin', 'nera-plugin-demo', '--dir', parent)
        expect(result.status).toBe(0)
        const written = filesBelow(path.join(parent, 'nera-plugin-demo'))
        expect(written).toEqual([...COMMON, ...PLUGIN].sort())
        for (const rel of written) expect(plugin(rel), rel).not.toMatch(PLACEHOLDER)
    })

    it('merges the plugin package.json over the common one in the canonical key order', () => {
        run('plugin', 'nera-plugin-demo', '--dir', parent)
        const text = plugin('package.json')
        const pkg = JSON.parse(text)
        expect(Object.keys(pkg)).toEqual(PACKAGE_KEYS.filter((key) => key in pkg))
        expect(Object.keys(pkg)).not.toContain('bin')
        expect(pkg).toMatchObject({
            name: '@nera-static/plugin-demo',
            main: 'index.js',
            exports: { '.': './index.js' },
            scripts: { lint: 'nera-stan', test: 'vitest run', prepare: 'husky' },
            files: ['config', 'index.js', 'src', 'CHANGELOG.md'],
            keywords: ['nera', 'nera-plugin', 'static-site-generator'],
            sideEffects: false,
            dependencies: { '@nera-static/plugin-utils': '^1.8.0' },
        })
        expect(Object.keys(pkg.devDependencies)).toEqual([
            '@nera-static/core', '@nera-static/stan', '@nera-static/test-utils', 'husky', 'vitest',
        ])
        expect(text).toBe(formatPackage(pkg))
    })

    it('names the logger, the config file and the app key after the plugin', () => {
        run('plugin', 'nera-plugin-demo', '--dir', parent)
        expect(plugin('index.js')).toContain('createLogger(\'plugin-demo\')')
        expect(plugin('src/config.js')).toContain('export const CONFIG_NAME = \'demo\'')
        expect(plugin('config/demo.yaml')).toContain('property: \'demo\'')
        expect(plugin('README.md')).toMatch(/^# @nera-static\/plugin-demo\n\n\[!\[Test\]/)
    })
})

describe('mergePackage and formatPackage', () => {
    it('merges objects key by key and replaces arrays and values', () => {
        const base = { files: ['CHANGELOG.md'], scripts: { lint: 'nera-stan' }, version: '1.0.0' }
        const overlay = { files: ['index.js'], scripts: { test: 'vitest run' }, version: '2.0.0' }
        expect(mergePackage(base, overlay)).toEqual({
            files: ['index.js'],
            scripts: { lint: 'nera-stan', test: 'vitest run' },
            version: '2.0.0',
        })
        expect(base.scripts).toEqual({ lint: 'nera-stan' })
    })

    it('orders the keys canonically, unknown keys last, dependencies by name', () => {
        const text = formatPackage({ nera: {}, dependencies: { b: '1', a: '1' }, scripts: { z: 'z', a: 'a' }, name: 'x' })
        expect(Object.keys(JSON.parse(text))).toEqual(['name', 'scripts', 'dependencies', 'nera'])
        expect(Object.keys(JSON.parse(text).dependencies)).toEqual(['a', 'b'])
        expect(Object.keys(JSON.parse(text).scripts)).toEqual(['z', 'a'])
        expect(text.endsWith('}\n')).toBe(true)
    })
})

describe('new-repo.js refusals', () => {
    it('exits 2 for an existing target and leaves it alone', () => {
        fs.mkdirSync(path.join(parent, 'nera-demo'))
        fs.writeFileSync(path.join(parent, 'nera-demo', 'keep.txt'), 'mine')
        const result = run('tool', 'nera-demo', '--dir', parent)
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('already exists')
        expect(fs.readdirSync(path.join(parent, 'nera-demo'))).toEqual(['keep.txt'])
    })

    it('exits 2 for an unknown kind', () => {
        const result = run('library', 'nera-demo', '--dir', parent)
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('unknown kind "library"')
        expect(fs.existsSync(path.join(parent, 'nera-demo'))).toBe(false)
    })

    it('exits 2 for a name that does not fit the kind', () => {
        const result = run('plugin', 'nera-theme-demo', '--dir', parent)
        expect(result.status).toBe(2)
        expect(result.stderr).toContain('use nera-plugin-<name>')
    })

    it('exits 2 for missing arguments and unknown options', () => {
        expect(run('tool').status).toBe(2)
        expect(run('tool', 'nera-demo', '--force').stderr).toContain('unknown or incomplete option --force')
    })

    it('exits 1 and writes nothing when a template holds an unknown placeholder', () => {
        const templates = path.join(parent, 'templates')
        fs.mkdirSync(path.join(templates, 'common'), { recursive: true })
        fs.writeFileSync(path.join(templates, 'common', 'README.md'), '# {{package}}\n\n{{tagline}}\n')
        const result = newRepo({ kind: 'tool', name: 'nera-demo', dir: parent, templates })
        expect(result.code).toBe(1)
        expect(result.error).toContain('common/README.md: unresolved placeholder {{tagline}}')
        expect(fs.existsSync(path.join(parent, 'nera-demo'))).toBe(false)
    })

    it('exits 1 and writes nothing for an unknown placeholder in a file name or a broken package.json', () => {
        const templates = path.join(parent, 'templates')
        fs.mkdirSync(path.join(templates, 'common', 'config'), { recursive: true })
        fs.writeFileSync(path.join(templates, 'common', 'config', '{{slug}}.yaml'), '')
        fs.writeFileSync(path.join(templates, 'common', 'package.json'), '{ "name": }')
        const result = newRepo({ kind: 'tool', name: 'nera-demo', dir: parent, templates })
        expect(result.code).toBe(1)
        expect(result.error).toContain('common/config/{{slug}}.yaml: unresolved placeholder {{slug}}')
        expect(result.error).toContain('common/package.json: not valid JSON')
        expect(fs.existsSync(path.join(parent, 'nera-demo'))).toBe(false)
    })
})
