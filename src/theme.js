import fs from 'fs'
import path from 'path'

// Theme discovery (ROADMAP-themes.md §1).
//
// Slice 1 handles ONLY the local `./`-form of `app.theme` — a theme developed
// in-tree, or vendored by path. The npm / `@scope` forms resolve through the
// same chain but are a deliberate follow-on, so an npm-looking value throws
// rather than silently rendering an unstyled site (the "fail loudly" decision,
// §1a). A missing `theme:` key returns null and the generator renders exactly
// as it does today.
export function resolveTheme({ app, cwd = process.cwd() } = {}) {
    const spec = app?.theme
    if (!spec) return null

    if (!spec.startsWith('.')) {
        throw new Error(
            `theme: "${spec}" — only local "./"-form themes are supported so far; ` +
                'npm and @scope themes are not implemented yet'
        )
    }

    const root = path.resolve(cwd, spec)
    const viewsRoot = path.join(root, 'views')

    // Fail loudly: a theme set but not found means every layout is missing, and
    // the build would otherwise produce an unstyled site with exit code 0.
    if (!fs.existsSync(viewsRoot)) {
        throw new Error(
            `theme: "${spec}" resolved to ${root}, but ${viewsRoot} does not exist`
        )
    }

    return { name: spec, root, viewsRoot }
}
