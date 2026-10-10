import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
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

    // Server config such as .htaccess must reach public/; the glob skips
    // dotfiles unless told otherwise.
    it('copies dotfiles and dot-directories', async () => {
        await fs.writeFile(path.join(srcDir, '.htaccess'), 'Options -Indexes')
        await fs.mkdir(path.join(srcDir, '.well-known'), { recursive: true })
        await fs.writeFile(
            path.join(srcDir, '.well-known', 'security.txt'),
            'Contact: mailto:x@example.com'
        )

        await copyFolder(srcDir, publicDir)

        const files = await getAllRelativeFiles(publicDir, publicDir)

        expect(files).toContain('.htaccess')
        expect(files).toContain(path.join('.well-known', 'security.txt'))
    })

    it('filters dotfiles listed in .neraignore', async () => {
        await fs.writeFile(path.join(srcDir, '.DS_Store'), '')
        await fs.writeFile(
            path.join(tmpRoot, 'src', '.neraignore'),
            'ignore.txt\n.DS_Store\n'
        )

        await copyFolder(srcDir, publicDir)

        const files = await getAllRelativeFiles(publicDir, publicDir)

        expect(files).not.toContain('.DS_Store')
    })

    // cpy skipped OS/editor clutter by default; the in-house copy keeps that.
    it('skips junk files even without a .neraignore entry', async () => {
        for (const junk of ['.DS_Store', 'Thumbs.db', 'notes.txt~', '._image.png']) {
            await fs.writeFile(path.join(srcDir, junk), '')
        }

        await copyFolder(srcDir, publicDir)

        const files = await getAllRelativeFiles(publicDir, publicDir)

        expect(files).toEqual(['include.txt'])
    })

    it('copies only files, so an empty directory does not reach public/', async () => {
        await fs.mkdir(path.join(srcDir, 'empty'), { recursive: true })

        await copyFolder(srcDir, publicDir)

        expect(fssync.existsSync(path.join(publicDir, 'empty'))).toBe(false)
    })

    it('keeps the source file mtime', async () => {
        const past = new Date('2020-01-02T03:04:05Z')
        await fs.utimes(path.join(srcDir, 'include.txt'), past, past)

        await copyFolder(srcDir, publicDir)

        const { mtime } = await fs.stat(path.join(publicDir, 'include.txt'))
        expect(mtime.getTime()).toBe(past.getTime())
    })

    it('follows symlinks and skips a dangling one', async () => {
        const outside = path.join(tmpRoot, 'outside')
        await fs.mkdir(outside, { recursive: true })
        await fs.writeFile(path.join(outside, 'linked.txt'), 'via link')
        await fs.symlink(outside, path.join(srcDir, 'linked-dir'))
        await fs.symlink(path.join(outside, 'linked.txt'), path.join(srcDir, 'linked-file.txt'))
        await fs.symlink(path.join(tmpRoot, 'missing'), path.join(srcDir, 'dangling.txt'))
        // A link back up the tree must not loop.
        await fs.symlink(srcDir, path.join(outside, 'loop'))

        await copyFolder(srcDir, publicDir)

        const files = await getAllRelativeFiles(publicDir, publicDir)

        expect(files).toContain(path.join('linked-dir', 'linked.txt'))
        expect(files).toContain('linked-file.txt')
        expect(files).not.toContain('dangling.txt')
        expect(
            await fs.readFile(path.join(publicDir, 'linked-file.txt'), 'utf8')
        ).toBe('via link')
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

    it('logs each page as the path written under public/, without base_path', async () => {
        const page = (dirname, filename) => ({
            meta: {
                layout: 'index.pug',
                dirname,
                filename,
                fullPath: path.posix.join(dirname, filename)
            }
        })
        const data = {
            app: { basePath: '/repo' },
            pagesData: [
                page('/', 'index.html'),
                page('/', 'about.html'),
                page('/de', 'index.html')
            ]
        }
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        try {
            await createHtmlFiles(data, viewsDir, publicDir)
            const lines = log.mock.calls
                .map((args) => args.at(-1))
                .filter((line) => line.startsWith('HTML created:'))

            expect(lines).toEqual([
                'HTML created: /index.html',
                'HTML created: /about.html',
                'HTML created: /de/index.html'
            ])
            expect(fssync.existsSync(path.join(publicDir, 'de/index.html'))).toBe(true)
        } finally {
            log.mockRestore()
        }
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

describe('dotenv loading', () => {
    let tmpRoot

    beforeEach(async () => {
        tmpRoot = createTempPath()
        await fs.mkdir(tmpRoot, { recursive: true })
        await fs.writeFile(path.join(tmpRoot, '.env'), 'NERA_DOTENV_PROBE=loaded\n')
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('loads .env from the site root without printing the injected-env banner', () => {
        // A child process, because render.js calls dotenv.config() once at
        // import time — this worker imported it long ago, from another cwd.
        const renderUrl = pathToFileURL(
            path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../render.js')
        ).href
        const env = { ...process.env }
        delete env.NERA_DOTENV_PROBE
        const result = spawnSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `await import(${JSON.stringify(renderUrl)}); console.log(process.env.NERA_DOTENV_PROBE)`
            ],
            { cwd: tmpRoot, env, encoding: 'utf8' }
        )

        expect(result.status).toBe(0)
        expect(result.stdout.trim()).toBe('loaded')
        expect(result.stderr + result.stdout).not.toContain('injected env')
    })
})
