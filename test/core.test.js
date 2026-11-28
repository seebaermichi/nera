import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import { tempDir, useSiteCwd, writeFiles } from '@nera-static/test-utils'
import {
    loadAppData,
    getPagesData,
    defaultSettings,
    normalizeBasePath,
} from '../src/core.js'

// One fixture site for the whole file; tempDir removes it afterwards.
const TMP_DIR = tempDir('nera-core-')
const CONFIG = path.join(TMP_DIR, 'config')
const PAGES = path.join(TMP_DIR, 'pages')

beforeAll(() => {
    writeFiles(TMP_DIR, {
        'config/app.yaml': 'name: TestSite\nlang: en',
        'pages/index.md': '---\ntitle: Home\n---\n\n# Welcome!',
        'pages/blog/post.md': '# Blog Post',
        'pages/broken.md': '::::',
        'pages/page.mdx': '# MDX',
        'pages/dated-created.md': '---\ntitle: Dated\ncreatedAt: 2021-03-04\n---\n\n# Dated',
        'pages/dated-date.md': '---\ntitle: Dated\ndate: 2019-11-02\n---\n\n# Dated',
        'pages/dated-both.md':
            '---\ntitle: Dated\ncreatedAt: 2022-06-07\ndate: 2019-11-02\n---\n\n# Dated',
        'pages/yaml-features.md':
            '---\nbase: &b\n  a: 1\nchild:\n  <<: *b\n  c: 2\ntitle: first\ntitle: last\npublished: 2024-05-06\nquoted: "2024-05-06"\ndraft: yes\n---\n\n# YAML',
        'pages/bad-frontmatter.md': '---\ntitle: [unclosed\n---\n\n# Bad',
        'pages/a.md.notes/b.md': '# Notes',
    })
})

describe('loadAppData', () => {
    // The generator repo's own root contains a `theme/` folder (revised
    // §1b scaffold), so the folder probe would swap views/assets to theme/ for
    // any test reading the real cwd. These merge tests assert the legacy
    // defaults, so `process.cwd()` points at an empty, theme-less dir. The
    // nested probe describe points it at its own site on top of this.
    beforeEach(() => {
        useSiteCwd()
    })

    it('loads app.yaml config and page list', () => {
        const settings = {
            folders: {
                ...defaultSettings.folders,
                config: CONFIG,
                pages: PAGES,
            },
        }
        const data = loadAppData(settings)

        expect(data.app.name).toBe('TestSite')
        expect(data.pages).toContain('index.md')
    })

    it('returns config with folders even if app.yaml is missing', () => {
        const settings = {
            folders: {
                ...defaultSettings.folders,
                config: '/non/existing/path',
                pages: PAGES,
            },
        }

        const data = loadAppData(settings)

        expect(data.app).toHaveProperty('folders')
        expect(data.app.folders).toEqual(settings.folders)
        // `basePath` is always resolved (defaults to '' — root-served); no other
        // keys are invented when app.yaml is absent.
        expect(Object.keys(data.app).sort()).toEqual(['basePath', 'folders'])
        expect(data.app.basePath).toBe('')
    })

    // A `folders` block in app.yaml used to be honoured by anything reading
    // `app.folders` — every plugin — while the render pipeline kept using the
    // defaults, so plugin output and the copied folder could disagree.
    describe('folders from app.yaml', () => {
        const CONFIG_WITH_FOLDERS = path.join(TMP_DIR, 'config-folders')

        beforeAll(() => {
            writeFiles(CONFIG_WITH_FOLDERS, {
                'app.yaml': `name: TestSite\nfolders:\n  assets: ./static\n  pages: ${PAGES}\n`,
            })
        })

        const load = () =>
            loadAppData({
                folders: {
                    ...defaultSettings.folders,
                    config: CONFIG_WITH_FOLDERS,
                },
            })

        it('overrides the default for a key app.yaml names', () => {
            expect(load().app.folders.assets).toBe('./static')
        })

        it('keeps the defaults for every key it does not name', () => {
            const { folders } = load().app

            expect(folders.dist).toBe(defaultSettings.folders.dist)
            expect(folders.views).toBe(defaultSettings.folders.views)
        })

        it('lists pages from the configured folder', () => {
            expect(load().pages).toContain('index.md')
        })

        it('never lets app.yaml redirect the config folder it was read from', () => {
            expect(load().app.folders.config).toBe(CONFIG_WITH_FOLDERS)
        })
    })

    // Plugins such as pagination see pages in this order, so it is pinned:
    // depth first, each folder's entries in byte order, dotfiles and dot
    // folders skipped, names relative to the pages folder (as the
    // fs-readdir-recursive package listed them).
    it('lists pages depth first in byte order, without dotfiles', () => {
        const pages = path.join(TMP_DIR, 'pages-order')
        writeFiles(pages, {
            'b.md': '', 'a/z.md': '', 'a/b.md': '', 'a-b.md': '', 'a.md': '',
            '.hidden.md': '', '.drafts/x.md': '',
        })

        const data = loadAppData({
            folders: { ...defaultSettings.folders, config: CONFIG, pages },
        })

        expect(data.pages).toEqual([
            path.join('a', 'b.md'), path.join('a', 'z.md'), 'a-b.md', 'a.md', 'b.md',
        ])
    })

    it('handles missing pages directory gracefully', () => {
        const settings = {
            folders: {
                ...defaultSettings.folders,
                config: CONFIG,
                pages: '/non/existing/path',
            },
        }
        const data = loadAppData(settings)
        expect(data.pages).toEqual([])
    })

    // Revised theme layout (ROADMAP-themes.md §1b): the presentation folders are
    // resolved by probing for a `<site>/theme/` directory relative to cwd. These
    // assert the returned folder strings only (no file copying), so they are
    // immune to the symlinked-tmpdir quirks that dog the render/copy tests.
    describe('theme/ folder probe', () => {
        let probeRoot

        beforeEach(() => {
            probeRoot = useSiteCwd({ 'config/app.yaml': 'name: Probe\nlang: en\n' })
        })

        // The default folders are relative; they must resolve against
        // process.cwd(), not the real cwd (this repo, which has its own
        // config/app.yaml and pages/).
        it('reads app.yaml and lists pages of the site process.cwd() names', () => {
            writeFiles(probeRoot, { 'pages/only.md': '# Only' })

            const data = loadAppData()

            expect(data.app.name).toBe('Probe')
            expect(data.pages).toEqual(['only.md'])
        })

        it('points views/assets at theme/ when that folder exists', async () => {
            await fs.mkdir(path.join(probeRoot, 'theme', 'views'), {
                recursive: true,
            })

            const { folders } = loadAppData().app

            expect(folders.views).toBe('./theme/views')
            expect(folders.assets).toBe('./theme/assets')
        })

        it('falls back to legacy root views/assets with a deprecation warning', async () => {
            const warn = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})

            const { folders } = loadAppData().app

            expect(folders.views).toBe('./views')
            expect(folders.assets).toBe('./assets')
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('deprecated'),
            )

            warn.mockRestore()
        })

        it('points views/assets at theme/ for a theme-only site, without the warning', async () => {
            await fs.writeFile(
                path.join(probeRoot, 'config', 'app.yaml'),
                'name: Probe\ntheme: business\n',
            )
            const warn = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})

            const { folders } = loadAppData().app

            expect(folders.views).toBe('./theme/views')
            expect(folders.assets).toBe('./theme/assets')
            expect(warn).not.toHaveBeenCalledWith(
                expect.stringContaining('deprecated'),
            )

            warn.mockRestore()
        })

        it('keeps a legacy root views/ even when a theme is named', async () => {
            await fs.mkdir(path.join(probeRoot, 'views'))
            await fs.writeFile(
                path.join(probeRoot, 'config', 'app.yaml'),
                'name: Probe\ntheme: business\n',
            )
            const warn = vi
                .spyOn(console, 'warn')
                .mockImplementation(() => {})

            const { folders } = loadAppData().app

            expect(folders.views).toBe('./views')

            warn.mockRestore()
        })

        it('lets an explicit app.yaml folders block win over the probe', async () => {
            await fs.mkdir(path.join(probeRoot, 'theme', 'views'), {
                recursive: true,
            })
            await fs.writeFile(
                path.join(probeRoot, 'config', 'app.yaml'),
                'name: Probe\nfolders:\n  views: ./custom-views\n',
            )

            const { folders } = loadAppData().app

            expect(folders.views).toBe('./custom-views')
            // assets was not named, so the probe still points it at theme/
            expect(folders.assets).toBe('./theme/assets')
        })
    })
})

describe('getPagesData', () => {
    it('extracts rendered content and metadata from markdown', () => {
        const pages = ['index.md']
        const result = getPagesData(pages, PAGES)

        expect(result).toHaveLength(1)
        expect(result[0].content).toMatch(/<h1[^>]*>Welcome!<\/h1>/)
        expect(result[0].meta.href).toBe('/index.html')
        expect(result[0].meta.createdAt).toBeInstanceOf(Date)
        expect(result[0].meta.fullPath).toBe('/index.html')
        expect(result[0].meta.dirname).toBe('/')
        expect(result[0].meta.filename).toBe('index.html')
    })

    it('handles nested page paths correctly', () => {
        const result = getPagesData(['blog/post.md'], PAGES)
        expect(result[0].meta.href).toBe('/blog/post.html')
        expect(result[0].meta.dirname).toBe('/blog')
    })

    it('handles invalid markdown gracefully', () => {
        const result = getPagesData(['broken.md'], PAGES)
        expect(result[0].content).toContain('::::')
    })

    it('keeps href and fullPath in agreement for a .mdx page', () => {
        const [{ meta }] = getPagesData(['page.mdx'], PAGES)

        // `page.split('.md')[0]` used to truncate this to `/page.html` while
        // href kept `.mdx`, so the file landed where no link pointed.
        expect(meta.fullPath).toBe(meta.href)
        expect(meta.href).toBe('/page.mdx')
    })

    it('keeps href and fullPath in agreement when .md appears mid-path', () => {
        const [{ meta }] = getPagesData([path.join('a.md.notes', 'b.md')], PAGES)

        expect(meta.fullPath).toBe(meta.href)
        expect(meta.href).toBe('/a.md.notes/b.html')
        expect(meta.dirname).toBe('/a.md.notes')
        expect(meta.filename).toBe('b.html')
    })

    it('emits forward-slash separated paths regardless of platform', () => {
        const [{ meta }] = getPagesData([path.join('blog', 'post.md')], PAGES)

        for (const value of [meta.href, meta.fullPath, meta.dirname]) {
            expect(value).not.toContain('\\')
        }
        expect(meta.href).toBe('/blog/post.html')
    })

    it('skips non-existing files', () => {
        const result = getPagesData(['non-existing.md'], PAGES)
        expect(result).toHaveLength(0) // File should be skipped, not included with empty content
    })

    // base_path (subdirectory deploy) is applied at the render/asset URL rewrite,
    // NOT here: `meta.href` stays in the site's logical (un-prefixed) namespace
    // so templates/plugins can do URL math on it without double-prefixing. See
    // the rewrite tests in render.test.js.
    it('keeps meta.href in the logical namespace (base_path applied later)', () => {
        const [{ meta }] = getPagesData(['blog/post.md'], PAGES)
        expect(meta.href).toBe('/blog/post.html')
        expect(meta.fullPath).toBe('/blog/post.html')
    })

    // markdown-it-meta kept the parsed frontmatter on the shared parser and never
    // reset it, so a page without frontmatter inherited the previous page's —
    // `layout` included, which made a page that should be skipped render.
    it('does not carry frontmatter over to a page that has none', () => {
        const [first, second] = getPagesData(['index.md', 'blog/post.md'], PAGES)

        expect(first.meta.title).toBe('Home')
        expect(second.meta.title).toBeUndefined()
    })

    // The frontmatter parser behaves as markdown-it-meta's js-yaml 3 did on
    // what real pages use.
    describe('frontmatter parsing', () => {
        let meta
        beforeAll(() => {
            ;[{ meta }] = getPagesData(['yaml-features.md'], PAGES)
        })

        it('turns an unquoted date into a Date and keeps a quoted one a string', () => {
            expect(meta.published).toBeInstanceOf(Date)
            expect(meta.published.toISOString()).toBe('2024-05-06T00:00:00.000Z')
            expect(meta.quoted).toBe('2024-05-06')
        })

        it('resolves << merge keys', () => {
            expect(meta.child).toEqual({ a: 1, c: 2 })
        })

        it('lets a repeated key take the last value', () => {
            expect(meta.title).toBe('last')
        })

        it('keeps yes/no as strings (YAML 1.2 booleans only)', () => {
            expect(meta.draft).toBe('yes')
        })

        it('skips a page whose frontmatter does not parse', () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
            expect(getPagesData(['bad-frontmatter.md'], PAGES)).toHaveLength(0)
            expect(errors).toHaveBeenCalled()
            errors.mockRestore()
        })
    })

    // Golden edge cases of the `---` fence: what each file renders to and
    // which frontmatter it yields. Pinned before core switched from its own
    // markdown-it block rule to plugin-utils' `splitFrontmatter`, so the
    // switch provably changes nothing.
    describe('frontmatter fence (golden cases)', () => {
        const GOLDEN = path.join(TMP_DIR, 'golden')
        const files = {
            'crlf.md': '---\r\ntitle: CRLF\r\n---\r\n\r\n# Body\r\n',
            'cr.md': '---\rtitle: CR\r---\r\r# Body\r',
            'empty.md': '---\n---\n\n# Body\n',
            'unclosed.md': '---\ntitle: Open\nlayout: x\n',
            'bom.md': '\uFEFF---\ntitle: BOM\n---\n\n# Body\n',
            'indented.md': ' ---\ntitle: Indented\n---\n\n# Body\n',
            'four.md': '----\ntitle: Four\n---\n\n# Body\n',
            'trailing.md': '--- \ntitle: Trailing\n---\n\n# Body\n',
            'close-four.md': '---\ntitle: Close\n----\nmore: yes\n---\n\nText\n',
            'dup.md': '---\ntitle: a\ntitle: b\n---\nText\n',
            'merge.md': '---\nbase: &b\n  a: 1\nchild:\n  <<: *b\n  c: 2\n---\nText\n',
            'none.md': '# Just markdown\n\n---\n\nAfter rule\n',
            'tight.md': '---\ntitle: Tight\n---\n# Heading right after\n    indented code\n',
        }
        const expected = {
            'crlf.md': ['<h1>Body</h1>\n', { title: 'CRLF' }],
            'cr.md': ['<h1>Body</h1>\n', { title: 'CR' }],
            'empty.md': ['<h1>Body</h1>\n', {}],
            'unclosed.md': ['', { title: 'Open', layout: 'x' }],
            'bom.md': ['<h2>\uFEFF---\ntitle: BOM</h2>\n<h1>Body</h1>\n', {}],
            'indented.md': ['<hr>\n<h2>title: Indented</h2>\n<h1>Body</h1>\n', {}],
            'four.md': ['<hr>\n<h2>title: Four</h2>\n<h1>Body</h1>\n', {}],
            'trailing.md': ['<hr>\n<h2>title: Trailing</h2>\n<h1>Body</h1>\n', {}],
            'dup.md': ['<p>Text</p>\n', { title: 'b' }],
            'merge.md': ['<p>Text</p>\n', { base: { a: 1 }, child: { a: 1, c: 2 } }],
            'none.md': ['<h1>Just markdown</h1>\n<hr>\n<p>After rule</p>\n', {}],
            'tight.md': [
                '<h1>Heading right after</h1>\n<pre><code>indented code\n</code></pre>\n',
                { title: 'Tight' },
            ],
        }
        // The frontmatter alone, without the keys getPagesData derives.
        const DERIVED = ['createdAt', 'href', 'fullPath', 'dirname', 'filename']
        const ownMeta = ({ meta }) =>
            Object.fromEntries(
                Object.entries(meta).filter(([key]) => !DERIVED.includes(key)),
            )

        beforeAll(() => {
            writeFiles(GOLDEN, files)
        })

        it.each(Object.keys(expected))('renders %s as before', (name) => {
            const [page] = getPagesData([name], GOLDEN)
            const [content, meta] = expected[name]
            expect(page.content).toBe(content)
            expect(ownMeta(page)).toEqual(meta)
        })

        it('does not take `----` as the closing line', () => {
            const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
            expect(getPagesData(['close-four.md'], GOLDEN)).toHaveLength(0)
            errors.mockRestore()
        })

        it('gives a page without frontmatter none after one with it', () => {
            const pages = getPagesData(['merge.md', 'none.md'], GOLDEN)
            expect(pages.map(ownMeta)).toEqual([expected['merge.md'][1], {}])
        })
    })

    // createdAt resolution (nera-platform R1): frontmatter wins over the
    // filesystem birthtime, which is unreliable under CI where a fresh
    // checkout stamps every file with the same date and silently breaks any
    // date ordering/display.
    describe('createdAt resolution', () => {
        const asISO = (d) => new Date(d).toISOString().slice(0, 10)

        it('reads createdAt from frontmatter when present', () => {
            const [{ meta }] = getPagesData(['dated-created.md'], PAGES)
            expect(asISO(meta.createdAt)).toBe('2021-03-04')
        })

        it('falls back to a frontmatter `date` when createdAt is absent', () => {
            const [{ meta }] = getPagesData(['dated-date.md'], PAGES)
            expect(asISO(meta.createdAt)).toBe('2019-11-02')
        })

        it('prefers createdAt over date when both are present', () => {
            const [{ meta }] = getPagesData(['dated-both.md'], PAGES)
            expect(asISO(meta.createdAt)).toBe('2022-06-07')
        })

        it('falls back to filesystem birthtime when frontmatter has no date', () => {
            // index.md carries a title but no date keys, so createdAt must come
            // from the file's birthtime — a Date near now for a just-written file.
            const [{ meta }] = getPagesData(['index.md'], PAGES)
            expect(meta.createdAt).toBeInstanceOf(Date)
            expect(Number.isNaN(new Date(meta.createdAt).getTime())).toBe(false)
        })
    })
})

describe('normalizeBasePath', () => {
    it('returns "" for absent/blank/root values (root-served, no-op)', () => {
        for (const raw of [undefined, null, '', '   ', '/', 42, {}]) {
            expect(normalizeBasePath(raw)).toBe('')
        }
    })

    it('adds a leading slash and strips trailing slashes', () => {
        expect(normalizeBasePath('nera-website')).toBe('/nera-website')
        expect(normalizeBasePath('/nera-website/')).toBe('/nera-website')
        expect(normalizeBasePath('  /foo/bar//  ')).toBe('/foo/bar')
    })

    it('preserves an already-normalised nested path', () => {
        expect(normalizeBasePath('/foo/bar')).toBe('/foo/bar')
    })
})
