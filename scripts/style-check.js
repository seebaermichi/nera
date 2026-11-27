#!/usr/bin/env node
// Reads every Nera repo in the workspace and reports, as Markdown on stdout, the
// handwriting drift no single repo can see (roadmap "One handwriting", D3 in
// audit/consistency/README.md). Read-only: it never changes a repo.
//
// Usage: node scripts/style-check.js [--workspace <dir>] [--allow <file>]
//   --workspace  the folder holding the repos side by side (default: the parent of generator/)
//   --allow      the allow-list (default: scripts/style-check.allow.yaml)
//
// Exit 0 always, findings or not (report only); 2 when the workspace is missing or
// holds no Nera repo, because checking nothing is not "all fine". In GitHub Actions
// the report is also appended to $GITHUB_STEP_SUMMARY.
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { findRepos } from './style-check/repos.js'
import { HYGIENE_CHECKS } from './style-check/hygiene.js'
import { loadAllowList, applyAllowList, renderReport } from './style-check/report.js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))

const DEFAULTS = {
    workspace: path.resolve(scriptDir, '../..'),
    allow: path.join(scriptDir, 'style-check.allow.yaml'),
}

/**
 * Run every check over a workspace and render the report.
 * @param {{ workspace: string, allow: string }} options
 * @returns {{ code: number, markdown?: string, error?: string }}
 */
export function styleCheck({ workspace, allow }) {
    if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
        return { code: 2, error: `style-check: workspace ${workspace} is not a folder` }
    }
    const { repos, skipped } = findRepos(workspace)
    if (!repos.length) {
        return { code: 2, error: `style-check: workspace ${workspace} contains no Nera repo` }
    }
    const allowList = loadAllowList(allow)
    const used = new Set()
    const sections = HYGIENE_CHECKS.map((check) => {
        const { findings, notes, tables } = check.run(repos, { workspace })
        const { open, allowed, used: matched } = applyAllowList(findings, allowList.entries)
        for (const entry of matched) used.add(entry)
        return { title: check.title, open, allowed, notes, tables }
    })
    const unused = allowList.entries.filter((entry) => !used.has(entry))
    const { markdown } = renderReport({ workspace, repos, skipped, sections, allow: { invalid: allowList.invalid, unused } })
    return { code: 0, markdown }
}

function parseArgs(argv) {
    const options = { ...DEFAULTS }
    for (let i = 0; i < argv.length; i++) {
        const key = argv[i].replace(/^--/, '')
        if (!(key in DEFAULTS) || argv[i + 1] === undefined) {
            throw new Error(`style-check: unknown or incomplete option ${argv[i]} (use --workspace <dir>, --allow <file>)`)
        }
        options[key] = path.resolve(argv[++i])
    }
    return options
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    let result
    try {
        result = styleCheck(parseArgs(process.argv.slice(2)))
    } catch (error) {
        result = { code: 2, error: error.message }
    }
    if (result.error) console.error(result.error)
    if (result.markdown) {
        process.stdout.write(result.markdown)
        if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.markdown)
    }
    process.exitCode = result.code
}
