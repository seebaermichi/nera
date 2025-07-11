import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import { loadAppData, getPagesData, defaultSettings } from '../src/core'
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
})

afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
})

describe('loadAppData', () => {
    it('loads app.yaml config and page list', () => {
        const settings = {
            folders: {
                ...defaultSettings.folders,
                config: CONFIG,
                pages: PAGES
            }
        }
        const data = loadAppData(settings)

        expect(data.app.name).toBe('TestSite')
        expect(data.pages).toContain('index.md')
    })

    it('returns empty config if app.yaml is missing', () => {
        const settings = {
            folders: {
                ...defaultSettings.folders,
                config: '/non/existing/path',
                pages: PAGES
            }
        }
        const data = loadAppData(settings)
        expect(data.app).toEqual({})
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
        expect(result[0].meta.dirname).toBe('.')
    })

    it('handles nested page paths correctly', () => {
        const result = getPagesData(['blog/post.md'], PAGES)
        expect(result[0].meta.href).toBe('/blog/post.html')
        expect(result[0].meta.dirname).toBe('blog')
    })

    it('handles invalid markdown gracefully', () => {
        const result = getPagesData(['broken.md'], PAGES)
        expect(result[0].content).toContain('::::')
    })
})
