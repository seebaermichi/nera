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

export const copyFolder = async (sourceFolder, targetFolder) => {
    if (fssync.existsSync(sourceFolder)) {
        const ignore = getIgnoredFiles(path.dirname(sourceFolder))

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

// First-match-wins resolution across an ordered chain of view roots (site
// first, theme second), so a site file overrides the theme's copy of the same
// path while everything else falls through to the theme (ROADMAP-themes.md).
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

                const fn = pug.compileFile(
                    entry,
                    resolver
                        ? { basedir: viewsFolder, plugins: [{ resolve: resolver }] }
                        : { basedir: viewsFolder }
                )
                html = fn({ ...data, ...pageData })

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
