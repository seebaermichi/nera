import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import { copyFolder, createHtmlFiles, deleteFolder } from '../src/render.js'
import dotenv from 'dotenv'

dotenv.config()

const TMP_DIR = path.resolve(process.env.TEST_TEMP_DIR || '.test-temp')
const SRC = path.join(TMP_DIR, 'src')
const ASSETS = path.join(SRC, 'assets')
const VIEWS = path.join(SRC, 'views')
const PUBLIC = path.join(TMP_DIR, 'public')

beforeAll(async () => {
    if (fssync.existsSync(TMP_DIR)) {
        await fs.rm(TMP_DIR, { recursive: true, force: true })
    }

    await fs.mkdir(ASSETS, { recursive: true })
    await fs.mkdir(VIEWS, { recursive: true })

    const includePath = path.join(ASSETS, 'include.txt')
    const ignorePath = path.join(ASSETS, 'ignore.txt')
    const ignoreFilePath = path.join(SRC, '.neraignore')
    const layoutPath = path.join(VIEWS, 'index.pug')

    await fs.writeFile(includePath, 'Include me')
    await fs.writeFile(ignorePath, 'Ignore me')
    await fs.writeFile(ignoreFilePath, 'ignore.txt\n')
    await fs.writeFile(
        layoutPath,
        'html\n  head\n    title #{meta.title}\n  body\n    h1= t("headline")'
    )
})

afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
})

describe('copyFolder', () => {
    it('copies files excluding ignored ones', async () => {
        await copyFolder(ASSETS, PUBLIC)

        const exists = fssync.existsSync(PUBLIC)
        expect(exists).toBe(true)

        const files = exists ? await fs.readdir(PUBLIC) : []
        expect(files).toContain('include.txt')
        expect(files).not.toContain('ignore.txt')
    })
})

describe('createHtmlFiles', () => {
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

        await createHtmlFiles(data, VIEWS, PUBLIC)

        const filePath = path.join(PUBLIC, 'index.html')
        const exists = fssync.existsSync(filePath)
        expect(exists).toBe(true)

        const content = await fs.readFile(filePath, 'utf8')
        expect(content).toContain('<h1>Welcome!</h1>')
        expect(content).toContain('<title>Home</title>')
    })
})

describe('deleteFolder', () => {
    it('removes the public folder if it exists', async () => {
        await fs.mkdir(PUBLIC, { recursive: true })
        const dummyFile = path.join(PUBLIC, 'temp.txt')
        await fs.writeFile(dummyFile, 'test')

        expect(fssync.existsSync(dummyFile)).toBe(true)

        await deleteFolder(PUBLIC)

        expect(fssync.existsSync(PUBLIC)).toBe(false)
    })
})
