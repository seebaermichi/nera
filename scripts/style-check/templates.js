// The repo templates of scripts/new-repo.js against the fleet, for scripts/style-check.js:
// every template file that has an IDENTICAL_GROUPS counterpart is compared with the
// majority of the repos the group compares, so a template cannot rot while the fleet
// moves on. A template that is ahead of the fleet on purpose (D5 of the issue "Repo
// templates replace copy a sibling") is an allow-list entry with its reason.
import fs from 'fs'
import path from 'path'
import { KINDS, TEMPLATES, placeholders, renderTemplates } from '../new-repo.js'
import { IDENTICAL_GROUPS, contentHash, fileVariants, groupMembers, groupScope } from './identical.js'

// The style-check repo kind a template kind is compared with: a tool is a library.
export const TEMPLATE_REPO_KIND = { plugin: 'plugin', theme: 'theme', starter: 'starter', tool: 'library' }

// The repo name the templates are rendered for; the compared files carry no placeholder.
const sampleName = (kind) => (kind === 'tool' ? 'nera-example' : `nera-${kind}-example`)

/**
 * Every template kind's file set, rendered as new-repo.js writes it, against the
 * IDENTICAL_GROUPS majority of its kind. A finding names the layer the file comes from
 * (`templates/common`, `templates/<kind>`), so one allow-list entry covers a common file
 * for every kind. A file compared once against a scope is not compared again for the
 * next kind that inherits it. A template that does not render is a finding too.
 * @param {Array} repos the repos of findRepos()
 * @param {object} [ctx]
 * @param {{ templates?: string, groups?: Array }} [options] tests pass their own tree and groups
 */
export function checkTemplates(repos, ctx, { templates = TEMPLATES, groups = IDENTICAL_GROUPS } = {}) {
    const out = { findings: [], notes: [], tables: [{ caption: 'Template files compared', header: ['template', 'file', 'compared with', 'verdict'], rows: [] }] }
    const add = (repo, item, detail) => out.findings.push({ check: 'templates', repo, item, detail })
    const seen = new Set()
    for (const kind of KINDS) {
        const { files, errors } = renderTemplates({ kind, values: placeholders({ kind, name: sampleName(kind) }), templates })
        for (const error of errors) {
            const [where, ...detail] = error.split(': ')
            add(`templates/${kind}`, where, `does not render: ${detail.join(': ')}`)
        }
        const repoKind = TEMPLATE_REPO_KIND[kind]
        for (const group of groups) {
            const rendered = files.get(group.file)
            if (!rendered || (group.kinds && !group.kinds.includes(repoKind))) continue
            const layer = fs.existsSync(path.join(templates, kind, group.file)) ? kind : 'common'
            const scope = groupScope(group, group.perKind ? repoKind : undefined)
            const key = `${layer}\n${group.file}\n${scope}`
            if (seen.has(key)) continue
            seen.add(key)

            const set = groupMembers(repos, group).filter((repo) => !group.perKind || repo.kind === repoKind)
            const { sorted, present, majority } = fileVariants(group.file, set)
            const name = `templates/${layer}`
            const row = (verdict) => out.tables[0].rows.push([name, `\`${group.file}\``, scope, verdict])
            if (!majority) {
                row(present < 2 ? `nothing to compare (${present} of ${set.length} ${scope} have it)` : `no majority among ${present} ${scope}`)
                continue
            }
            const agree = sorted[0][1].length
            if (contentHash(rendered.text) === majority) {
                row(`matches the ${agree} of ${present} that agree`)
                continue
            }
            row('differs')
            add(name, group.file, `differs from the ${agree} of ${present} ${scope} that agree`)
        }
    }
    return out
}
