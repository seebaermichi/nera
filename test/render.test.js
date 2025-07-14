import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import os from 'os'
import { copyFolder, createHtmlFiles, deleteFolder } from '../src/render.js'
import dotenv from 'dotenv'

dotenv.config()

const createTempPath = (sub = '') =>
    path.join(
        os.tmpdir(),
        `.nera-test-${Date.now()}-${Math.random().toString(36).slice(2)}${sub}`
    )

describe('copyFolder', () => {
    let srcDir, publicDir, tmpRoot

    beforeEach(async () => {
        tmpRoot = createTempPath()
        srcDir = path.join(tmpRoot, 'src', 'assets')
        publicDir = path.join(tmpRoot, 'public')

        await fs.mkdir(srcDir, { recursive: true })

        await fs.writeFile(path.join(srcDir, 'include.txt'), 'Include me')
        await fs.writeFile(path.join(srcDir, 'ignore.txt'), 'Ignore me')

        const ignoreFile = path.join(tmpRoot, 'src', '.neraignore')
        await fs.mkdir(path.dirname(ignoreFile), { recursive: true })
        await fs.writeFile(ignoreFile, 'ignore.txt\n')

        process.env.TEST_TEMP_DIR = tmpRoot
    })

    afterEach(async () => {
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('copies files excluding ignored ones', async () => {
        await copyFolder(srcDir, publicDir)

        const exists = fssync.existsSync(publicDir)
        expect(exists).toBe(true)

        const files = exists ? await fs.readdir(publicDir) : []
        expect(files).toContain('include.txt')
        expect(files).not.toContain('ignore.txt')
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
