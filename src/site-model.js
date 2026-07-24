import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import { defaultSettings, computeFolders } from './core.js'
import { resolveTheme } from './theme.js'

// Resolve a site's view-resolution model for a given directory WITHOUT building
// it: the folders the build will use, the theme (if any), and the ordered
// `roots` chain the layered resolver walks (`[siteViews]`, or
// `[siteViews, themeViews]` under a theme). This is the bridge that lets
// `@nera-static/validate` — and, later, the platform's Node service — validate a
// site against the exact resolution the generator performs, importing this
// instead of forking a copy.
//
// Unlike loadAppData it is fully cwd-parameterised and read-only: it never lists
// pages, never warns, and never throws on a missing or broken theme. A theme
// that cannot be resolved (unset package, missing `views/`) is returned as
// `themeError` and a malformed app.yaml as `appConfigError`, for the caller to
// surface as a validation finding rather than aborting.
export function resolveSiteModel({
    cwd = process.cwd(),
    settings = defaultSettings,
} = {}) {
    const configFolder =
        settings?.folders?.config || defaultSettings.folders.config
    const appConfigPath = path.resolve(cwd, configFolder, 'app.yaml')

    let appConfig = {}
    let appConfigError = null
    if (fs.existsSync(appConfigPath)) {
        try {
            appConfig = yaml.parse(fs.readFileSync(appConfigPath, 'utf-8')) || {}
        } catch (err) {
            appConfigError = err.message
        }
    }

    const folders = computeFolders(appConfig, { settings, cwd })
    const viewsRoot = path.resolve(cwd, folders.views)

    // resolveTheme throws on a `theme:` that cannot be resolved (the build's
    // fail-loudly behaviour). Here that must not abort — capture it so validate
    // can report "theme set but not found" as a finding.
    let theme = null
    let themeError = null
    try {
        theme = resolveTheme({ app: appConfig, cwd })
    } catch (err) {
        themeError = err.message
    }

    const roots = theme ? [viewsRoot, theme.viewsRoot] : [viewsRoot]

    return {
        cwd,
        appConfig,
        appConfigError,
        folders,
        viewsRoot,
        theme,
        themeError,
        roots,
    }
}
