import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import dotenv from 'dotenv'
import run from '../src/index.js'

dotenv.config()

const TMP_DIR = path.resolve(process.env.TEST_TEMP_DIR || '.test-temp')
const CONFIG = path.join(TMP_DIR, 'config')
const PAGES = path.join(TMP_DIR, 'pages')
const VIEWS = path.join(TMP_DIR, 'views')
const ASSETS = path.join(TMP_DIR, 'assets')
const DIST = path.join(TMP_DIR, 'public')

beforeAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
    await fs.mkdir(CONFIG, { recursive: true })
    await fs.mkdir(PAGES, { recursive: true })
    await fs.mkdir(VIEWS, { recursive: true })
    await fs.mkdir(ASSETS, { recursive: true })

    await fs.writeFile(path.join(CONFIG, 'app.yaml'), 'name: Site\nlang: en')
    await fs.writeFile(
        path.join(PAGES, 'index.md'),
        `---
title: Site
layout: layout.pug
---

# Hello World
`
    )
    await fs.writeFile(
        path.join(VIEWS, 'layout.pug'),
        `doctype html
html
  head
    title #{ meta.title }
  body !{content}
`
    )
    await fs.writeFile(
        path.join(ASSETS, 'style.css'),
        'body { background: #fff; }'
    )
})

afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
})

describe('run()', () => {
    it('generates full static site', async () => {
        const settings = {
            folders: {
                config: CONFIG,
                pages: PAGES,
                views: VIEWS,
                assets: ASSETS,
                dist: DIST,
                plugins: path.join(TMP_DIR, 'src/plugins')
            }
        }

        await run(settings)

        const htmlExists = fssync.existsSync(path.join(DIST, 'index.html'))
        const cssExists = fssync.existsSync(path.join(DIST, 'style.css'))

        expect(htmlExists).toBe(true)
        expect(cssExists).toBe(true)

        const html = await fs.readFile(path.join(DIST, 'index.html'), 'utf-8')

        expect(html).toMatch(/<title>Site<\/title>/)
        expect(html).toMatch(/<h1[^>]*>Hello World<\/h1>/)
    })
})
