import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import { createRequire } from 'module'

// Theme discovery (ROADMAP-themes.md §1).
//
// `app.theme` accepts three forms, and every one resolves to a THEME ROOT whose
// payload — `views/`, `assets/`, `config/` — sits directly at that root, with no
// inner `theme/` wrapper (§1b, revised 2026-07-23). A theme package contains
// nothing but the theme, so its package root already *is* the theme root:
//
//   docs                 → @nera-static/theme-docs   (bare name, scoped prefix)
//   @acme/my-theme       → verbatim                   (contains `/` or `@`)
//   .  /  ./path/to/it   → path relative to cwd       (local, in-dev or private)
//
// A missing `theme:` key returns null and the generator renders exactly as it
// does today. A `theme:` that cannot be resolved throws — a theme set but not
// found means every layout is missing, and the build would otherwise produce an
// unstyled site with exit code 0 (the "fail loudly" decision, §1a).
//
// The returned `config` is the theme's `config/theme.yaml` defaults deep-merged
// with the site's optional `config/theme.yaml` (§1c). The pipeline exposes the
// whole result to templates as `app.theme = { name, package, config }`.
export function resolveTheme({ app, cwd = process.cwd() } = {}) {
    const spec = app?.theme
    if (!spec) return null

    const isLocal = spec.startsWith('.')
    const root = isLocal
        ? path.resolve(cwd, spec)
        : resolvePackageRoot(spec, cwd)

    // The theme root IS the payload root — no wrapper to append (§1b, revised).
    const viewsRoot = path.join(root, 'views')
    const assetsRoot = path.join(root, 'assets')

    if (!fs.existsSync(viewsRoot)) {
        throw new Error(
            `theme: "${spec}" resolved to ${root}, but ${viewsRoot} does not exist`
        )
    }

    const config = loadThemeConfig(root, app, cwd)

    return {
        name: spec,
        package: isLocal ? null : packageName(spec),
        root,
        viewsRoot,
        assetsRoot,
        config,
    }
}

// §1c: the theme package ships `config/theme.yaml` (at its root) with real
// defaults; the site's `config/theme.yaml` (at the site's config folder — config
// stays out of `theme/`) is optional and deep-merges OVER those defaults.
//
// This is a DELIBERATE divergence from the plugin `getConfig` contract, where
// the site's file is read wholesale with no merge. Here the merge IS the point
// (§1c): a site changing one token inherits the rest, and still receives tokens
// the theme adds later. Do not "fix" this for consistency — a missing site file
// is fine (all defaults inherited), and everything stays synchronous.
function loadThemeConfig(root, app, cwd) {
    const themeDefaults = readYaml(path.join(root, 'config', 'theme.yaml'))
    // Mirror the site config lookup the rest of the pipeline uses: the config
    // folder from app.folders (set by loadAppData), resolved against cwd. A bare
    // `config` default covers callers that resolve a theme before folders merge.
    const configFolder = app?.folders?.config || 'config'
    const siteOverrides = readYaml(path.resolve(cwd, configFolder, 'theme.yaml'))

    return deepMerge(themeDefaults, siteOverrides)
}

// Parse a YAML file to a plain object, tolerating absence and malformed content
// the same warn-and-continue way loadAppData does — a broken theme.yaml must not
// abort the build, it just contributes nothing to the merge.
function readYaml(file) {
    if (!fs.existsSync(file)) return {}
    try {
        return yaml.parse(fs.readFileSync(file, 'utf-8')) || {}
    } catch (err) {
        console.warn(`⚠️ Nera: failed to parse ${file}: ${err.message}`)
        return {}
    }
}

// Deep merge for §1c: objects merge per key, arrays are replaced wholesale, the
// override (site) wins at every leaf. Pure and synchronous — returns a fresh
// object and mutates neither argument.
export function deepMerge(base, override) {
    if (!isPlainObject(base) || !isPlainObject(override)) return override

    const out = { ...base }
    for (const key of Object.keys(override)) {
        out[key] =
            isPlainObject(base[key]) && isPlainObject(override[key])
                ? deepMerge(base[key], override[key])
                : override[key]
    }
    return out
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// A bare name is expanded to the @nera-static/theme-<name> convention; anything
// scoped or slashed is used verbatim, so third-party themes work too.
function packageName(spec) {
    return spec.includes('/') || spec.startsWith('@')
        ? spec
        : `@nera-static/theme-${spec}`
}

// Locate an installed theme on disk. A theme has no JS entry point, so it cannot
// be import()ed; instead resolve its package.json from the site's node_modules
// and take the directory — that dirname is the theme root directly (§1b). Theme
// packages expose "./package.json" in exports (or omit exports entirely)
// precisely so this resolves.
function resolvePackageRoot(spec, cwd) {
    const pkg = packageName(spec)
    // Resolve from the site (cwd), like every other lookup in the pipeline —
    // the theme is a dependency of the site, not of the generator.
    const requireFromSite = createRequire(path.join(cwd, 'package.json'))

    try {
        return path.dirname(requireFromSite.resolve(`${pkg}/package.json`))
    } catch {
        throw new Error(
            `theme: "${spec}" — package ${pkg} is not installed. ` +
                `Run: npm install ${pkg}`
        )
    }
}
