import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { findRepos } from '../../scripts/style-check/repos.js'
import { findCopies, lockedVersion, pluginSource, checkCopies } from '../../scripts/style-check/copies.js'

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/style-check.js')

let workspace

// Writes files into the fake workspace: { 'repo/path': content }; objects become JSON.
function write(files) {
    for (const [rel, content] of Object.entries(files)) {
        const file = path.join(workspace, rel)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
    }
}

const lock = (versions) => ({
    lockfileVersion: 3,
    packages: Object.fromEntries(Object.entries(versions).map(([plugin, version]) => [`node_modules/@nera-static/${plugin}`, { version }])),
})

const installed = (repo, plugin, version, files = {}) => ({
    [`${repo}/node_modules/@nera-static/${plugin}/package.json`]: { name: `@nera-static/${plugin}`, version },
    ...Object.fromEntries(Object.entries(files).map(([rel, text]) => [`${repo}/node_modules/@nera-static/${plugin}/${rel}`, text])),
})

const gitIn = (dir, ...args) =>
    execFileSync('git', ['-C', dir, ...args], {
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    })

// A sibling plugin repo with one commit per version, each tagged v<version>, then an
// untagged working tree change on top, so a read from the working tree would show.
function siblingRepo(plugin, versions, workingTree = {}) {
    const dir = path.join(workspace, `nera-${plugin}`)
    fs.mkdirSync(dir, { recursive: true })
    gitIn(dir, 'init', '-q', '-b', 'main')
    for (const [version, files] of Object.entries(versions)) {
        write({ [`nera-${plugin}/package.json`]: { name: `@nera-static/${plugin}`, version }, ...prefix(`nera-${plugin}`, files) })
        gitIn(dir, 'add', '-A')
        gitIn(dir, 'commit', '-q', '-m', version)
        gitIn(dir, 'tag', `v${version}`)
    }
    write(prefix(`nera-${plugin}`, workingTree))
    return dir
}

const prefix = (repo, files) => Object.fromEntries(Object.entries(files).map(([rel, text]) => [`${repo}/${rel}`, text]))
const repos = () => findRepos(workspace).repos
const finding = (result, item) => result.findings.find((f) => f.item === item)
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } })

beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), '.nera-style-check-copies-'))
})

afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true })
})

describe('findCopies', () => {
    it('finds vendored views (themed and legacy, nested) and copied client scripts, mapped to the plugin views/', () => {
        write({
            'site/theme/views/vendor/plugin-tags/partials/tag-cloud.pug': 'a',
            'site/views/vendor/plugin-navigation/simple-navigation.pug': 'b',
            'site/theme/views/vendor/not-a-plugin/x.pug': 'c',
            'site/theme/assets/js/search.js': 'd',
            'site/assets/js/contact-form.js': 'e',
            'site/theme/assets/js/main.js': 'f',
        })
        expect(findCopies(path.join(workspace, 'site'))).toEqual([
            { file: 'theme/views/vendor/plugin-tags/partials/tag-cloud.pug', plugin: 'plugin-tags', source: 'views/partials/tag-cloud.pug' },
            { file: 'views/vendor/plugin-navigation/simple-navigation.pug', plugin: 'plugin-navigation', source: 'views/simple-navigation.pug' },
            { file: 'theme/assets/js/search.js', plugin: 'plugin-search', source: 'views/search.js' },
            { file: 'assets/js/contact-form.js', plugin: 'plugin-contact-form', source: 'views/contact-form.js' },
        ])
    })

    it('finds nothing in a repo without vendor or script folders', () => {
        write({ 'site/package.json': {} })
        expect(findCopies(path.join(workspace, 'site'))).toEqual([])
    })
})

describe('lockedVersion', () => {
    it('reads v2/v3 packages and v1 dependencies, null when the plugin is not locked', () => {
        expect(lockedVersion(lock({ 'plugin-search': '2.4.0' }), 'plugin-search')).toBe('2.4.0')
        expect(lockedVersion({ dependencies: { '@nera-static/plugin-tags': { version: '3.0.0' } } }, 'plugin-tags')).toBe('3.0.0')
        expect(lockedVersion(lock({ 'plugin-search': '2.4.0' }), 'plugin-tags')).toBeNull()
    })
})

describe('pluginSource', () => {
    it('reads node_modules only when it holds exactly the locked version', () => {
        write(installed('site', 'plugin-search', '2.4.0', { 'views/search.js': 'installed' }))
        const source = pluginSource({ consumerDir: path.join(workspace, 'site'), workspace, plugin: 'plugin-search', version: '2.4.0' })
        expect(source.label).toBe('node_modules')
        expect(source.read('views/search.js')).toBe('installed')
        expect(source.read('views/nope.pug')).toBeNull()
    })

    it('falls back to the tag of the locked version, never the sibling working tree, and names the tag', () => {
        write(installed('site', 'plugin-search', '2.3.0', { 'views/search.js': 'stale install' }))
        siblingRepo('plugin-search', { '2.3.0': { 'views/search.js': 'v2.3.0' }, '2.4.0': { 'views/search.js': 'v2.4.0' } }, { 'views/search.js': 'working tree' })
        const source = pluginSource({ consumerDir: path.join(workspace, 'site'), workspace, plugin: 'plugin-search', version: '2.4.0' })
        expect(source.label).toBe('git tag v2.4.0')
        expect(source.read('views/search.js')).toBe('v2.4.0')
        expect(source.read('views/nope.pug')).toBeNull()
    })

    it('says why it cannot check: no install and no sibling, or a sibling without the tag', () => {
        const consumerDir = path.join(workspace, 'site')
        expect(pluginSource({ consumerDir, workspace, plugin: 'plugin-search', version: '2.4.0' })).toEqual({
            error: 'not in node_modules, and no sibling repo nera-plugin-search',
        })
        write(installed('site', 'plugin-search', '2.3.0'))
        siblingRepo('plugin-search', { '2.3.0': { 'views/search.js': 'x' } })
        expect(pluginSource({ consumerDir, workspace, plugin: 'plugin-search', version: '2.4.0' })).toEqual({
            error: 'node_modules holds 2.3.0, and nera-plugin-search has no tag v2.4.0',
        })
    })
})

describe('checkCopies', () => {
    it('reports differing copies and files the plugin lacks, with the locked version and source, and counts the same ones', () => {
        write({
            'nera-website/package.json': { name: 'nera-website', private: true },
            'nera-website/package-lock.json': lock({ 'plugin-search': '2.4.0', 'plugin-tags': '3.4.1' }),
            ...installed('nera-website', 'plugin-search', '2.4.0', { 'views/search.js': 'original\n', 'views/search.pug': 'p same\n' }),
            ...installed('nera-website', 'plugin-tags', '3.4.1', { 'views/partials/tag-cloud.pug': 'p cloud\n' }),
            'nera-website/theme/assets/js/search.js': 'customised\n',
            'nera-website/theme/views/vendor/plugin-search/search.pug': 'p same\r\n\n',
            'nera-website/theme/views/vendor/plugin-tags/partials/tag-cloud.pug': 'p cloud\n',
            'nera-website/theme/views/vendor/plugin-tags/partials/gone.pug': 'p old\n',
        })
        const result = checkCopies(repos(), { workspace })
        expect(result.findings).toHaveLength(2)
        expect(finding(result, 'theme/assets/js/search.js')).toEqual({
            check: 'copies',
            repo: 'nera-website',
            item: 'theme/assets/js/search.js',
            detail: 'differs from `plugin-search@2.4.0` (node_modules)',
        })
        expect(finding(result, 'theme/views/vendor/plugin-tags/partials/gone.pug').detail).toBe('`plugin-tags@3.4.1` (node_modules) has no `views/partials/gone.pug`')
        expect(result.notes).toEqual([])
        expect(result.tables[0].rows).toEqual([
            ['nera-website', 'plugin-search@2.4.0', 'node_modules', '2', '1', '1', '0'],
            ['nera-website', 'plugin-tags@3.4.1', 'node_modules', '2', '1', '0', '1'],
        ])
    })

    it('compares against the tag when the consumer has no node_modules (a CI clone)', () => {
        write({
            'nera-starter-blog/package.json': { name: '@nera-static/starter-blog' },
            'nera-starter-blog/package-lock.json': lock({ 'plugin-search': '2.3.0' }),
            'nera-starter-blog/theme/assets/js/search.js': 'v2.3.0',
        })
        siblingRepo('plugin-search', { '2.3.0': { 'views/search.js': 'v2.3.0' }, '2.4.0': { 'views/search.js': 'v2.4.0' } })
        const result = checkCopies(repos(), { workspace })
        expect(result.findings).toEqual([])
        expect(result.tables[0].rows).toEqual([['nera-starter-blog', 'plugin-search@2.3.0', 'git tag v2.3.0', '1', '1', '0', '0']])
    })

    it('notes what it cannot check: no lockfile, a plugin not locked, no source for the locked version', () => {
        write({
            'nera-starter-a/package.json': {},
            'nera-starter-a/theme/assets/js/search.js': 'x',
            'nera-starter-b/package.json': {},
            'nera-starter-b/package-lock.json': lock({ 'plugin-search': '9.9.9' }),
            'nera-starter-b/theme/assets/js/search.js': 'x',
            'nera-starter-b/theme/views/vendor/plugin-feed/feed-link.pug': 'x',
        })
        const result = checkCopies(repos(), { workspace })
        expect(result.findings).toEqual([])
        expect(result.notes).toEqual([
            { repo: 'nera-starter-a', detail: '1 copied plugin file, but no readable package-lock.json to name the installed versions' },
            { repo: 'nera-starter-b', detail: '1 copied file of plugin-feed, but package-lock.json locks no @nera-static/plugin-feed' },
            { repo: 'nera-starter-b', detail: 'plugin-search@9.9.9 (1 file): not in node_modules, and no sibling repo nera-plugin-search' },
        ])
    })

    it('looks only at starters and sites', () => {
        write({
            'nera-theme-x/package.json': {},
            'nera-theme-x/views/vendor/plugin-tags/x.pug': 'x',
            'nera-plugin-y/package.json': {},
            'nera-plugin-y/assets/js/search.js': 'x',
        })
        const result = checkCopies(repos(), { workspace })
        expect(result).toEqual({ findings: [], notes: [], tables: [expect.objectContaining({ rows: [] })] })
    })
})

describe('style-check.js', () => {
    it('renders the Copied plugin files section and applies the allow-list to it', () => {
        write({
            'nera-website/package.json': { name: 'nera-website', private: true },
            'nera-website/package-lock.json': lock({ 'plugin-search': '2.4.0' }),
            ...installed('nera-website', 'plugin-search', '2.4.0', { 'views/search.js': 'original' }),
            'nera-website/theme/assets/js/search.js': 'customised',
            'allow.yaml': '- check: copies\n  repo: nera-website\n  item: theme/assets/js/search.js\n  reason: the site adds keyboard navigation\n',
        })
        const plain = run('--workspace', workspace, '--allow', path.join(workspace, 'none.yaml'))
        expect(plain.status).toBe(0)
        expect(plain.stdout).toContain('## Copied plugin files (1)')
        expect(plain.stdout).toContain('`theme/assets/js/search.js` — differs from `plugin-search@2.4.0` (node_modules)')

        const allowed = run('--workspace', workspace, '--allow', path.join(workspace, 'allow.yaml'))
        expect(allowed.stdout).toContain('## Copied plugin files (0)')
        expect(allowed.stdout).toContain('the site adds keyboard navigation')
    })
})
