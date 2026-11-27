import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { findRepos, repoKind } from '../../scripts/style-check/repos.js'
import {
    CANONICAL_GITIGNORE,
    checkLicense,
    checkHusky,
    checkEngines,
    checkChangelogFiles,
    checkPluginConfig,
    checkGitignore,
    gitignoreLines,
} from '../../scripts/style-check/hygiene.js'
import { loadAllowList, applyAllowList } from '../../scripts/style-check/report.js'

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/style-check.js')
const MIT = 'MIT License\n\nCopyright (c) 2026 Michael Becker\n\nPermission is hereby granted\n'

let workspace

// Writes files into the fake workspace: { 'repo/path': content }; objects become JSON.
function write(files) {
    for (const [rel, content] of Object.entries(files)) {
        const file = path.join(workspace, rel)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
    }
}

// A repo that passes every hygiene check of its kind.
function cleanRepo(name, pkg = {}) {
    write({
        [`${name}/package.json`]: {
            name,
            scripts: { prepare: 'husky' },
            engines: { node: '>=22.12.0' },
            files: ['index.js', 'CHANGELOG.md'],
            ...pkg,
        },
        [`${name}/LICENSE`]: MIT,
        [`${name}/CHANGELOG.md`]: '# Changelog\n',
        [`${name}/.husky/pre-commit`]: 'npm run lint\n',
        [`${name}/.husky/pre-push`]: 'npx vitest run\n',
        [`${name}/.gitignore`]: 'node_modules/\nplans/\n',
    })
}

const repos = () => findRepos(workspace).repos
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } })

beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), '.nera-style-check-'))
})

afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true })
})

describe('repo discovery', () => {
    it('derives the kind from the folder name, plugin-utils being a library', () => {
        expect(repoKind('nera-plugin-tags')).toBe('plugin')
        expect(repoKind('nera-plugin-utils')).toBe('library')
        expect(repoKind('nera-theme-stack')).toBe('theme')
        expect(repoKind('nera-starter-blog')).toBe('starter')
        expect(repoKind('nera-website')).toBe('site')
        expect(repoKind('nera-highlightjs-pug')).toBe('library')
        expect(repoKind('generator')).toBe('library')
    })

    it('finds generator and nera-* repos with a package.json or a git checkout, and says why it skips the rest', () => {
        cleanRepo('generator')
        cleanRepo('nera-plugin-tags')
        cleanRepo('nera-platform')
        cleanRepo('nera-plugin-main-navigation')
        write({
            'nera-stan/.git/HEAD': 'ref: refs/heads/main\n',
            'nera-empty/README.md': '# nothing\n',
            'pug/package.json': {},
            'nera-pro/composer.json': '{}',
            'nera-pro/file-service/package.json': { name: 'nera-pro-file-service', private: true },
        })

        const { repos: found, skipped } = findRepos(workspace)

        expect(found.map((r) => [r.name, r.kind, r.hygiene])).toEqual([
            ['generator', 'library', true],
            ['nera-plugin-tags', 'plugin', true],
            ['nera-pro/file-service', 'app', false],
            ['nera-stan', 'library', true],
        ])
        expect(found.find((r) => r.name === 'nera-stan').pkg).toBeNull()
        expect(skipped.map((s) => s.name)).toEqual(['nera-empty', 'nera-platform', 'nera-plugin-main-navigation', 'nera-pro'])
        expect(skipped.find((s) => s.name === 'nera-plugin-main-navigation').reason).toBe('archived')
    })

    it('keeps a repo with an unreadable package.json and carries the error', () => {
        write({ 'nera-plugin-x/package.json': '{ nope' })
        const [repo] = repos()
        expect(repo.pkg).toBeNull()
        expect(repo.pkgError).toMatch(/^package\.json unreadable: /)
    })
})

describe('LICENSE', () => {
    it('reports the template placeholders, a missing file, a missing line and another format', () => {
        cleanRepo('nera-plugin-ok')
        cleanRepo('nera-plugin-range')
        cleanRepo('nera-plugin-placeholder')
        cleanRepo('nera-plugin-none')
        cleanRepo('nera-plugin-noline')
        cleanRepo('nera-plugin-other')
        write({
            'nera-plugin-range/LICENSE': 'Copyright (c) 2025-2026 Michael Becker\n',
            'nera-plugin-placeholder/LICENSE': 'MIT License\n\nCopyright (c) [2025] [Michael Becker]\n',
            'nera-plugin-noline/LICENSE': 'MIT License\n',
            'nera-plugin-other/LICENSE': 'Copyright 2026 M. Becker\n',
        })
        fs.rmSync(path.join(workspace, 'nera-plugin-none/LICENSE'))

        expect(checkLicense(repos()).findings).toEqual([
            { check: 'license', repo: 'nera-plugin-noline', item: 'LICENSE', detail: 'no copyright line' },
            { check: 'license', repo: 'nera-plugin-none', item: 'LICENSE', detail: 'missing' },
            { check: 'license', repo: 'nera-plugin-other', item: 'LICENSE', detail: 'unexpected format `Copyright 2026 M. Becker`' },
            { check: 'license', repo: 'nera-plugin-placeholder', item: 'LICENSE', detail: 'placeholder `Copyright (c) [2025] [Michael Becker]`' },
        ])
    })

    it('never checks the helper-scan-only part of nera-pro', () => {
        write({ 'nera-pro/file-service/package.json': { private: true } })
        expect(checkLicense(repos()).findings).toEqual([])
    })
})

describe('husky', () => {
    it('reports inert, never-installed and missing hooks, and passes prepare + both hooks', () => {
        cleanRepo('nera-plugin-ok')
        cleanRepo('nera-plugin-inert')
        cleanRepo('nera-plugin-uninstalled', { scripts: {} })
        cleanRepo('nera-plugin-none', { scripts: { test: 'vitest' } })
        fs.rmSync(path.join(workspace, 'nera-plugin-inert/.husky'), { recursive: true })
        fs.rmSync(path.join(workspace, 'nera-plugin-none/.husky'), { recursive: true })
        fs.rmSync(path.join(workspace, 'nera-plugin-uninstalled/.husky/pre-push'))
        write({ 'nera-stan/.git/HEAD': '' })

        const out = checkHusky(repos())

        expect(out.findings.map((f) => [f.repo, f.detail])).toEqual([
            ['nera-plugin-inert', 'inert: `prepare` runs husky, but .husky/pre-commit and .husky/pre-push not committed'],
            ['nera-plugin-none', 'none: no `prepare` script, no pre-commit or pre-push hook'],
            ['nera-plugin-uninstalled', 'never installed: .husky/pre-commit committed, but no `prepare` script runs husky'],
        ])
        expect(out.notes).toEqual([{ check: 'husky', repo: 'nera-stan', detail: 'no package.json' }])
    })

    it('counts only committed hooks in a git checkout', () => {
        cleanRepo('nera-plugin-git')
        const dir = path.join(workspace, 'nera-plugin-git')
        execFileSync('git', ['init', '-q', dir])
        execFileSync('git', ['-C', dir, 'add', '.husky/pre-commit'])

        expect(checkHusky(repos()).findings.map((f) => f.detail)).toEqual([
            'inert: `prepare` runs husky, but .husky/pre-push not committed',
        ])
    })

    it('notes a checkout git cannot read instead of failing the run', () => {
        cleanRepo('nera-plugin-broken')
        write({ 'nera-plugin-broken/.git': 'gitdir: /nowhere\n' })

        const out = checkHusky(repos())

        expect(out.findings).toEqual([])
        expect(out.notes).toEqual([{ check: 'husky', repo: 'nera-plugin-broken', detail: 'git ls-files failed in the checkout' }])
    })
})

describe('engines', () => {
    it('flags only a missing engines.node and lists the spellings with their repos', () => {
        cleanRepo('nera-plugin-a')
        cleanRepo('nera-plugin-b', { engines: { node: '>=20.0.0' } })
        cleanRepo('nera-plugin-c')
        cleanRepo('nera-plugin-d', { engines: {} })

        const out = checkEngines(repos())

        expect(out.findings).toEqual([{ check: 'engines', repo: 'nera-plugin-d', item: 'engines.node', detail: 'missing' }])
        expect(out.tables[0].rows).toEqual([
            ['`>=22.12.0`', '2', 'nera-plugin-a, nera-plugin-c'],
            ['`>=20.0.0`', '1', 'nera-plugin-b'],
        ])
    })
})

describe('CHANGELOG.md in files', () => {
    it('checks published packages with a files list, never private ones', () => {
        cleanRepo('nera-plugin-ok')
        cleanRepo('nera-plugin-nofiles', { files: undefined })
        cleanRepo('nera-plugin-unlisted', { files: ['index.js'] })
        cleanRepo('nera-plugin-nochangelog')
        cleanRepo('nera-website', { private: true, files: ['index.js'] })
        fs.rmSync(path.join(workspace, 'nera-plugin-nochangelog/CHANGELOG.md'))

        expect(checkChangelogFiles(repos()).findings).toEqual([
            { check: 'changelog-files', repo: 'nera-plugin-nochangelog', item: 'CHANGELOG.md', detail: 'missing' },
            { check: 'changelog-files', repo: 'nera-plugin-unlisted', item: 'CHANGELOG.md', detail: 'not in `files`' },
        ])
    })
})

describe('plugin config/<name>.yaml', () => {
    it('requires the file and its place in files only when the plugin source reads it', () => {
        cleanRepo('nera-plugin-ok', { files: ['config', 'index.js'] })
        cleanRepo('nera-plugin-absent')
        cleanRepo('nera-plugin-unshipped', { files: ['index.js'] })
        cleanRepo('nera-plugin-unread')
        cleanRepo('nera-plugin-testonly')
        write({
            'nera-plugin-ok/index.js': 'getConfig(\'config/ok.yaml\')\n',
            'nera-plugin-ok/config/ok.yaml': 'key: value\n',
            'nera-plugin-absent/src/config.js': 'path.resolve(cwd, folder, \'absent.yaml\')\n',
            'nera-plugin-unshipped/index.js': 'getConfig(\'config/unshipped.yaml\')\n',
            'nera-plugin-unshipped/config/unshipped.yaml': 'key: value\n',
            'nera-plugin-unread/index.js': 'export const x = 1\n',
            'nera-plugin-testonly/index.js': 'export const x = 1\n',
            'nera-plugin-testonly/src/test/config.test.js': '\'config/testonly.yaml\'\n',
        })

        expect(checkPluginConfig(repos()).findings).toEqual([
            { check: 'plugin-config', repo: 'nera-plugin-absent', item: 'config/absent.yaml', detail: 'read by the plugin, but not in the repo' },
            { check: 'plugin-config', repo: 'nera-plugin-unshipped', item: 'config/unshipped.yaml', detail: 'not in `files`, so it does not ship' },
        ])
    })
})

describe('.gitignore', () => {
    it('degrades to one note, not a finding per repo, without the canonical file', () => {
        cleanRepo('nera-plugin-a')
        cleanRepo('nera-plugin-b')

        const out = checkGitignore(repos(), { workspace })

        expect(out.findings).toEqual([])
        expect(out.notes).toEqual([
            { check: 'gitignore', repo: '(all)', detail: `canonical ${CANONICAL_GITIGNORE} not found, so no repo was compared` },
        ])
    })

    it('reports canonical lines missing and lines beyond the canonical file and the kind additions', () => {
        write({ [CANONICAL_GITIGNORE]: '# Dependencies\nnode_modules/\n\n.env\nplans/\n/.claude/\n' })
        cleanRepo('nera-plugin-a')
        cleanRepo('nera-theme-a')
        cleanRepo('nera-plugin-none')
        write({
            'nera-plugin-a/.gitignore': 'node_modules\n.env\n/.claude/\n/design/\nyarn-error.log*\n',
            'nera-theme-a/.gitignore': 'node_modules/\n.env\nplans/\n/.claude/\ntest/site/public/\n',
        })
        fs.rmSync(path.join(workspace, 'nera-plugin-none/.gitignore'))

        expect(checkGitignore(repos(), { workspace }).findings.map((f) => [f.repo, f.item, f.detail])).toEqual([
            ['nera-plugin-a', 'plans', 'missing'],
            ['nera-plugin-a', 'yarn-error.log*', 'extra'],
            ['nera-plugin-none', '.gitignore', 'missing'],
        ])
    })

    it('ignores comments and blank lines and drops a trailing slash, never a leading one', () => {
        expect(gitignoreLines('# c\n\n  node_modules/  \n/.claude/\n/\n')).toEqual(['node_modules', '/.claude', '/'])
    })
})

describe('allow-list', () => {
    it('applies complete entries and rejects one without a reason', () => {
        write({
            'allow.yaml': [
                '- { check: license, repo: nera-cli, item: LICENSE, reason: relicensing pending }',
                '- { check: husky, repo: nera-cli, item: husky }',
            ].join('\n'),
        })

        const { entries, invalid } = loadAllowList(path.join(workspace, 'allow.yaml'))
        const findings = [
            { check: 'license', repo: 'nera-cli', item: 'LICENSE', detail: 'missing' },
            { check: 'husky', repo: 'nera-cli', item: 'husky', detail: 'none' },
        ]
        const { open, allowed, used } = applyAllowList(findings, entries)

        expect(invalid).toEqual([{ entry: { check: 'husky', repo: 'nera-cli', item: 'husky' }, detail: 'missing reason' }])
        expect(allowed).toEqual([{ ...findings[0], reason: 'relicensing pending' }])
        expect(open).toEqual([findings[1]])
        expect([...used]).toEqual(entries)
    })

    it('treats a missing or empty file as no entries and a non-list as invalid', () => {
        expect(loadAllowList(path.join(workspace, 'nope.yaml'))).toEqual({ entries: [], invalid: [] })
        write({ 'empty.yaml': '# nothing\n', 'map.yaml': 'check: x\n' })
        expect(loadAllowList(path.join(workspace, 'empty.yaml'))).toEqual({ entries: [], invalid: [] })
        expect(loadAllowList(path.join(workspace, 'map.yaml')).invalid[0].detail).toBe('expected a list of entries')
    })
})

describe('style-check.js', () => {
    it('exits 2 on a workspace that is missing or holds no Nera repo', () => {
        write({ 'pug/package.json': {} })

        const empty = run('--workspace', workspace)
        const missing = run('--workspace', path.join(workspace, 'nope'))

        expect([empty.status, empty.stdout, empty.stderr.trim()]).toEqual([2, '', `style-check: workspace ${workspace} contains no Nera repo`])
        expect(missing.status).toBe(2)
    })

    it('exits 2 on an unknown option', () => {
        const result = run('--fix')
        expect(result.status).toBe(2)
        expect(result.stderr).toMatch(/unknown or incomplete option --fix/)
    })

    it('prints the report with findings, allowed ones with their reason, stale entries and the summary, and exits 0', () => {
        cleanRepo('nera-plugin-a')
        cleanRepo('nera-plugin-b', { scripts: {} })
        fs.rmSync(path.join(workspace, 'nera-plugin-b/.husky'), { recursive: true })
        write({
            'nera-plugin-a/LICENSE': 'Copyright (c) [2025] [Michael Becker]\n',
            'nera-plugin-b/LICENSE': 'Copyright (c) [2025] [Michael Becker]\n',
            'allow.yaml': [
                '- { check: license, repo: nera-plugin-b, item: LICENSE, reason: fixed with the next release }',
                '- { check: engines, repo: nera-plugin-a, item: engines.node, reason: stale }',
            ].join('\n'),
        })
        const summary = path.join(workspace, 'summary.md')

        const result = spawnSync(process.execPath, [script, '--workspace', workspace, '--allow', path.join(workspace, 'allow.yaml')], {
            encoding: 'utf8',
            env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
        })

        expect(result.status).toBe(0)
        expect(result.stdout).toContain('## Hygiene: LICENSE (1)')
        expect(result.stdout).toContain('| nera-plugin-a | `LICENSE` — placeholder `Copyright (c) [2025] [Michael Becker]` |')
        expect(result.stdout).toContain('| nera-plugin-b | `LICENSE` — placeholder `Copyright (c) [2025] [Michael Becker]` | fixed with the next release |')
        expect(result.stdout).toContain('| nera-plugin-b | `husky` — none: no `prepare` script, no pre-commit or pre-push hook |')
        expect(result.stdout).toContain('| engines / nera-plugin-a / engines.node | matches no finding: remove it |')
        expect(result.stdout).toContain('Could not check (1):')
        expect(result.stdout.trim().split('\n').at(-1)).toBe('style-check: 2 findings, 1 allowed, 1 could not check, across 2 repos (report only, exit 0)')
        expect(fs.readFileSync(summary, 'utf8')).toBe(result.stdout)
    })
})
