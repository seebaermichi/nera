import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import os from 'os'
import {
    copyFolder,
    createHtmlFiles,
    deleteFolder,
    rewriteHtmlUrls,
    rewriteAssetUrls,
} from '../render.js'
import dotenv from 'dotenv'

dotenv.config()

const createTempPath = (sub = '') =>
    path.join(
        os.tmpdir(),
        `.nera-test-${Date.now()}-${Math.random().toString(36).slice(2)}${sub}`
    )

async function getAllRelativeFiles (dir, base) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async (entry) => {
            const res = path.resolve(dir, entry.name)
            if (entry.isDirectory()) {
                return getAllRelativeFiles(res, base)
            } else {
                return path.relative(base, res)
            }
        })
    )
    return files.flat()
}

describe('copyFolder', () => {
    let srcDir, publicDir, tmpRoot

    beforeEach(async () => {
        tmpRoot = createTempPath()
        srcDir = path.join(tmpRoot, 'src', 'assets')
        publicDir = path.join(tmpRoot, 'public')

        await fs.mkdir(srcDir, { recursive: true })

        await fs.writeFile(path.join(srcDir, 'include.txt'), 'Include me')
        await fs.writeFile(path.join(srcDir, 'ignore.txt'), 'Ignore me')

        const cssIgnorePath = path.join(srcDir, 'css/ignore.css')
        await fs.mkdir(path.dirname(cssIgnorePath), { recursive: true })
        await fs.writeFile(cssIgnorePath, '/* CSS comment */')

        const ignoreFile = path.join(tmpRoot, 'src', '.neraignore')
        await fs.mkdir(path.dirname(ignoreFile), { recursive: true })
        await fs.writeFile(ignoreFile, 'ignore.txt\ncss/ignore.css\n')

        process.env.TEST_TEMP_DIR = tmpRoot
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('copies files excluding ignored ones', async () => {
        await copyFolder(srcDir, publicDir)

        const exists = fssync.existsSync(publicDir)
        expect(exists).toBe(true)

        const files = exists
            ? await getAllRelativeFiles(publicDir, publicDir)
            : []

        expect(files).toContain('include.txt')
        expect(files).not.toContain('ignore.txt')
        expect(files).not.toContain(path.join('css', 'ignore.css'))
    })

    // §2d: the theme asset pass passes `null` so a theme package's payload is
    // never filtered by a .neraignore — author-controlled via `files:`.
    it('skips the ignore list entirely when ignoreBase is null', async () => {
        await copyFolder(srcDir, publicDir, null)

        const files = await getAllRelativeFiles(publicDir, publicDir)

        expect(files).toContain('include.txt')
        expect(files).toContain('ignore.txt') // not filtered
        expect(files).toContain(path.join('css', 'ignore.css'))
    })

    // §2d: the site asset pass passes the site root, so a site's .neraignore
    // keeps filtering its assets even though they moved under theme/assets and
    // the source folder's parent is no longer the site root.
    it('reads .neraignore from an explicit base directory', async () => {
        const base = path.join(tmpRoot, 'siteroot')
        await fs.mkdir(base, { recursive: true })
        await fs.writeFile(path.join(base, '.neraignore'), 'include.txt\n')

        await copyFolder(srcDir, publicDir, base)

        const files = await getAllRelativeFiles(publicDir, publicDir)

        // the explicit base's list wins; the parent's src/.neraignore is not read
        expect(files).not.toContain('include.txt')
        expect(files).toContain('ignore.txt')
    })
})

describe('createHtmlFiles', () => {
    let viewsDir, publicDir, tmpRoot

    beforeEach(async () => {
        tmpRoot = createTempPath()
        viewsDir = path.join(tmpRoot, 'src', 'views')
        publicDir = path.join(tmpRoot, 'public')

        await fs.mkdir(viewsDir, { recursive: true })

        const layoutPath = path.join(viewsDir, 'index.pug')
        await fs.writeFile(
            layoutPath,
            'html\n  head\n    title #{meta.title}\n  body\n    h1= t("headline")'
        )
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('resolves absolute includes against the views folder', async () => {
        // Plugin READMEs document `include /vendor/<plugin>/<template>`, which
        // only compiles when pug is given a basedir.
        const vendorDir = path.join(viewsDir, 'vendor', 'x')
        await fs.mkdir(vendorDir, { recursive: true })
        await fs.writeFile(path.join(vendorDir, 'y.pug'), 'p Vendor partial')
        await fs.writeFile(
            path.join(viewsDir, 'with-include.pug'),
            'html\n  body\n    include /vendor/x/y.pug'
        )

        const data = {
            app: {},
            pagesData: [
                {
                    meta: {
                        layout: 'with-include.pug',
                        dirname: '/',
                        filename: 'index.html',
                        fullPath: '/index.html'
                    }
                }
            ]
        }

        await createHtmlFiles(data, viewsDir, publicDir)

        const content = await fs.readFile(
            path.join(publicDir, 'index.html'),
            'utf8'
        )
        expect(content).toContain('<p>Vendor partial</p>')
    })

    it('renders HTML from Pug template and writes to public folder', async () => {
        const data = {
            app: { lang: 'en', translations: { en: { headline: 'Welcome!' } } },
            pagesData: [
                {
                    meta: {
                        layout: 'index.pug',
                        title: 'Home',
                        lang: 'en',
                        dirname: '/',
                        filename: 'index.html',
                        fullPath: '/index.html'
                    }
                }
            ]
        }

        await createHtmlFiles(data, viewsDir, publicDir)

        const filePath = path.join(publicDir, 'index.html')
        const exists = fssync.existsSync(filePath)
        expect(exists).toBe(true)

        const content = await fs.readFile(filePath, 'utf8')
        expect(content).toContain('<h1>Welcome!</h1>')
        expect(content).toContain('<title>Home</title>')
    })
})

describe('deleteFolder', () => {
    let publicDir

    beforeEach(async () => {
        publicDir = createTempPath('/public')
        await fs.mkdir(publicDir, { recursive: true })
        await fs.writeFile(path.join(publicDir, 'temp.txt'), 'test')
    })

    afterEach(async () => {
        await fs
            .rm(publicDir, { recursive: true, force: true })
            .catch(() => {})
    })

    it('removes the public folder if it exists', async () => {
        expect(fssync.existsSync(publicDir)).toBe(true)

        await deleteFolder(publicDir)

        expect(fssync.existsSync(publicDir)).toBe(false)
    })
})

describe('rewriteHtmlUrls (base_path)', () => {
    const BP = '/nera-website'

    it('prefixes root-absolute href/src/data-search-index attributes', () => {
        const html =
            '<link href="/css/main.css"><a href="/de/index.html">de</a>' +
            '<script src="/js/search.js"></script>' +
            '<input data-search-index="/search-index.json">'
        expect(rewriteHtmlUrls(html, BP)).toBe(
            '<link href="/nera-website/css/main.css">' +
                '<a href="/nera-website/de/index.html">de</a>' +
                '<script src="/nera-website/js/search.js"></script>' +
                '<input data-search-index="/nera-website/search-index.json">'
        )
    })

    it('leaves external, protocol-relative, and anchor URLs untouched', () => {
        const html =
            '<a href="https://example.com/x">e</a>' +
            '<img src="//cdn.example.com/i.png">' +
            '<a href="#top">top</a><a href="page.html">rel</a>'
        expect(rewriteHtmlUrls(html, BP)).toBe(html)
    })

    it('is idempotent — never double-prefixes an already-prefixed URL', () => {
        const once = rewriteHtmlUrls('<a href="/a.html">a</a>', BP)
        expect(rewriteHtmlUrls(once, BP)).toBe(once)
        expect(once).toBe('<a href="/nera-website/a.html">a</a>')
    })

    it('prefixes each URL in a srcset list, preserving descriptors', () => {
        const html = '<img srcset="/a.png 1x, /b.png 2x">'
        expect(rewriteHtmlUrls(html, BP)).toBe(
            '<img srcset="/nera-website/a.png 1x, /nera-website/b.png 2x">'
        )
    })

    it('is a no-op with an empty basePath', () => {
        const html = '<a href="/a.html">a</a>'
        expect(rewriteHtmlUrls(html, '')).toBe(html)
    })
})

describe('rewriteAssetUrls (base_path)', () => {
    const BP = '/nera-website'
    let dir

    beforeEach(async () => {
        dir = createTempPath()
        await fs.mkdir(dir, { recursive: true })
    })

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true })
    })

    it('rewrites url(/…) in CSS but not external or relative urls', async () => {
        const css =
            '@font-face{src:url("/fonts/x.woff2")}' +
            '.a{background:url(/img/a.png)}' +
            '.b{background:url(https://cdn/x.png)}'
        const file = path.join(dir, 'main.css')
        await fs.writeFile(file, css)

        await rewriteAssetUrls(dir, BP)

        expect(await fs.readFile(file, 'utf-8')).toBe(
            '@font-face{src:url("/nera-website/fonts/x.woff2")}' +
                '.a{background:url(/nera-website/img/a.png)}' +
                '.b{background:url(https://cdn/x.png)}'
        )
    })

    it('rewrites start_url and icon src in a .webmanifest', async () => {
        const file = path.join(dir, 'site.webmanifest')
        await fs.writeFile(
            file,
            JSON.stringify({
                start_url: '/',
                icons: [{ src: '/icon-192.png' }, { src: 'https://cdn/i.png' }],
            })
        )

        await rewriteAssetUrls(dir, BP)

        const out = JSON.parse(await fs.readFile(file, 'utf-8'))
        expect(out.start_url).toBe('/nera-website/')
        expect(out.icons[0].src).toBe('/nera-website/icon-192.png')
        expect(out.icons[1].src).toBe('https://cdn/i.png')
    })

    it('rewrites href/url values in a .json asset (e.g. the search index)', async () => {
        const file = path.join(dir, 'search-index.json')
        const original = JSON.stringify([
            { title: 'About', href: '/about.html', content: 'see /docs later' },
            { title: 'Ext', url: 'https://x/y', href: '/de/x.html' },
        ])
        await fs.writeFile(file, original)

        await rewriteAssetUrls(dir, BP)

        const out = JSON.parse(await fs.readFile(file, 'utf-8'))
        expect(out[0].href).toBe('/nera-website/about.html')
        // a path mentioned inside a non-URL field is left untouched
        expect(out[0].content).toBe('see /docs later')
        expect(out[1].href).toBe('/nera-website/de/x.html')
        expect(out[1].url).toBe('https://x/y')
    })

    it('is a no-op with an empty basePath', async () => {
        const file = path.join(dir, 'main.css')
        await fs.writeFile(file, '.a{background:url(/img/a.png)}')
        await rewriteAssetUrls(dir, '')
        expect(await fs.readFile(file, 'utf-8')).toBe(
            '.a{background:url(/img/a.png)}'
        )
    })
})
