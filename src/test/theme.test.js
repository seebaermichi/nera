import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { resolveTheme } from '../theme.js'
import { createHtmlFiles } from '../render.js'
import run from '../index.js'

const createTempPath = (sub = '') =>
    path.join(
        os.tmpdir(),
        `.nera-theme-test-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}${sub}`
    )

describe('resolveTheme', () => {
    let tmpRoot

    beforeEach(async () => {
        tmpRoot = createTempPath()
        await fs.mkdir(tmpRoot, { recursive: true })
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('returns null when no theme is configured', () => {
        expect(resolveTheme({ app: {} })).toBeNull()
        expect(resolveTheme({ app: { theme: undefined } })).toBeNull()
    })

    it('resolves a local theme to the views root under its theme/ wrapper', async () => {
        // The spec names the package root; payload lives under <root>/theme/
        // (§1b). Here the package root is a subfolder, so `./my-theme`.
        await fs.mkdir(path.join(tmpRoot, 'my-theme', 'theme', 'views'), {
            recursive: true
        })

        const theme = resolveTheme({
            app: { theme: './my-theme' },
            cwd: tmpRoot
        })

        expect(theme.name).toBe('./my-theme')
        expect(theme.root).toBe(path.join(tmpRoot, 'my-theme'))
        expect(theme.viewsRoot).toBe(
            path.join(tmpRoot, 'my-theme', 'theme', 'views')
        )
    })

    it('resolves `theme: .` for a theme developed in place', async () => {
        // Package root is the cwd itself; payload under <cwd>/theme/, alongside
        // the site's own <cwd>/views (no collision) — the §1b local diagram.
        await fs.mkdir(path.join(tmpRoot, 'theme', 'views'), { recursive: true })

        const theme = resolveTheme({ app: { theme: '.' }, cwd: tmpRoot })

        expect(theme.viewsRoot).toBe(path.join(tmpRoot, 'theme', 'views'))
    })

    it('resolves a bare name to @nera-static/theme-<name> in node_modules', async () => {
        // Simulate an installed package: <cwd>/node_modules/@nera-static/
        // theme-docs with the theme/ payload and a package.json exposing itself.
        const pkgRoot = path.join(
            tmpRoot,
            'node_modules',
            '@nera-static',
            'theme-docs'
        )
        await fs.mkdir(path.join(pkgRoot, 'theme', 'views'), {
            recursive: true
        })
        await fs.writeFile(
            path.join(pkgRoot, 'package.json'),
            JSON.stringify({
                name: '@nera-static/theme-docs',
                version: '1.0.0',
                exports: { './package.json': './package.json' }
            })
        )
        // The site itself needs a package.json for createRequire's base.
        await fs.writeFile(
            path.join(tmpRoot, 'package.json'),
            JSON.stringify({ name: 'site' })
        )

        const theme = resolveTheme({ app: { theme: 'docs' }, cwd: tmpRoot })

        // require.resolve returns the realpath, so normalise the expected root
        // through it too (macOS /var → /private/var).
        const realPkgRoot = await fs.realpath(pkgRoot)
        expect(theme.package).toBe('@nera-static/theme-docs')
        expect(theme.viewsRoot).toBe(path.join(realPkgRoot, 'theme', 'views'))
        expect(theme.assetsRoot).toBe(path.join(realPkgRoot, 'theme', 'assets'))
    })

    it('fails loudly when a bare-name theme is not installed', async () => {
        await fs.writeFile(
            path.join(tmpRoot, 'package.json'),
            JSON.stringify({ name: 'site' })
        )
        expect(() =>
            resolveTheme({ app: { theme: 'nope' }, cwd: tmpRoot })
        ).toThrow(/not installed/)
    })

    it('fails loudly when a local theme is missing', () => {
        expect(() =>
            resolveTheme({ app: { theme: './nope' }, cwd: tmpRoot })
        ).toThrow(/does not exist/)
    })
})

describe('createHtmlFiles with a theme (layered resolution)', () => {
    let tmpRoot, siteViews, themeViews, publicDir

    // A theme provides the layout, a header and a footer; the site overrides
    // only the header. This is the fixture that proved the mechanism in the
    // ROADMAP, now driven through the real createHtmlFiles.
    beforeEach(async () => {
        tmpRoot = createTempPath()
        siteViews = path.join(tmpRoot, 'views')
        themeViews = path.join(tmpRoot, 'theme', 'views')

        publicDir = path.join(tmpRoot, 'public')

        await fs.mkdir(path.join(themeViews, 'layouts'), { recursive: true })
        await fs.mkdir(path.join(themeViews, 'partials'), { recursive: true })
        await fs.mkdir(path.join(siteViews, 'partials'), { recursive: true })

        await fs.writeFile(
            path.join(themeViews, 'layouts', 'layout.pug'),
            'html\n  body\n    include ../partials/header.pug\n    include ../partials/footer.pug'
        )
        await fs.writeFile(
            path.join(themeViews, 'partials', 'header.pug'),
            'h1 THEME header'
        )
        await fs.writeFile(
            path.join(themeViews, 'partials', 'footer.pug'),
            'footer THEME footer'
        )
        // Site overrides only the header.
        await fs.writeFile(
            path.join(siteViews, 'partials', 'header.pug'),
            'h1 SITE header'
        )
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    const pageData = {
        app: {},
        pagesData: [
            {
                content: '',
                meta: {
                    layout: 'layouts/layout.pug',
                    dirname: '/',
                    filename: 'index.html'
                }
            }
        ]
    }

    it('resolves the layout from the theme and overrides one file from the site', async () => {
        const theme = { viewsRoot: themeViews }

        await createHtmlFiles(
            { ...pageData },
            siteViews,
            publicDir,
            theme
        )

        const html = await fs.readFile(
            path.join(publicDir, 'index.html'),
            'utf8'
        )

        // Layout came from the theme; header overridden by the site; footer
        // fell through to the theme.
        expect(html).toContain('SITE header')
        expect(html).not.toContain('THEME header')
        expect(html).toContain('THEME footer')
    })
})

describe('createHtmlFiles resolves extends across the chain', () => {
    let tmpRoot, siteViews, themeViews, publicDir

    // A page template (views/pages/home.pug) extends a base shell
    // (views/layouts/base.pug) that includes a partial. The site overrides only
    // the partial. This exercises the `extends` resolution path — distinct from
    // `include` — through the layered resolver, plus a cross-chain override
    // reached via extends.
    beforeEach(async () => {
        tmpRoot = createTempPath()
        siteViews = path.join(tmpRoot, 'views')
        themeViews = path.join(tmpRoot, 'theme', 'views')
        publicDir = path.join(tmpRoot, 'public')

        await fs.mkdir(path.join(themeViews, 'layouts'), { recursive: true })
        await fs.mkdir(path.join(themeViews, 'pages'), { recursive: true })
        await fs.mkdir(path.join(themeViews, 'partials'), { recursive: true })
        await fs.mkdir(path.join(siteViews, 'partials'), { recursive: true })

        await fs.writeFile(
            path.join(themeViews, 'layouts', 'base.pug'),
            'html\n  body\n    include ../partials/header.pug\n    main\n      block content'
        )
        await fs.writeFile(
            path.join(themeViews, 'pages', 'home.pug'),
            'extends ../layouts/base.pug\n\nblock content\n  p PAGE home'
        )
        await fs.writeFile(
            path.join(themeViews, 'partials', 'header.pug'),
            'h1 THEME header'
        )
        await fs.writeFile(
            path.join(siteViews, 'partials', 'header.pug'),
            'h1 SITE header'
        )
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('extends a theme base and honours a site partial override', async () => {
        await createHtmlFiles(
            {
                app: {},
                pagesData: [
                    {
                        content: '',
                        meta: {
                            layout: 'pages/home.pug',
                            dirname: '/',
                            filename: 'index.html'
                        }
                    }
                ]
            },
            siteViews,
            publicDir,
            { viewsRoot: themeViews }
        )

        const html = await fs.readFile(
            path.join(publicDir, 'index.html'),
            'utf8'
        )

        expect(html).toContain('PAGE home') // block filled → extends resolved
        expect(html).toContain('SITE header') // partial overridden via extends
        expect(html).not.toContain('THEME header')
    })
})

describe('run() with a theme (assets layering)', () => {
    let tmpRoot, prevCwd

    // run() resolves the theme from process.cwd(), so this test chdir's into a
    // throwaway project and restores cwd afterwards. It builds a `theme: .`
    // in-place theme and asserts the two-pass asset copy (§2): theme assets
    // reach public/, a site-only asset is added, and a same-path asset is won
    // by the site.
    beforeEach(async () => {
        prevCwd = process.cwd()
        tmpRoot = createTempPath()

        const mk = (...p) => fs.mkdir(path.join(tmpRoot, ...p), { recursive: true })
        await mk('config')
        await mk('pages')
        await mk('views')
        await mk('assets', 'css')
        await mk('theme', 'views', 'layouts')
        await mk('theme', 'assets', 'css')

        await fs.writeFile(
            path.join(tmpRoot, 'package.json'),
            JSON.stringify({ name: 'demo', private: true })
        )
        await fs.writeFile(
            path.join(tmpRoot, 'config', 'app.yaml'),
            'name: Demo\nlang: en\ntheme: .'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'pages', 'index.md'),
            '---\ntitle: Home\nlayout: layouts/layout.pug\n---\n# Hi\n'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'theme', 'views', 'layouts', 'layout.pug'),
            'doctype html\nhtml\n  body\n    != content'
        )
        // theme-only, site-only, and a colliding asset the site must win.
        await fs.writeFile(
            path.join(tmpRoot, 'theme', 'assets', 'css', 'main.css'),
            'THEME main'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'theme', 'assets', 'css', 'shared.css'),
            'THEME shared'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'assets', 'css', 'custom.css'),
            'SITE custom'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'assets', 'css', 'shared.css'),
            'SITE shared'
        )

        process.chdir(tmpRoot)
    })

    afterEach(async () => {
        process.chdir(prevCwd)
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('copies theme assets then site assets, with the site winning collisions', async () => {
        await run({
            folders: {
                config: path.join(tmpRoot, 'config'),
                pages: path.join(tmpRoot, 'pages'),
                views: path.join(tmpRoot, 'views'),
                assets: path.join(tmpRoot, 'assets'),
                dist: path.join(tmpRoot, 'public'),
                plugins: path.join(tmpRoot, 'src/plugins')
            }
        })

        const read = (f) =>
            fs.readFile(path.join(tmpRoot, 'public', 'css', f), 'utf8')

        expect(await read('main.css')).toBe('THEME main') // theme-only
        expect(await read('custom.css')).toBe('SITE custom') // site-only
        expect(await read('shared.css')).toBe('SITE shared') // site wins
    })
})
