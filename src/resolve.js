import fssync from 'fs'
import path from 'path'

// Layered view resolution — the single source of truth for how Nera locates a
// layout and its `include`/`extends` targets across a site's own presentation
// and an optional theme package (ROADMAP-themes.md §1b).
//
// Extracted from render.js so the exact same logic can be reused outside the
// render loop — chiefly `@nera-static/validate`, which must decide "does this
// include resolve?" identically to how the build will. Do not fork this: a
// second copy of the algorithm is the drift `@nera-static/validate` exists to
// avoid.

// Pug's own path resolution, replicated so the layered hook below can fall
// through to it when nothing in the chain matches. Absolute includes
// (`/vendor/x/y.pug`) resolve against basedir; relative ones against the
// including file's directory — matching pug's built-in behaviour exactly.
export const defaultResolvePath = (filename, source, options) => {
    const name = filename.trim()
    const base = name[0] === '/' ? options.basedir : path.dirname(source.trim())
    return path.join(base, name)
}

// First-match-wins resolution across an ordered chain of view roots — the
// site's own presentation first (`<site>/theme/views`, or the deprecated root
// `<site>/views`), the resolved theme package second — so a site file overrides
// the theme's copy of the same path while everything else falls through to the
// theme (ROADMAP-themes.md §1b).
//
// The trick that makes it root-agnostic: resolve as pug normally would, then
// re-root that path relative to whichever chain root it fell under, and retry
// the same relative path against each root in order. This works whether the
// including file lives in the site or the theme.
export const makeLayeredResolver = (roots) => (filename, source, options) => {
    const fallback = defaultResolvePath(filename, source, options)

    for (const root of roots) {
        const rel = path.relative(root, fallback)
        if (rel.startsWith('..') || path.isAbsolute(rel)) continue
        for (const candidate of roots) {
            const p = path.join(candidate, rel)
            if (fssync.existsSync(p)) return p
        }
        break
    }
    return fallback
}

// The layout file itself may live in the theme, so resolve it through the same
// chain rather than assuming the site's views folder.
export const resolveEntry = (layout, roots) => {
    for (const root of roots) {
        const p = path.join(root, layout)
        if (fssync.existsSync(p)) return p
    }
    // Fall back to the site root; the missing-file error then surfaces from
    // compileFile with a path the user recognises.
    return path.join(roots[0], layout)
}
