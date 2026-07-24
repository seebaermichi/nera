import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import { loadAppData, getPagesData, defaultSettings } from '../core'
import dotenv from 'dotenv'

dotenv.config()

const TMP_DIR = path.resolve(process.env.TEST_TEMP_DIR || '.test-temp')
const CONFIG = path.join(TMP_DIR, 'config')
const PAGES = path.join(TMP_DIR, 'pages')

beforeAll(async () => {
    if (fssync.existsSync(TMP_DIR)) {
        await fs.rm(TMP_DIR, { recursive: true, force: true })
    }

    await fs.mkdir(CONFIG, { recursive: true })
    await fs.mkdir(PAGES, { recursive: true })

    await fs.writeFile(
        path.join(CONFIG, 'app.yaml'),
        'name: TestSite\nlang: en'
    )
    await fs.writeFile(
        path.join(PAGES, 'index.md'),
        '---\ntitle: Home\n---\n\n# Welcome!'
    )
    await fs.mkdir(path.join(PAGES, 'blog'), { recursive: true })
    await fs.writeFile(path.join(PAGES, 'blog/post.md'), '# Blog Post')
    await fs.writeFile(path.join(PAGES, 'broken.md'), '::::')
    await fs.writeFile(path.join(PAGES, 'page.mdx'), '# MDX')
    await fs.writeFile(
        path.join(PAGES, 'dated-created.md'),
        '---\ntitle: Dated\ncreatedAt: 2021-03-04\n---\n\n# Dated'
    )
    await fs.writeFile(
        path.join(PAGES, 'dated-date.md'),
        '---\ntitle: Dated\ndate: 2019-11-02\n---\n\n# Dated'
    )
    await fs.writeFile(
        path.join(PAGES, 'dated-both.md'),
        '---\ntitle: Dated\ncreatedAt: 2022-06-07\ndate: 2019-11-02\n---\n\n# Dated'
    )
    await fs.mkdir(path.join(PAGES, 'a.md.notes'), { recursive: true })
    await fs.writeFile(path.join(PAGES, 'a.md.notes/b.md'), '# Notes')
})

afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
})

describe('loadAppData', () => {
    // The generator repo's own root now contains a `theme/` folder (revised
    // §1b scaffold), so the folder probe would swap views/assets to theme/ for
    // any test inheriting that cwd. These merge tests assert the legacy
    // defaults, so run them from a theme-less directory (TMP_DIR has no
    // `theme/`). The nested probe describe sets its own cwd on top of this.
    let prevCwd
    beforeEach(() => {
        prevCwd = process.cwd()
        process.chdir(TMP_DIR)
    })
    afterEach(() => {
        process.chdir(prevCwd)
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
        expect(Object.keys(data.app)).toEqual(['folders']) // no other keys present
    })

    // A `folders` block in app.yaml used to be honoured by anything reading
    // `app.folders` — every plugin — while the render pipeline kept using the
    // defaults, so plugin output and the copied folder could disagree.
    describe('folders from app.yaml', () => {
        const CONFIG_WITH_FOLDERS = path.join(TMP_DIR, 'config-folders')

        beforeAll(async () => {
            await fs.mkdir(CONFIG_WITH_FOLDERS, { recursive: true })
            await fs.writeFile(
                path.join(CONFIG_WITH_FOLDERS, 'app.yaml'),
                `name: TestSite\nfolders:\n  assets: ./static\n  pages: ${PAGES}\n`
            )
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
        let probeRoot, prevCwd

        beforeEach(async () => {
            prevCwd = process.cwd()
            probeRoot = path.join(TMP_DIR, `probe-${Math.random().toString(36).slice(2)}`)
            await fs.mkdir(path.join(probeRoot, 'config'), { recursive: true })
            await fs.writeFile(
                path.join(probeRoot, 'config', 'app.yaml'),
                'name: Probe\nlang: en\n'
            )
            process.chdir(probeRoot)
        })

        afterEach(async () => {
            process.chdir(prevCwd)
            await fs.rm(probeRoot, { recursive: true, force: true })
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
                expect.stringContaining('deprecated')
            )

            warn.mockRestore()
        })

        it('lets an explicit app.yaml folders block win over the probe', async () => {
            await fs.mkdir(path.join(probeRoot, 'theme', 'views'), {
                recursive: true,
            })
            await fs.writeFile(
                path.join(probeRoot, 'config', 'app.yaml'),
                'name: Probe\nfolders:\n  views: ./custom-views\n'
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
