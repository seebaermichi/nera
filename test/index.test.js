import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import fssync from 'node:fs'
import { folders, makeSite } from '@nera-static/test-utils'
import run, * as core from '../src/index.js'
import * as engineSubpath from '@nera-static/core/engine'
import pkg from '../package.json' with { type: 'json' }

describe('run()', () => {
    let root

    beforeEach(() => {
        root = makeSite({
            files: {
                'config/app.yaml': 'name: Site\nlang: en',
                'pages/index.md': '---\ntitle: Site\nlayout: layout.pug\n---\n\n# Hello World\n',
                'views/layout.pug': 'doctype html\nhtml\n  head\n    title #{ meta.title }\n  body !{content}\n',
                'assets/style.css': 'body { background: #fff; }',
            },
        })
    })

    it('generates full static site', async () => {
        const { dist } = folders(root)

        await run({ folders: folders(root) })

        expect(fssync.existsSync(path.join(dist, 'index.html'))).toBe(true)
        expect(fssync.existsSync(path.join(dist, 'style.css'))).toBe(true)

        const html = await fs.readFile(path.join(dist, 'index.html'), 'utf-8')
        expect(html).toMatch(/<title>Site<\/title>/)
        expect(html).toMatch(/<h1[^>]*>Hello World<\/h1>/)
    })
})

describe('public API: the template-engine seam', () => {
    it('exports compileLayout and templateExtension from the barrel', () => {
        expect(typeof core.compileLayout).toBe('function')
        expect(core.templateExtension).toBe('.pug')
    })

    it('exports the same bindings as @nera-static/core/engine', () => {
        expect(engineSubpath.compileLayout).toBe(core.compileLayout)
        expect(engineSubpath.templateExtension).toBe(core.templateExtension)
    })

    it('ships the module the ./engine export points at', () => {
        const target = pkg.exports['./engine']
        expect(target).toBe('./src/engine.js')
        expect(pkg.files).toContain(target.replace(/^\.\//, ''))
    })
})
