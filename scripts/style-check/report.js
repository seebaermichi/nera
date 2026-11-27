// Allow-list and Markdown report for scripts/style-check.js (D5, D6).
import fs from 'fs'
import YAML from 'yaml'

const ALLOW_KEYS = ['check', 'repo', 'item', 'reason']

/**
 * Read the allow-list: a YAML list of `{ check, repo, item, reason }`, all four
 * non-empty strings. A missing file is an empty list; an entry without a reason is
 * invalid and not applied, so nothing is allowed silently.
 * @param {string} file
 * @returns {{ entries: Array<object>, invalid: Array<{ entry: unknown, detail: string }> }}
 */
export function loadAllowList(file) {
    if (!fs.existsSync(file)) return { entries: [], invalid: [] }
    let data
    try {
        data = YAML.parse(fs.readFileSync(file, 'utf8'))
    } catch (error) {
        return { entries: [], invalid: [{ entry: file, detail: `unreadable YAML: ${error.message}` }] }
    }
    if (data == null) return { entries: [], invalid: [] }
    if (!Array.isArray(data)) return { entries: [], invalid: [{ entry: file, detail: 'expected a list of entries' }] }
    const entries = []
    const invalid = []
    for (const entry of data) {
        const missing = ALLOW_KEYS.filter((key) => typeof entry?.[key] !== 'string' || !entry[key].trim())
        if (missing.length) invalid.push({ entry, detail: `missing ${missing.join(', ')}` })
        else entries.push(entry)
    }
    return { entries, invalid }
}

const matches = (entry, finding) => entry.check === finding.check && entry.repo === finding.repo && entry.item === finding.item

/**
 * Split findings into open and allowed ones. Allowed findings keep the entry's reason;
 * `used` holds the entries that matched, so the caller can report stale ones.
 * @param {Array<object>} findings
 * @param {Array<object>} entries valid allow-list entries
 */
export function applyAllowList(findings, entries) {
    const open = []
    const allowed = []
    const used = new Set()
    for (const finding of findings) {
        const entry = entries.find((e) => matches(e, finding))
        if (entry) {
            used.add(entry)
            allowed.push({ ...finding, reason: entry.reason })
        } else {
            open.push(finding)
        }
    }
    return { open, allowed, used }
}

// Table cells: no raw pipes or line breaks, which would break the Markdown table.
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ')

function table(header, rows) {
    return [`| ${header.map(cell).join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)].join('\n')
}

// One row per repo, so a repo with ten gaps stays one line; findings of a repo that
// share a detail are joined: "`a`, `b` — missing".
function byRepo(findings) {
    const groups = new Map()
    for (const finding of findings) {
        if (!groups.has(finding.repo)) groups.set(finding.repo, new Map())
        const details = groups.get(finding.repo)
        if (!details.has(finding.detail)) details.set(finding.detail, [])
        details.get(finding.detail).push(`\`${finding.item}\``)
    }
    return [...groups].map(([repo, details]) => [repo, [...details].map(([detail, items]) => joinItems(items, detail)).join('<br>')])
}

const joinItems = (items, detail) => (detail ? `${items.join(', ')} — ${detail}` : items.join(', '))
const describe = (f) => joinItems([`\`${f.item}\``], f.detail)

/**
 * Render one section: open findings, allowed findings with their reason, notes
 * ("could not check") and the check's own context tables.
 * @param {{ title: string, open: Array, allowed: Array, notes: Array, tables: Array }} section
 */
export function renderSection(section) {
    const parts = [`## ${section.title} (${section.open.length})`]
    parts.push(section.open.length ? table(['repo', 'finding'], byRepo(section.open)) : 'No findings.')
    if (section.allowed.length) {
        parts.push(`Allowed (${section.allowed.length}):`, table(['repo', 'finding', 'reason'], section.allowed.map((f) => [f.repo, describe(f), f.reason])))
    }
    if (section.notes.length) {
        parts.push(`Could not check (${section.notes.length}):`, table(['repo', 'why'], section.notes.map((n) => [n.repo, n.detail])))
    }
    for (const extra of section.tables) {
        if (extra.rows.length) parts.push(`${extra.caption}:`, table(extra.header, extra.rows))
    }
    return parts.join('\n\n')
}

/**
 * The whole report: repos checked and skipped, one section per check, the allow-list's
 * own problems, and a summary line at the end.
 * @param {{ workspace: string, repos: Array, skipped: Array, sections: Array,
 *   allow: { invalid: Array, unused: Array } }} input
 * @returns {{ markdown: string, totals: { open: number, allowed: number, notes: number } }}
 */
export function renderReport({ workspace, repos, skipped, sections, allow }) {
    const totals = { open: 0, allowed: 0, notes: 0 }
    for (const section of sections) {
        totals.open += section.open.length
        totals.allowed += section.allowed.length
        totals.notes += section.notes.length
    }
    totals.notes += allow.invalid.length

    const kinds = new Map()
    for (const repo of repos) kinds.set(repo.kind, (kinds.get(repo.kind) || 0) + 1)
    const parts = [
        '# Nera style-check',
        `Workspace \`${workspace}\`: ${repos.length} repos (${[...kinds].map(([kind, n]) => `${n} ${kind}`).join(', ')}). Report only: nothing is changed.`,
    ]
    if (skipped.length) parts.push(`Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join(', ')}.`)
    for (const section of sections) parts.push(renderSection(section))
    if (allow.invalid.length || allow.unused.length) {
        const rows = [
            ...allow.invalid.map((i) => [JSON.stringify(i.entry), `invalid, not applied: ${i.detail}`]),
            ...allow.unused.map((e) => [`${e.check} / ${e.repo} / ${e.item}`, 'matches no finding: remove it']),
        ]
        parts.push(`## Allow-list (${rows.length})`, table(['entry', 'problem'], rows))
    }
    parts.push(`style-check: ${totals.open} findings, ${totals.allowed} allowed, ${totals.notes} could not check, across ${repos.length} repos (report only, exit 0)`)
    return { markdown: parts.join('\n\n') + '\n', totals }
}
