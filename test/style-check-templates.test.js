import { describe, it, expect, beforeEach } from 'vitest'
import { tempDir, writeFiles } from '@nera-static/test-utils'
import fs from 'node:fs'
import path from 'node:path'
import { findRepos } from '../scripts/style-check/repos.js'
import { CANONICAL_GITIGNORE } from '../scripts/style-check/hygiene.js'
import { checkTemplates } from '../scripts/style-check/templates.js'
import { TEMPLATES } from '../scripts/new-repo.js'

const generatorRoot = path.resolve(import.meta.dirname, '..')

// Two groups like IDENTICAL_GROUPS: one per kind, one across every repo.
const GROUPS = [
    { file: 'eslint.config.js', perKind: true },
    { file: '.github/FUNDING.yml' },
]

const FLEET_ESLINT = 'export default []\n'
const FLEET_FUNDING = 'github: [seebaermichi]\n'

let workspace
let templates

// A fleet repo holding the two compared files.
function fleetRepo(name, { eslint = FLEET_ESLINT, funding = FLEET_FUNDING } = {}) {
    writeFiles(workspace, {
        [`${name}/package.json`]: JSON.stringify({ name }),
        [`${name}/eslint.config.js`]: eslint,
        [`${name}/.github/FUNDING.yml`]: funding,
    })
}

const run = (groups = GROUPS) => checkTemplates(findRepos(workspace).repos, { workspace }, { templates, groups })
const findings = (out) => out.findings.map((f) => [f.repo, f.item, f.detail])

beforeEach(() => {
    workspace = tempDir('.nera-style-check-')
    templates = tempDir('.nera-templates-')
    writeFiles(templates, {
        'common/eslint.config.js': FLEET_ESLINT,
        'common/.github/FUNDING.yml': FLEET_FUNDING,
    })
    fleetRepo('nera-plugin-a')
    fleetRepo('nera-plugin-b')
    fleetRepo('nera-theme-a')
    fleetRepo('nera-theme-b')
})

describe('templates', () => {
    it('reports nothing while the templates match the fleet majority, and compares a common file once per scope', () => {
        const out = run()

        expect(out.findings).toEqual([])
        expect(out.tables[0].rows).toEqual([
            ['templates/common', '`eslint.config.js`', 'plugin repos', 'matches the 2 of 2 that agree'],
            ['templates/common', '`.github/FUNDING.yml`', 'repos', 'matches the 4 of 4 that agree'],
            ['templates/common', '`eslint.config.js`', 'theme repos', 'matches the 2 of 2 that agree'],
            ['templates/common', '`eslint.config.js`', 'starter repos', 'nothing to compare (0 of 0 starter repos have it)'],
            ['templates/common', '`eslint.config.js`', 'library repos', 'nothing to compare (0 of 0 library repos have it)'],
        ])
    })

    it('reports a changed common file once, though every kind inherits it', () => {
        writeFiles(templates, { 'common/.github/FUNDING.yml': 'github: [someone-else]\n' })
        fleetRepo('nera-plugin-c', { funding: 'ko_fi: other\n' })

        expect(findings(run())).toEqual([
            ['templates/common', '.github/FUNDING.yml', 'differs from the 4 of 5 repos that agree'],
        ])
    })

    it('compares a file per kind with the repos of that kind, a tool with the libraries', () => {
        writeFiles(templates, { 'common/eslint.config.js': 'export default [1]\n' })
        fleetRepo('nera-mcp', { eslint: 'export default [1]\n' })
        fleetRepo('nera-validate', { eslint: 'export default [1]\n' })

        expect(findings(run())).toEqual([
            ['templates/common', 'eslint.config.js', 'differs from the 2 of 2 plugin repos that agree'],
            ['templates/common', 'eslint.config.js', 'differs from the 2 of 2 theme repos that agree'],
        ])
    })

    it('names the kind layer when a kind replaces the common file', () => {
        writeFiles(templates, { 'theme/eslint.config.js': 'export default [2]\n' })

        expect(findings(run())).toEqual([
            ['templates/theme', 'eslint.config.js', 'differs from the 2 of 2 theme repos that agree'],
        ])
    })

    it('compares nothing, and says so, when the fleet has no majority', () => {
        fleetRepo('nera-theme-b', { eslint: 'export default [3]\n' })

        const out = run()

        expect(out.findings).toEqual([])
        expect(out.tables[0].rows).toContainEqual(['templates/common', '`eslint.config.js`', 'theme repos', 'no majority among 2 theme repos'])
    })

    it('reports a template that does not render', () => {
        writeFiles(templates, { 'plugin/README.md': '# {{nope}}\n' })

        expect(findings(run())).toEqual([
            ['templates/plugin', 'plugin/README.md', 'does not render: unresolved placeholder {{nope}}'],
        ])
    })
})

describe('canonical .gitignore', () => {
    it('is the common template, found from the workspace root locally and in the fleet-check clone', () => {
        // Both lay the generator repo out as <workspace>/generator (fleet-check.yml
        // clones seebaermichi/nera into generator/); this repo's own CI checkout is
        // named nera, so the path is compared below the repo root, not the workspace.
        const template = path.join(TEMPLATES, 'common', 'gitignore')
        expect(CANONICAL_GITIGNORE).toBe(`generator/${path.relative(generatorRoot, template).split(path.sep).join('/')}`)
        expect(fs.existsSync(template)).toBe(true)
    })
})
