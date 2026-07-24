import fs from 'fs/promises'
import fssync from 'fs'
import path from 'path'
import cpy from 'cpy'
import pug from 'pug'
import pretty from 'pretty'
import { rimraf } from 'rimraf'
import dotenv from 'dotenv'

dotenv.config()

const SUCCESS_COLOR = '\x1b[32m%s\x1b[0m'

// --- Base-path URL rewriting (config `base_path` → `app.basePath`) ------------
//
// A site served from a subdirectory (e.g. GitHub *project* Pages under
// `/<repo>/`) needs every root-absolute URL — links and assets alike — prefixed
// with that path, or they resolve against the domain root and 404. The physical
// output layout is unchanged (files still land at the artifact root); only the
// URLs *inside* the output are prefixed. All of this is a no-op when `basePath`
// is '' (a root-served site), so a site without `base_path` is byte-identical.
//
// Every prefixer is idempotent: a value already under `basePath` is left alone,
// so build-time rewriting composes safely with basePath-aware `meta.href` and
// the `url()` template helper (double-prefixing can't happen).

// Should this root-absolute value be prefixed? Skip protocol-relative (`//cdn`),
// non-absolute, and already-prefixed values.
const shouldPrefix = (val, basePath) =>
    typeof val === 'string' &&
    val.startsWith('/') &&
    !val.startsWith('//') &&
    val !== basePath &&
    !val.startsWith(`${basePath}/`)

const prefixUrl = (val, basePath) =>
    shouldPrefix(val, basePath) ? `${basePath}${val}` : val

// Rewrite the URL-bearing attributes in a rendered HTML string. Covers the
// attributes Nera and its plugins actually emit; `srcset` is handled specially
// because it holds a comma-separated list of `url descriptor` pairs.
export const rewriteHtmlUrls = (html, basePath) => {
    if (!basePath) return html

    return html
        .replace(
            /\b(href|src|poster|data-search-index)=("|')(\/[^"']*)\2/gi,
            (m, attr, quote, val) =>
                `${attr}=${quote}${prefixUrl(val, basePath)}${quote}`
        )
        .replace(/\bsrcset=("|')([^"']*)\1/gi, (m, quote, list) => {
            const rewritten = list
                .split(',')
                .map((part) => {
                    const seg = part.trim()
                    if (!seg) return part
                    const [url, ...descriptor] = seg.split(/\s+/)
                    return [prefixUrl(url, basePath), ...descriptor].join(' ')
                })
                .join(', ')
            return `srcset=${quote}${rewritten}${quote}`
        })
}

// Rewrite `url(/…)` references inside a CSS string (fonts, background images).
const rewriteCssUrls = (css, basePath) =>
    css.replace(
        /url\(\s*(['"]?)(\/[^)'"]*)\1\s*\)/gi,
        (m, quote, val) =>
            `url(${quote}${prefixUrl(val, basePath)}${quote})`
    )

// Rewrite root-absolute URLs held under `href`/`url` keys in a JSON asset —
// chiefly the search index the search plugin builds from `meta.href`, whose
// per-result links must resolve under the subpath. Done as a format-preserving
// regex on the key/value pair (not a parse+reserialize) so it stays agnostic to
// the emitting plugin's schema and never rewrites unrelated strings (a `content`
// field mentioning a path, say) — only values of an `href`/`url` key.
const rewriteJsonUrls = (json, basePath) =>
    json.replace(
        /("(?:href|url)"\s*:\s*")(\/[^"]*)(")/gi,
        (m, pre, val, post) => `${pre}${prefixUrl(val, basePath)}${post}`
    )

// Rewrite a web app manifest's root-absolute URL fields. Parsed as JSON so we
// only touch known URL keys — never arbitrary strings that happen to start
// with `/`. Returns null (caller keeps the original) if it does not parse.
const rewriteManifestUrls = (json, basePath) => {
    let data
    try {
        data = JSON.parse(json)
    } catch {
        return null
    }

    const pfx = (v) => prefixUrl(v, basePath)
    for (const key of ['start_url', 'scope', 'id']) {
        if (typeof data[key] === 'string') data[key] = pfx(data[key])
    }
    for (const key of ['icons', 'screenshots']) {
        if (Array.isArray(data[key])) {
            data[key].forEach((item) => {
                if (item && typeof item.src === 'string') item.src = pfx(item.src)
            })
        }
    }
    if (Array.isArray(data.shortcuts)) {
        data.shortcuts.forEach((s) => {
            if (s && typeof s.url === 'string') s.url = pfx(s.url)
            if (Array.isArray(s.icons)) {
                s.icons.forEach((it) => {
                    if (it && typeof it.src === 'string') it.src = pfx(it.src)
                })
            }
        })
    }
    return JSON.stringify(data, null, 4)
}

// Second pass over the built `public/` tree: rewrite root-absolute URLs inside
// copied assets that the HTML rewrite can't reach — CSS `url(/…)` and the web
// app manifest. Runs after both asset copies, so it also covers theme assets.
// No-op without a basePath.
export const rewriteAssetUrls = async (publicFolder, basePath) => {
    if (!basePath || !fssync.existsSync(publicFolder)) return

    const walk = async (dir) => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                await walk(full)
                continue
            }
            const lower = entry.name.toLowerCase()
            if (lower.endsWith('.css')) {
                const css = await fs.readFile(full, 'utf-8')
                const out = rewriteCssUrls(css, basePath)
                if (out !== css) await fs.writeFile(full, out, 'utf-8')
            } else if (lower.endsWith('.webmanifest')) {
                const json = await fs.readFile(full, 'utf-8')
                const out = rewriteManifestUrls(json, basePath)
                if (out !== null && out !== json) {
                    await fs.writeFile(full, out, 'utf-8')
                }
            } else if (lower.endsWith('.json')) {
                const json = await fs.readFile(full, 'utf-8')
                const out = rewriteJsonUrls(json, basePath)
                if (out !== json) await fs.writeFile(full, out, 'utf-8')
            }
        }
    }
    await walk(publicFolder)
}
// -----------------------------------------------------------------------------

const getIgnoredFiles = (basePath) => {
    const ignorePath = path.join(basePath, '.neraignore')

    if (fssync.existsSync(ignorePath)) {
        return fssync
            .readFileSync(ignorePath, 'utf8')
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '')
    }
    return []
}

export function ignoreFiles(ignoreList, filePath, sourceRoot) {
    const relativePath = path.relative(sourceRoot, filePath).replace(/\\/g, '/')

    return !ignoreList.some(
        (pattern) =>
            relativePath === pattern || relativePath.startsWith(`${pattern}/`)
    )
}

// `ignoreBase` is the directory to read `.neraignore` from:
//   - omitted → the source's parent (back-compat with the pre-theme layout,
//     where `assets/` sat at the site root so its parent *was* the root)
//   - a path → read `.neraignore` there (pass the site root so a site's ignore
//     list keeps filtering its assets after they move under `theme/`, §2d)
//   - null → skip ignore entirely, as the theme pass does: a theme package's
//     payload is author-controlled (`files:`), so nobody's `.neraignore` filters it
export const copyFolder = async (sourceFolder, targetFolder, ignoreBase) => {
    if (fssync.existsSync(sourceFolder)) {
        const base =
            ignoreBase === undefined ? path.dirname(sourceFolder) : ignoreBase
        const ignore = base === null ? [] : getIgnoredFiles(base)

        try {
            await cpy([`${sourceFolder}/**/*`], targetFolder, {
                parents: true,
                filter: (file) => ignoreFiles(ignore, file.path, sourceFolder),
            })
            console.log(SUCCESS_COLOR, 'Assets copied')
        } catch (err) {
            console.error('Copy failed:', err)
        }
    } else {
        console.log(SUCCESS_COLOR, 'No Assets found')
    }
}

// Pug's own path resolution, replicated so the layered hook below can fall
// through to it when nothing in the chain matches. Absolute includes
// (`/vendor/x/y.pug`) resolve against basedir; relative ones against the
// including file's directory — matching pug's built-in behaviour exactly.
const defaultResolvePath = (filename, source, options) => {
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
const makeLayeredResolver = (roots) => (filename, source, options) => {
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
const resolveEntry = (layout, roots) => {
    for (const root of roots) {
        const p = path.join(root, layout)
        if (fssync.existsSync(p)) return p
    }
    // Fall back to the site root; the missing-file error then surfaces from
    // compileFile with a path the user recognises.
    return path.join(roots[0], layout)
}

export const createHtmlFiles = async (
    data,
    viewsFolder,
    publicFolder,
    theme = null
) => {
    if (fssync.existsSync(viewsFolder)) {
        // No theme → single root, no resolve hook: byte-identical to before.
        const roots = theme ? [viewsFolder, theme.viewsRoot] : [viewsFolder]
        const resolver = theme ? makeLayeredResolver(roots) : null

        // Compile options are constant across the page loop — hoist them out.
        const compileOptions = resolver
            ? { basedir: viewsFolder, plugins: [{ resolve: resolver }] }
            : { basedir: viewsFolder }

        // Compile each distinct layout once per build, then reuse the template
        // function for every page that uses it (ROADMAP-themes.md §6). This loop
        // previously re-ran pug.compileFile per page, recompiling the same tree
        // dozens of times — the dominant build cost (measured ~70× on 69 pages,
        // ~500× on 500, since a site's pages share a handful of layouts). Keyed
        // on the resolved entry path, so different layouts stay separate and,
        // under a theme, a layout resolved from the theme caches independently of
        // one resolved from the site. Scoped to this call — a fresh Map per
        // build, no process-global pug.cache to leak between run()s or tests.
        const compiled = new Map()

        // The site's URL prefix for subdirectory deploys ('' when root-served).
        // Exposed to templates as `url()` so authors can prefix a hardcoded path
        // explicitly (`link(href=url('/css/main.css'))`); the post-render rewrite
        // below also catches paths that weren't wrapped, so `url()` is optional.
        const basePath = data.app?.basePath || ''
        data.url = (p) => prefixUrl(p, basePath)

        for (const pageData of data.pagesData) {
            if (pageData.meta.layout) {
                data.t = (key) =>
                    data.app.translations
                        ? data.app.translations[
                            pageData.meta.lang || data.app.lang
                        ]?.[key] || key
                        : key

                let html = pageData.content

                const entry = resolver
                    ? resolveEntry(pageData.meta.layout, roots)
                    : `${viewsFolder}/${pageData.meta.layout}`

                let fn = compiled.get(entry)
                if (!fn) {
                    fn = pug.compileFile(entry, compileOptions)
                    compiled.set(entry, fn)
                }
                html = fn({ ...data, ...pageData })

                // Prefix root-absolute URLs in the rendered page for a
                // subdirectory deploy (no-op when basePath is '').
                html = rewriteHtmlUrls(html, basePath)

                const htmlPath = path.join(
                    publicFolder,
                    pageData.meta.dirname.replace(/^\/+/, ''),
                    `${pageData.meta.filename}`
                )

                await fs.mkdir(path.dirname(htmlPath), { recursive: true })
                await fs.writeFile(htmlPath, pretty(html), 'utf-8')

                console.log(
                    SUCCESS_COLOR,
                    `HTML created: ${pageData.meta.dirname}`
                )
            }
        }
    } else {
        console.error('Views folder not found')
    }
}

export const deleteFolder = async (folder) => {
    if (fssync.existsSync(folder)) {
        try {
            await rimraf(folder)
            console.log(SUCCESS_COLOR, 'Public folder removed')
        } catch (error) {
            console.error(error)
        }
    }
}
