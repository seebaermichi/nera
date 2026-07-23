import fs from 'fs'
import path from 'path'
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

    return { name: spec, package: isLocal ? null : packageName(spec), root, viewsRoot, assetsRoot }
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
