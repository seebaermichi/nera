import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import os from 'os'
import dotenv from 'dotenv'
import run from '../index.js'

dotenv.config()

const createTempPath = (sub = '') =>
    path.join(
        os.tmpdir(),
        `.nera-test-${Date.now()}-${Math.random().toString(36).slice(2)}${sub}`
    )

describe('run()', () => {
    let TMP_DIR, CONFIG, PAGES, VIEWS, ASSETS, DIST

    beforeEach(async () => {
        TMP_DIR = createTempPath()
        CONFIG = path.join(TMP_DIR, 'config')
        PAGES = path.join(TMP_DIR, 'pages')
        VIEWS = path.join(TMP_DIR, 'views')
        ASSETS = path.join(TMP_DIR, 'assets')
        DIST = path.join(TMP_DIR, 'public')

        await fs.mkdir(CONFIG, { recursive: true })
        await fs.mkdir(PAGES, { recursive: true })
        await fs.mkdir(VIEWS, { recursive: true })
        await fs.mkdir(ASSETS, { recursive: true })

        await fs.writeFile(
            path.join(CONFIG, 'app.yaml'),
            'name: Site\nlang: en'
        )

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

        // make config available to plugins that might use TEST_TEMP_DIR
        process.env.TEST_TEMP_DIR = TMP_DIR
    })

    afterEach(async () => {
        await fs.rm(TMP_DIR, { recursive: true, force: true })
    })

    it('generates full static site', async () => {
        const settings = {
            folders: {
                config: CONFIG,
                pages: PAGES,
                views: VIEWS,
                assets: ASSETS,
                dist: DIST,
                plugins: path.join(TMP_DIR, 'src/plugins') // even if unused, stays consistent
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
