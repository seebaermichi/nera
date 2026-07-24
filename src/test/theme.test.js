import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import os from 'os'
import { resolveTheme, deepMerge } from '../theme.js'
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

    it('resolves a local theme to the views root at the package root', async () => {
        // The spec names the theme root; payload sits directly at that root, no
        // `theme/` wrapper (§1b, revised). Here the root is a subfolder, so
        // `./my-theme`.
        await fs.mkdir(path.join(tmpRoot, 'my-theme', 'views'), {
            recursive: true
        })

        const theme = resolveTheme({
            app: { theme: './my-theme' },
            cwd: tmpRoot
        })

        expect(theme.name).toBe('./my-theme')
        expect(theme.root).toBe(path.join(tmpRoot, 'my-theme'))
        expect(theme.viewsRoot).toBe(path.join(tmpRoot, 'my-theme', 'views'))
    })

    it('resolves `theme: .` — the theme root is the cwd itself', async () => {
        // Package root is the cwd, so the payload is <cwd>/views directly (§1b,
        // revised — no wrapper).
        await fs.mkdir(path.join(tmpRoot, 'views'), { recursive: true })

        const theme = resolveTheme({ app: { theme: '.' }, cwd: tmpRoot })

        expect(theme.viewsRoot).toBe(path.join(tmpRoot, 'views'))
    })

    it('resolves a bare name to @nera-static/theme-<name> in node_modules', async () => {
        // Simulate an installed package: <cwd>/node_modules/@nera-static/
        // theme-docs with its payload at the package root and a package.json
        // exposing itself.
        const pkgRoot = path.join(
            tmpRoot,
            'node_modules',
            '@nera-static',
            'theme-docs'
        )
        await fs.mkdir(path.join(pkgRoot, 'views'), {
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
        expect(theme.viewsRoot).toBe(path.join(realPkgRoot, 'views'))
        expect(theme.assetsRoot).toBe(path.join(realPkgRoot, 'assets'))
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

describe('deepMerge (§1c merge semantics)', () => {
    it('merges nested objects per key, override winning at the leaf', () => {
        const base = { colors: { primary: '#000', accent: '#f00' }, label: 'A' }
        const over = { colors: { primary: '#0b5' } }
        expect(deepMerge(base, over)).toEqual({
            colors: { primary: '#0b5', accent: '#f00' },
            label: 'A'
        })
    })

    it('replaces arrays wholesale rather than concatenating', () => {
        const base = { fonts: ['serif', 'sans'] }
        const over = { fonts: ['mono'] }
        expect(deepMerge(base, over)).toEqual({ fonts: ['mono'] })
    })

    it('lets a scalar override replace an object, and vice versa', () => {
        expect(deepMerge({ x: { a: 1 } }, { x: 2 })).toEqual({ x: 2 })
        expect(deepMerge({ x: 2 }, { x: { a: 1 } })).toEqual({ x: { a: 1 } })
    })

    it('does not mutate either argument', () => {
        const base = { colors: { primary: '#000' } }
        const over = { colors: { primary: '#fff' } }
        deepMerge(base, over)
        expect(base.colors.primary).toBe('#000')
        expect(over.colors.primary).toBe('#fff')
    })

    it('returns the theme defaults unchanged when the site overrides nothing', () => {
        const base = { colors: { primary: '#000' }, label: 'A' }
        expect(deepMerge(base, {})).toEqual(base)
    })
})

describe('resolveTheme config merge (§1c)', () => {
    let tmpRoot

    // A local `./base` theme ships defaults; the site's own config/theme.yaml
    // (at <site>/config, per the default folders) overrides selected keys.
    const writeYaml = (file, body) =>
        fs.writeFile(file, body, 'utf-8')

    beforeEach(async () => {
        tmpRoot = createTempPath()
        await fs.mkdir(path.join(tmpRoot, 'base', 'views'), { recursive: true })
        await fs.mkdir(path.join(tmpRoot, 'base', 'config'), {
            recursive: true
        })
        await fs.mkdir(path.join(tmpRoot, 'config'), { recursive: true })

        await writeYaml(
            path.join(tmpRoot, 'base', 'config', 'theme.yaml'),
            'label: Base\ncolors:\n    primary: "#000"\n    accent: "#f00"\n'
        )
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('deep-merges the site config over the theme defaults', async () => {
        await writeYaml(
            path.join(tmpRoot, 'config', 'theme.yaml'),
            'colors:\n    primary: "#0b5"\n'
        )

        const theme = resolveTheme({ app: { theme: './base' }, cwd: tmpRoot })

        // primary overridden, accent + label inherited from the theme defaults
        expect(theme.config).toEqual({
            label: 'Base',
            colors: { primary: '#0b5', accent: '#f00' }
        })
    })

    it('inherits every default when the site has no config/theme.yaml', async () => {
        // No <site>/config/theme.yaml written at all.
        const theme = resolveTheme({ app: { theme: './base' }, cwd: tmpRoot })

        expect(theme.config).toEqual({
            label: 'Base',
            colors: { primary: '#000', accent: '#f00' }
        })
    })

    it('honours a custom folders.config location for the site override', async () => {
        await fs.mkdir(path.join(tmpRoot, 'settings'), { recursive: true })
        await writeYaml(
            path.join(tmpRoot, 'settings', 'theme.yaml'),
            'label: Site\n'
        )

        const theme = resolveTheme({
            app: { theme: './base', folders: { config: './settings' } },
            cwd: tmpRoot
        })

        expect(theme.config.label).toBe('Site')
        expect(theme.config.colors).toEqual({ primary: '#000', accent: '#f00' })
    })

    it('yields the theme defaults alone when the theme ships no config/theme.yaml', async () => {
        // A theme with no config dir at all — merge still succeeds, contributing
        // only whatever the site provides.
        await fs.mkdir(path.join(tmpRoot, 'bare', 'views'), { recursive: true })
        await writeYaml(
            path.join(tmpRoot, 'config', 'theme.yaml'),
            'colors:\n    primary: "#0b5"\n'
        )

        const theme = resolveTheme({ app: { theme: './bare' }, cwd: tmpRoot })

        expect(theme.config).toEqual({ colors: { primary: '#0b5' } })
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

    // Revised §1b layout: the site's own presentation lives under `<site>/theme/`
    // (the core.js probe points views/assets there), and `theme: ./base` names an
    // installed base theme whose views/assets sit directly at its own root. The
    // chain is therefore [<site>/theme, <base>]. run() resolves everything from
    // process.cwd(), so this chdir's into a throwaway project and restores cwd
    // afterwards, then asserts the two-pass asset copy (§2): base-theme assets
    // reach public/, a site-only asset is added, and a colliding asset is won by
    // the site's own `theme/` layer.
    beforeEach(async () => {
        prevCwd = process.cwd()
        tmpRoot = createTempPath()

        const mk = (...p) => fs.mkdir(path.join(tmpRoot, ...p), { recursive: true })
        await mk('config')
        await mk('pages')
        // the site's own presentation, grouped under theme/
        await mk('theme', 'views')
        await mk('theme', 'assets', 'css')
        // the installed base theme — payload directly at its root, no wrapper
        await mk('base', 'views', 'layouts')
        await mk('base', 'assets', 'css')

        await fs.writeFile(
            path.join(tmpRoot, 'package.json'),
            JSON.stringify({ name: 'demo', private: true })
        )
        await fs.writeFile(
            path.join(tmpRoot, 'config', 'app.yaml'),
            'name: Demo\nlang: en\ntheme: ./base'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'pages', 'index.md'),
            '---\ntitle: Home\nlayout: layouts/layout.pug\n---\n# Hi\n'
        )
        // The layout is provided only by the base theme; the site does not
        // override it, so it must resolve through the chain from base/views.
        await fs.writeFile(
            path.join(tmpRoot, 'base', 'views', 'layouts', 'layout.pug'),
            'doctype html\nhtml\n  body\n    != content'
        )
        // base(theme)-only, site-only, and a colliding asset the site must win.
        await fs.writeFile(
            path.join(tmpRoot, 'base', 'assets', 'css', 'main.css'),
            'THEME main'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'base', 'assets', 'css', 'shared.css'),
            'THEME shared'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'theme', 'assets', 'css', 'custom.css'),
            'SITE custom'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'theme', 'assets', 'css', 'shared.css'),
            'SITE shared'
        )

        // §2d wiring: a site-root .neraignore excludes a site asset; the base
        // theme ships its own .neraignore that must NOT filter its payload.
        await fs.writeFile(
            path.join(tmpRoot, 'theme', 'assets', 'css', 'skip.css'),
            'SITE skip'
        )
        await fs.writeFile(path.join(tmpRoot, '.neraignore'), 'css/skip.css\n')
        await fs.writeFile(
            path.join(tmpRoot, 'base', 'assets', 'css', 'keep.css'),
            'THEME keep'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'base', '.neraignore'),
            'css/keep.css\n'
        )

        process.chdir(tmpRoot)
    })

    afterEach(async () => {
        process.chdir(prevCwd)
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('copies theme assets then site assets, with the site winning collisions', async () => {
        // views/assets point at the site's own `theme/` layer (what the core.js
        // probe resolves them to — see core.test.js for the probe itself). Paths
        // are absolute so `cpy`'s dest is unambiguous under a symlinked tmpdir.
        await run({
            folders: {
                config: path.join(tmpRoot, 'config'),
                pages: path.join(tmpRoot, 'pages'),
                views: path.join(tmpRoot, 'theme', 'views'),
                assets: path.join(tmpRoot, 'theme', 'assets'),
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

    it('honours the site-root .neraignore but leaves the theme pass unfiltered', async () => {
        await run({
            folders: {
                config: path.join(tmpRoot, 'config'),
                pages: path.join(tmpRoot, 'pages'),
                views: path.join(tmpRoot, 'theme', 'views'),
                assets: path.join(tmpRoot, 'theme', 'assets'),
                dist: path.join(tmpRoot, 'public'),
                plugins: path.join(tmpRoot, 'src/plugins')
            }
        })

        const cssDir = path.join(tmpRoot, 'public', 'css')

        // site asset dropped by the site's own .neraignore
        expect(fssync.existsSync(path.join(cssDir, 'skip.css'))).toBe(false)
        // theme payload copied whole — the theme's .neraignore does not filter it
        expect(await fs.readFile(path.join(cssDir, 'keep.css'), 'utf8')).toBe(
            'THEME keep'
        )
    })
})

describe('run() exposes app.theme.config to templates (§1c)', () => {
    let tmpRoot, prevCwd

    // End-to-end through run(): a base theme ships config/theme.yaml defaults and
    // a layout that renders app.theme.{name,package,config}; the site overrides
    // one token via its own config/theme.yaml. Proves the merge is exposed on the
    // app object the templates render with.
    beforeEach(async () => {
        prevCwd = process.cwd()
        tmpRoot = createTempPath()

        const mk = (...p) =>
            fs.mkdir(path.join(tmpRoot, ...p), { recursive: true })
        await mk('config')
        await mk('pages')
        await mk('theme', 'views')
        await mk('base', 'views', 'layouts')
        await mk('base', 'config')

        await fs.writeFile(
            path.join(tmpRoot, 'package.json'),
            JSON.stringify({ name: 'demo', private: true })
        )
        await fs.writeFile(
            path.join(tmpRoot, 'config', 'app.yaml'),
            'name: Demo\nlang: en\ntheme: ./base'
        )
        // Site overrides only the primary colour; label + accent inherited.
        await fs.writeFile(
            path.join(tmpRoot, 'config', 'theme.yaml'),
            'colors:\n    primary: "#0b5"\n'
        )
        // Theme defaults.
        await fs.writeFile(
            path.join(tmpRoot, 'base', 'config', 'theme.yaml'),
            'label: Base\ncolors:\n    primary: "#000"\n    accent: "#f00"\n'
        )
        await fs.writeFile(
            path.join(tmpRoot, 'pages', 'index.md'),
            '---\ntitle: Home\nlayout: layouts/layout.pug\n---\n# Hi\n'
        )
        // The layout reads the merged config off app.theme.
        await fs.writeFile(
            path.join(tmpRoot, 'base', 'views', 'layouts', 'layout.pug'),
            [
                'doctype html',
                'html',
                '  body',
                '    p(id="name")= app.theme.name',
                '    p(id="package")= String(app.theme.package)',
                '    p(id="primary")= app.theme.config.colors.primary',
                '    p(id="accent")= app.theme.config.colors.accent',
                '    p(id="label")= app.theme.config.label'
            ].join('\n')
        )

        process.chdir(tmpRoot)
    })

    afterEach(async () => {
        process.chdir(prevCwd)
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('renders the merged theme config, site overriding one token', async () => {
        await run({
            folders: {
                config: path.join(tmpRoot, 'config'),
                pages: path.join(tmpRoot, 'pages'),
                views: path.join(tmpRoot, 'theme', 'views'),
                assets: path.join(tmpRoot, 'theme', 'assets'),
                dist: path.join(tmpRoot, 'public'),
                plugins: path.join(tmpRoot, 'src/plugins')
            }
        })

        const html = await fs.readFile(
            path.join(tmpRoot, 'public', 'index.html'),
            'utf8'
        )

        expect(html).toContain('id="name">./base<')
        // a local theme has no package name
        expect(html).toContain('id="package">null<')
        expect(html).toContain('id="primary">#0b5<') // site override wins
        expect(html).toContain('id="accent">#f00<') // inherited from theme
        expect(html).toContain('id="label">Base<') // inherited from theme
    })
})
