import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import os from 'os'
import { copyFolder, createHtmlFiles, deleteFolder } from '../render.js'
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
