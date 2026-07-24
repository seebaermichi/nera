import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import {
    defaultResolvePath,
    makeLayeredResolver,
    resolveEntry,
} from '../resolve.js'

// Parity suite pinning the layered resolver's behaviour, extracted from
// render.js so `@nera-static/validate` can reuse it. These encode the exact
// contract the build depends on — change them only when the build's resolution
// deliberately changes.

let root, siteViews, themeViews

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'nera-resolve-'))
    siteViews = path.join(root, 'site', 'theme', 'views')
    themeViews = path.join(root, 'theme-pkg', 'views')
    await fs.mkdir(path.join(siteViews, 'pages'), { recursive: true })
    await fs.mkdir(path.join(siteViews, 'partials'), { recursive: true })
    await fs.mkdir(path.join(themeViews, 'pages'), { recursive: true })
    await fs.mkdir(path.join(themeViews, 'partials'), { recursive: true })
})

afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
})

const write = (p) => fs.writeFile(p, '| x\n')

describe('defaultResolvePath', () => {
    it('resolves a relative include against the including file directory', () => {
        const out = defaultResolvePath(
            'partials/head.pug',
            path.join(siteViews, 'pages', 'layout.pug'),
            { basedir: siteViews }
        )
        expect(out).toBe(path.join(siteViews, 'pages', 'partials', 'head.pug'))
    })

    it('resolves an absolute include against basedir', () => {
        const out = defaultResolvePath('/vendor/x/y.pug', 'ignored', {
            basedir: siteViews,
        })
        expect(out).toBe(path.join(siteViews, 'vendor', 'x', 'y.pug'))
    })
})

describe('makeLayeredResolver', () => {
    it('lets a site file override the theme copy of the same relative path', async () => {
        await write(path.join(siteViews, 'partials', 'head.pug'))
        await write(path.join(themeViews, 'partials', 'head.pug'))

        const resolve = makeLayeredResolver([siteViews, themeViews])
        const out = resolve(
            '../partials/head.pug',
            path.join(themeViews, 'pages', 'layout.pug'),
            { basedir: siteViews }
        )
        expect(out).toBe(path.join(siteViews, 'partials', 'head.pug'))
    })

    it('falls through to the theme when the site has no copy', async () => {
        await write(path.join(themeViews, 'partials', 'footer.pug'))

        const resolve = makeLayeredResolver([siteViews, themeViews])
        const out = resolve(
            '../partials/footer.pug',
            path.join(themeViews, 'pages', 'layout.pug'),
            { basedir: siteViews }
        )
        expect(out).toBe(path.join(themeViews, 'partials', 'footer.pug'))
    })

    it('returns the default path when nothing in the chain exists', () => {
        const resolve = makeLayeredResolver([siteViews, themeViews])
        const out = resolve(
            '../partials/missing.pug',
            path.join(themeViews, 'pages', 'layout.pug'),
            { basedir: siteViews }
        )
        // The fallback path, so pug's own missing-file error surfaces next.
        expect(out).toBe(path.join(themeViews, 'partials', 'missing.pug'))
    })

    it('behaves like default resolution with a single (themeless) root', async () => {
        await write(path.join(siteViews, 'partials', 'head.pug'))

        const resolve = makeLayeredResolver([siteViews])
        const out = resolve(
            '../partials/head.pug',
            path.join(siteViews, 'pages', 'layout.pug'),
            { basedir: siteViews }
        )
        expect(out).toBe(path.join(siteViews, 'partials', 'head.pug'))
    })
})

describe('resolveEntry', () => {
    it('resolves a layout from the site root first', async () => {
        await write(path.join(siteViews, 'pages', 'home.pug'))
        await write(path.join(themeViews, 'pages', 'home.pug'))

        const out = resolveEntry('pages/home.pug', [siteViews, themeViews])
        expect(out).toBe(path.join(siteViews, 'pages', 'home.pug'))
    })

    it('resolves a layout from the theme when the site lacks it', async () => {
        await write(path.join(themeViews, 'pages', 'home.pug'))

        const out = resolveEntry('pages/home.pug', [siteViews, themeViews])
        expect(out).toBe(path.join(themeViews, 'pages', 'home.pug'))
    })

    it('falls back to the site root when the layout is missing everywhere', () => {
        const out = resolveEntry('pages/home.pug', [siteViews, themeViews])
        expect(out).toBe(path.join(siteViews, 'pages', 'home.pug'))
    })
})
