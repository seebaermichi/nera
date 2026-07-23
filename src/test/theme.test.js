import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { resolveTheme } from '../theme.js'
import { createHtmlFiles } from '../render.js'

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

    it('resolves a local ./ theme to its views root', async () => {
        await fs.mkdir(path.join(tmpRoot, 'theme', 'views'), { recursive: true })

        const theme = resolveTheme({ app: { theme: './theme' }, cwd: tmpRoot })

        expect(theme.name).toBe('./theme')
        expect(theme.viewsRoot).toBe(path.join(tmpRoot, 'theme', 'views'))
    })

    it('throws for an npm / @scope theme (not implemented in slice 1)', () => {
        expect(() => resolveTheme({ app: { theme: 'docs' } })).toThrow(
            /only local/
        )
        expect(() =>
            resolveTheme({ app: { theme: '@acme/my-theme' } })
        ).toThrow(/only local/)
    })

    it('fails loudly when a configured theme is missing', () => {
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
