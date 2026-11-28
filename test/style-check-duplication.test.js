import { describe, it, expect, beforeEach } from 'vitest'
import { tempDir, writeFiles } from '@nera-static/test-utils'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { findRepos } from '../scripts/style-check/repos.js'
import { declaredFunctions, exportEntryFiles, exportedNames, checkHelpers, STATUS } from '../scripts/style-check/helpers.js'
import { checkIdentical, contentHash } from '../scripts/style-check/identical.js'

const script = path.resolve(import.meta.dirname, '../scripts/style-check.js')

let workspace

// Writes files into the fake workspace: { 'repo/path': content }; objects become JSON.
const write = (files) => writeFiles(workspace, Object.fromEntries(
    Object.entries(files).map(([rel, content]) => [rel, typeof content === 'string' ? content : JSON.stringify(content)]),
))

const repos = () => findRepos(workspace).repos
const helper = (result, name) => result.findings.find((f) => f.item === name)
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } })

beforeEach(() => {
    workspace = tempDir('.nera-style-check-dup-')
})

describe('declaredFunctions', () => {
    it('finds column-0 function and arrow declarations, exported or not, with their line', () => {
        const text = [
            'export function a() {}',
            'async function b() {}',
            'export const c = (value) =>',
            '    value',
            'const d = async x => x',
            'const e = function () {}',
            'export default function f() {}',
            'function* g() {}',
        ].join('\n')
        expect(declaredFunctions(text)).toEqual([
            { name: 'a', line: 1 },
            { name: 'b', line: 2 },
            { name: 'c', line: 3 },
            { name: 'd', line: 5 },
            { name: 'e', line: 6 },
            { name: 'f', line: 7 },
            { name: 'g', line: 8 },
        ])
    })

    it('follows nested and multi-line parameters to the arrow, and skips what is no function', () => {
        const text = [
            'const withDefaults = ({ cwd = process.cwd(), app } = {}) => cwd',
            'const multi = (',
            '    first,',
            '    second',
            ') => first',
            'const grouped = (a || b)',
            'const value = 42',
            'const unclosed = (',
        ].join('\n')
        expect(declaredFunctions(text).map((d) => d.name)).toEqual(['withDefaults', 'multi'])
    })

    it('ignores declarations that are not at column 0', () => {
        expect(declaredFunctions('if (x) {\n    function inner() {}\n    const nested = () => 1\n}\n')).toEqual([])
    })
})

describe('plugin-utils exports', () => {
    it('reads the entry files of an exports map: string, conditions, subpaths; no patterns or non-JS', () => {
        expect(exportEntryFiles({ exports: './index.js' })).toEqual(['index.js'])
        expect(
            exportEntryFiles({
                exports: {
                    '.': { import: './index.js', types: './index.d.ts' },
                    './object': './src/object.js',
                    './fs/*': './src/fs/*.js',
                    './package.json': './package.json',
                },
            }),
        ).toEqual(['index.js', 'src/object.js'])
    })

    it('falls back to main, then index.js, without an exports map', () => {
        expect(exportEntryFiles({ main: './lib/main.js' })).toEqual(['lib/main.js'])
        expect(exportEntryFiles({})).toEqual(['index.js'])
    })

    it('collects declarations, export lists by their public name, and export * across files', () => {
        write({
            'pu/index.js': 'export function getConfig() {}\nconst x = 1\nconst y = 2\nexport { x, y as slug, x as default }\nexport * from \'./more.js\'\nexport * from \'pkg\'\n',
            'pu/more.js': 'export const escapeHtml = (t) => t\nexport * from \'./index.js\'\n',
        })
        expect([...exportedNames(path.join(workspace, 'pu/index.js'))].sort()).toEqual(['escapeHtml', 'getConfig', 'slug', 'x'])
    })
})

describe('helpers defined in 2+ repos', () => {
    beforeEach(() => {
        write({
            'nera-plugin-utils/package.json': { name: '@nera-static/plugin-utils', exports: { '.': './index.js', './object': './src/object.js' } },
            'nera-plugin-utils/index.js': 'export function getConfig() {}\n',
            'nera-plugin-utils/src/object.js': 'export const isPlainObject = (v) => v !== null\n',
            'nera-plugin-a/package.json': { name: '@nera-static/plugin-a' },
            'nera-plugin-a/index.js': 'export function getAppData() {}\nconst isPlainObject = (v) =>\n    v !== null\n',
            'nera-plugin-a/src/escape.js': 'export const escapeHtml = (t) => t\nfunction onlyHere() {}\n',
            'nera-plugin-a/views/search.js': 'const escapeHtml = (t) => t\n',
            'nera-plugin-b/package.json': { name: '@nera-static/plugin-b' },
            'nera-plugin-b/src/config.js': 'function getAppData() {}\nfunction isPlainObject(v) {}\nfunction escapeHtml(t) {}\n',
            'nera-plugin-b/src/more.js': 'function isPlainObject(v) {}\n',
            'nera-plugin-b/test/x.test.js': 'function onlyHere() {}\n',
            'nera-plugin-b/scripts/build.js': 'function onlyHere() {}\n',
            'nera-plugin-b/src/x.test.js': 'function onlyHere() {}\n',
            'nera-plugin-b/node_modules/dep/index.js': 'function onlyHere() {}\n',
            'nera-plugin-b/assets/lib.min.js': 'function onlyHere(){}\n',
        })
    })

    it('reports copies of plugin-utils exports (from its exports map) before candidates, with every file:line', () => {
        const result = checkHelpers(repos())
        expect(result.notes).toEqual([])
        expect(result.findings.map((f) => f.item)).toEqual(['isPlainObject', 'escapeHtml'])
        expect(helper(result, 'isPlainObject')).toMatchObject({
            check: 'helpers',
            repo: '(fleet)',
            status: STATUS.copy,
            detail: `${STATUS.copy}, 3 repos`,
            where: ['nera-plugin-a: index.js:2', 'nera-plugin-b: src/config.js:2, src/more.js:1', 'nera-plugin-utils: src/object.js:1'],
        })
        expect(helper(result, 'escapeHtml')).toMatchObject({
            status: STATUS.candidate,
            where: ['nera-plugin-a: src/escape.js:1, views/search.js:1', 'nera-plugin-b: src/config.js:3'],
        })
    })

    it('skips hook names, tests, scripts, dependencies and minified files, so a helper of one repo stays unreported', () => {
        const result = checkHelpers(repos())
        expect(helper(result, 'getAppData')).toBeUndefined()
        expect(helper(result, 'onlyHere')).toBeUndefined()
    })

    it('leaves the copies the copy check covers to it: plugin browser scripts and views/vendor outside plugins', () => {
        write({
            'nera-starter-blog/package.json': { name: '@nera-static/starter-blog' },
            'nera-starter-blog/theme/assets/js/search.js': 'const escapeHtml = (t) => t\nconst textNodes = () => []\n',
            'nera-website/package.json': { name: 'nera-website', private: true },
            'nera-website/views/vendor/plugin-a/x.js': 'function escapeHtml() {}\n',
            'nera-website/plugins/own/index.js': 'function textNodes() {}\n',
        })
        const result = checkHelpers(repos())
        expect(helper(result, 'escapeHtml').where.map((w) => w.split(':')[0])).toEqual(['nera-plugin-a', 'nera-plugin-b'])
        expect(helper(result, 'textNodes')).toBeUndefined()
    })

    it('includes nera-pro/file-service', () => {
        write({ 'nera-pro/file-service/package.json': { name: 'file-service', private: true }, 'nera-pro/file-service/src/site.js': 'function onlyHere() {}\n' })
        expect(helper(checkHelpers(repos()), 'onlyHere').where).toEqual(['nera-plugin-a: src/escape.js:2', 'nera-pro/file-service: src/site.js:1'])
    })

    it('without plugin-utils in the workspace, notes it and reports every helper as a candidate', () => {
        fs.rmSync(path.join(workspace, 'nera-plugin-utils'), { recursive: true })
        const result = checkHelpers(repos())
        expect(result.notes).toEqual([{ check: 'helpers', repo: 'nera-plugin-utils', detail: expect.stringContaining('not in the workspace') }])
        expect(result.findings.map((f) => f.status)).toEqual([STATUS.candidate, STATUS.candidate])
    })
})

describe('files that must be identical', () => {
    const repo = (name, pkg = {}) => ({ [`${name}/package.json`]: { name, ...pkg } })

    it('treats line endings and trailing whitespace at the end as the same content', () => {
        expect(contentHash('a\r\nb\n\n')).toBe(contentHash('a\nb'))
        expect(contentHash('a\nb')).not.toBe(contentHash('a\n b'))
    })

    it('reports deviants from the majority and missing files, and tabulates each group', () => {
        write({
            ...repo('nera-plugin-a'),
            ...repo('nera-plugin-b'),
            ...repo('nera-plugin-c'),
            ...repo('nera-plugin-d'),
            'nera-plugin-a/.github/dependabot.yml': 'same\n',
            'nera-plugin-b/.github/dependabot.yml': 'same\r\n',
            'nera-plugin-c/.github/dependabot.yml': 'other\n',
        })
        const result = checkIdentical(repos(), {}, [{ file: '.github/dependabot.yml' }])
        expect(result.findings).toEqual([
            { check: 'identical', repo: 'nera-plugin-c', item: '.github/dependabot.yml', detail: 'differs from the 2 of 3 repos that agree' },
            { check: 'identical', repo: 'nera-plugin-d', item: '.github/dependabot.yml', detail: 'missing (3 of 4 repos have it)' },
        ])
        expect(result.tables[0].rows).toEqual([['`.github/dependabot.yml`', 'repos', '4', '2', '2 of 3']])
    })

    it('calls a tie no majority and reports every holder', () => {
        write({ ...repo('nera-plugin-a'), ...repo('nera-plugin-b'), 'nera-plugin-a/f.yml': 'one', 'nera-plugin-b/f.yml': 'two' })
        const result = checkIdentical(repos(), {}, [{ file: 'f.yml' }])
        expect(result.findings.map((f) => [f.repo, f.detail])).toEqual([
            ['nera-plugin-a', 'no majority: 2 variants among 2 repos'],
            ['nera-plugin-b', 'no majority: 2 variants among 2 repos'],
        ])
        expect(result.tables[0].rows[0][4]).toBe('none (tie)')
    })

    it('compares per kind, limits to kinds and published packages, and can leave missing files to another check', () => {
        write({
            ...repo('nera-plugin-a'),
            ...repo('nera-plugin-b'),
            ...repo('nera-theme-a'),
            ...repo('nera-theme-b'),
            ...repo('nera-theme-c', { private: true }),
            'nera-plugin-a/eslint.config.js': 'plugin',
            'nera-plugin-b/eslint.config.js': 'plugin',
            'nera-theme-a/eslint.config.js': 'theme',
            'nera-theme-b/eslint.config.js': 'theme',
            'nera-theme-a/test/helpers/html.js': 'h',
            'nera-theme-b/test/helpers/html.js': 'h2',
            'nera-theme-c/test/helpers/html.js': 'h2',
            'nera-plugin-a/publish.yml': 'p',
            'nera-plugin-b/publish.yml': 'p',
            'nera-theme-a/publish.yml': 'p',
            'nera-theme-a/.husky/pre-push': 'x',
            'nera-theme-b/.husky/pre-push': 'x',
        })
        const result = checkIdentical(repos(), {}, [
            { file: 'eslint.config.js', perKind: true },
            { file: 'test/helpers/html.js', kinds: ['theme'] },
            { file: 'publish.yml', published: true },
            { file: '.husky/pre-push', missing: false },
        ])
        expect(result.findings.map((f) => [f.repo, f.item, f.detail])).toEqual([
            ['nera-theme-c', 'eslint.config.js', 'missing (2 of 3 theme repos have it)'],
            ['nera-theme-a', 'test/helpers/html.js', 'differs from the 2 of 3 theme repos that agree'],
            ['nera-theme-b', 'publish.yml', 'missing (3 of 4 repos have it)'],
        ])
        expect(result.tables[0].rows.map((row) => row.slice(0, 2))).toEqual([
            ['`eslint.config.js`', 'plugin repos'],
            ['`eslint.config.js`', 'theme repos'],
            ['`test/helpers/html.js`', 'theme repos'],
            ['`publish.yml`', 'repos'],
            ['`.husky/pre-push`', 'repos'],
        ])
    })

    it('compares nothing with fewer than two holders, and never the helper-scan-only part of nera-pro', () => {
        write({
            ...repo('nera-plugin-a'),
            ...repo('nera-plugin-b'),
            'nera-plugin-a/f.yml': 'one',
            'nera-pro/file-service/package.json': { name: 'file-service' },
            'nera-pro/file-service/f.yml': 'two',
        })
        const result = checkIdentical(repos(), {}, [{ file: 'f.yml' }])
        expect(result.findings).toEqual([])
        expect(result.tables[0].rows).toEqual([])
    })
})

describe('style-check.js duplication sections', () => {
    it('renders one row per helper, honours a (fleet) allow-list entry, and lists the identical files', () => {
        write({
            'nera-plugin-a/package.json': { name: '@nera-static/plugin-a' },
            'nera-plugin-a/index.js': 'function escapeHtml() {}\nfunction trimOrigin() {}\n',
            'nera-plugin-a/.github/FUNDING.yml': 'github: x\n',
            'nera-plugin-b/package.json': { name: '@nera-static/plugin-b' },
            'nera-plugin-b/index.js': 'function escapeHtml() {}\nfunction trimOrigin() {}\n',
            'nera-plugin-b/.github/FUNDING.yml': 'github: x\n',
            'nera-plugin-c/package.json': { name: '@nera-static/plugin-c' },
            'nera-plugin-c/.github/FUNDING.yml': 'github: y\n',
            'allow.yaml': '- check: helpers\n  repo: (fleet)\n  item: trimOrigin\n  reason: kept apart on purpose\n',
        })
        const result = run('--workspace', workspace, '--allow', path.join(workspace, 'allow.yaml'))
        expect(result.status).toBe(0)
        expect(result.stdout).toContain('## Helpers defined in 2+ repos (1)')
        expect(result.stdout).toContain('| `escapeHtml` | candidate | 2 | nera-plugin-a: index.js:1<br>nera-plugin-b: index.js:1 |')
        expect(result.stdout).toContain('| (fleet) | `trimOrigin` — candidate, 2 repos | kept apart on purpose |')
        expect(result.stdout).toContain('## Files that must be identical')
        expect(result.stdout).toContain('`.github/FUNDING.yml` — differs from the 2 of 3 repos that agree')
        expect(result.stdout.indexOf('## Helpers')).toBeLessThan(result.stdout.indexOf('## Hygiene: LICENSE'))
    })
})
