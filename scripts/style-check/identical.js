// Files that must be identical across the repos of a kind, for scripts/style-check.js.
// The majority's content is the reference: a repo whose file differs is a deviant, a
// repo without the file is missing it. No canonical copy is assumed, so the check works
// on a CI clone of the public fleet as well as on the local workspace.
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * The groups, in report order:
 *   file       the path inside each repo
 *   kinds      only repos of these kinds (default: every checked repo)
 *   perKind    compare within each kind separately (themes and plugins lint differently)
 *   published  only packages that publish (a package.json without `private`)
 *   missing    false: do not report the file missing (the husky check already does)
 */
export const IDENTICAL_GROUPS = [
    { file: 'eslint.config.js', perKind: true },
    { file: '.github/workflows/publish.yml', published: true },
    { file: '.github/dependabot.yml' },
    { file: '.github/FUNDING.yml' },
    { file: '.husky/pre-commit', missing: false },
    { file: '.husky/pre-push', missing: false },
    { file: 'test/helpers/html.js', kinds: ['theme'] },
]

/** A content hash that ignores line endings and trailing whitespace at the end of the file. */
export function contentHash(text) {
    return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n').replace(/\s+$/, '')).digest('hex')
}

function members(repos, group) {
    return repos.filter((repo) => {
        if (!repo.hygiene) return false
        if (group.kinds && !group.kinds.includes(repo.kind)) return false
        if (group.published && (!repo.pkg || repo.pkg.private)) return false
        return true
    })
}

/**
 * Compare one file across one set of repos and push its findings. With fewer than two
 * repos holding the file there is nothing to compare. A tie for the most common
 * content is no majority: every holder is reported, none is assumed right.
 */
function compare(group, scope, repos, out) {
    const variants = new Map()
    const missing = []
    for (const repo of repos) {
        const file = path.join(repo.dir, group.file)
        if (!fs.existsSync(file)) {
            missing.push(repo.name)
            continue
        }
        const hash = contentHash(fs.readFileSync(file, 'utf8'))
        if (!variants.has(hash)) variants.set(hash, [])
        variants.get(hash).push(repo.name)
    }
    const present = repos.length - missing.length
    if (present < 2) return

    const sorted = [...variants.values()].sort((a, b) => b.length - a.length)
    const tie = sorted.length > 1 && sorted[0].length === sorted[1].length
    const add = (repo, detail) => out.findings.push({ check: 'identical', repo, item: group.file, detail })
    if (tie) {
        for (const names of sorted) for (const repo of names) add(repo, `no majority: ${sorted.length} variants among ${present} ${scope}`)
    } else {
        for (const names of sorted.slice(1)) for (const repo of names) add(repo, `differs from the ${sorted[0].length} of ${present} ${scope} that agree`)
    }
    if (group.missing !== false) {
        for (const repo of missing) add(repo, `missing (${present} of ${repos.length} ${scope} have it)`)
    }
    out.tables[0].rows.push([`\`${group.file}\``, scope, String(repos.length), String(sorted.length), tie ? 'none (tie)' : `${sorted[0].length} of ${present}`])
}

/**
 * Every IDENTICAL_GROUPS file across its repos: deviants from the majority, missing
 * files, and a context table of how many variants each group has.
 * @param {Array} repos the repos of findRepos()
 * @param {object} [ctx]
 * @param {Array} [groups] defaults to IDENTICAL_GROUPS (tests pass their own)
 */
export function checkIdentical(repos, ctx, groups = IDENTICAL_GROUPS) {
    const out = { findings: [], notes: [], tables: [{ caption: 'Groups compared', header: ['file', 'scope', 'repos', 'variants', 'majority'], rows: [] }] }
    for (const group of groups) {
        const set = members(repos, group)
        if (!group.perKind) {
            compare(group, group.kinds ? `${group.kinds.join('/')} repos` : 'repos', set, out)
            continue
        }
        const kinds = [...new Set(set.map((repo) => repo.kind))].sort()
        for (const kind of kinds) compare(group, `${kind} repos`, set.filter((repo) => repo.kind === kind), out)
    }
    return out
}
