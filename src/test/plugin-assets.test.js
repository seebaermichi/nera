import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import os from 'os'
import { createHash } from 'crypto'
import { getPluginsData, validateAsset } from '../setup-plugins.js'
import run from '../index.js'

// The `getAssets` plugin hook (core 4.13.0, nera-plugin-images/ROADMAP.md D2):
// plugins return `[{ from, to }]` and core copies them into public/ after the
// theme's assets and before the site's.

const createTempPath = () =>
    path.join(
        os.tmpdir(),
        `.nera-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )

const write = async (file, content) => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
}

const hashOf = (content) =>
    createHash('sha256').update(content).digest('hex').slice(0, 10)

// Every file under `dir` as { relPath: content }, for byte-for-byte comparison.
const snapshotTree = async (dir) => {
    const out = {}
    const walk = async (d) => {
        for (const entry of await fs.readdir(d, { withFileTypes: true })) {
            const full = path.join(d, entry.name)
            if (entry.isDirectory()) await walk(full)
            else out[path.relative(dir, full)] = await fs.readFile(full, 'utf8')
        }
    }
    await walk(dir)
    return out
}

describe('validateAsset', () => {
    it('accepts an absolute from and a relative to, normalizing to', () => {
        expect(validateAsset({ from: '/abs/dir', to: '_img/' })).toEqual({
            from: '/abs/dir',
            to: '_img',
        })
        expect(validateAsset({ from: '/abs/f.png', to: 'a/./b/../f.png' })).toEqual({
            from: '/abs/f.png',
            to: 'a/f.png',
        })
        expect(validateAsset({ from: '/abs/dir', to: 'x\\y' })).toEqual({
            from: '/abs/dir',
            to: 'x/y',
        })
    })

    it('maps an empty or "." to to public/ itself', () => {
        expect(validateAsset({ from: '/abs/dir', to: '' }).to).toBe('')
        expect(validateAsset({ from: '/abs/dir', to: '.' }).to).toBe('')
    })

    it('rejects a missing or relative from', () => {
        expect(validateAsset({ to: '_img' })).toMatch(/missing "from"/)
        expect(validateAsset({ from: '', to: '_img' })).toMatch(/missing "from"/)
        expect(validateAsset({ from: 'rel/dir', to: '_img' })).toMatch(/absolute/)
    })

    it('rejects a missing, absolute or escaping to', () => {
        expect(validateAsset({ from: '/abs' })).toMatch(/missing "to"/)
        expect(validateAsset({ from: '/abs', to: '/_img' })).toMatch(/relative/)
        expect(validateAsset({ from: '/abs', to: 'C:\\x' })).toMatch(/relative/)
        expect(validateAsset({ from: '/abs', to: '..' })).toMatch(/escapes/)
        expect(validateAsset({ from: '/abs', to: '../x' })).toMatch(/escapes/)
        expect(validateAsset({ from: '/abs', to: 'a/../../x' })).toMatch(/escapes/)
    })

    it('rejects non-objects', () => {
        expect(validateAsset(null)).toMatch(/not an object/)
        expect(validateAsset('x')).toMatch(/not an object/)
    })
})

describe('getAssets hook', () => {
    let tmpRoot, prevCwd, warn

    const folders = () => ({
        config: path.join(tmpRoot, 'config'),
        pages: path.join(tmpRoot, 'pages'),
        views: path.join(tmpRoot, 'views'),
        assets: path.join(tmpRoot, 'assets'),
        dist: path.join(tmpRoot, 'public'),
        plugins: path.join(tmpRoot, 'plugins'),
    })

    const build = () => run({ folders: folders() })
    const read = (rel) => fs.readFile(path.join(tmpRoot, 'public', rel), 'utf8')
    const exists = (rel) => fssync.existsSync(path.join(tmpRoot, 'public', rel))

    const writePlugin = (name, code) =>
        write(path.join(tmpRoot, 'plugins', name, 'index.js'), code)

    // A plugin whose getAssets returns `entries` verbatim.
    const assetsPlugin = (name, entries) =>
        writePlugin(
            name,
            `export function getAssets() { return ${JSON.stringify(entries)} }`
        )

    const warnings = () => warn.mock.calls.map((c) => c.join(' ')).join('\n')

    beforeEach(async () => {
        prevCwd = process.cwd()
        tmpRoot = createTempPath()

        await write(
            path.join(tmpRoot, 'package.json'),
            JSON.stringify({ name: 'demo', private: true })
        )
        await write(path.join(tmpRoot, 'config', 'app.yaml'), 'name: Demo\nlang: en')
        await write(
            path.join(tmpRoot, 'pages', 'index.md'),
            '---\ntitle: Home\nlayout: layout.pug\n---\n# Hi\n'
        )
        await write(
            path.join(tmpRoot, 'views', 'layout.pug'),
            'doctype html\nhtml\n  head\n    link(rel="stylesheet" href="/css/site.css")\n  body\n    != content'
        )
        await write(path.join(tmpRoot, 'assets', 'css', 'site.css'), 'SITE css')

        // Plugin payload, outside public/ like a real cache folder.
        await write(path.join(tmpRoot, 'cache', 'files', 'a.txt'), 'PLUGIN a')
        await write(path.join(tmpRoot, 'cache', 'files', 'sub', 'b.txt'), 'PLUGIN b')
        await write(path.join(tmpRoot, 'cache', 'one.txt'), 'PLUGIN one')

        process.chdir(tmpRoot)
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(async () => {
        warn.mockRestore()
        process.chdir(prevCwd)
        await fs.rm(tmpRoot, { recursive: true, force: true })
    })

    it('is additive: a plugin without getAssets builds byte-identically', async () => {
        await build()
        const before = await snapshotTree(path.join(tmpRoot, 'public'))

        await writePlugin(
            'plain',
            'export function getMetaData({ pagesData }) { return pagesData }'
        )
        await build()
        const after = await snapshotTree(path.join(tmpRoot, 'public'))

        expect(after).toEqual(before)
    })

    it('returns assets: [] from getPluginsData when no plugin has the hook', async () => {
        const data = await getPluginsData(
            { app: {}, pagesData: [] },
            path.join(tmpRoot, 'plugins')
        )
        expect(data.assets).toEqual([])
    })

    it('passes the final app/pagesData and tags entries with the plugin name', async () => {
        await writePlugin(
            'producer',
            `export function getAppData({ app }) { return { ...app, produced: 'yes' } }
            export function getAssets({ app, pagesData }) {
                return [{ from: ${JSON.stringify(path.join(tmpRoot, 'cache', 'files'))}, to: app.produced + '/' + pagesData.length }]
            }`
        )
        // Runs after "producer" alphabetically; its getMetaData must already
        // be reflected in what producer's getAssets sees.
        await writePlugin(
            'zz-pages',
            'export function getMetaData({ pagesData }) { return [...pagesData, {}, {}] }'
        )

        const data = await getPluginsData(
            { app: {}, pagesData: [{}] },
            path.join(tmpRoot, 'plugins')
        )

        expect(data.assets).toEqual([
            { from: path.join(tmpRoot, 'cache', 'files'), to: 'yes/3', plugin: 'producer' },
        ])
    })

    it('copies a directory entry into public/<to>', async () => {
        await assetsPlugin('images', [
            { from: path.join(tmpRoot, 'cache', 'files'), to: '_img' },
        ])
        await build()

        expect(await read('_img/a.txt')).toBe('PLUGIN a')
        expect(await read('_img/sub/b.txt')).toBe('PLUGIN b')
        expect(await read('css/site.css')).toBe('SITE css')
    })

    it('copies a file entry to the file path <to>', async () => {
        await assetsPlugin('og', [
            { from: path.join(tmpRoot, 'cache', 'one.txt'), to: 'og/home.txt' },
        ])
        await build()

        expect(await read('og/home.txt')).toBe('PLUGIN one')
    })

    it('lets a site asset override a plugin asset', async () => {
        await write(path.join(tmpRoot, 'assets', '_img', 'a.txt'), 'SITE a')
        await assetsPlugin('images', [
            { from: path.join(tmpRoot, 'cache', 'files'), to: '_img' },
        ])
        await build()

        expect(await read('_img/a.txt')).toBe('SITE a')
        expect(await read('_img/sub/b.txt')).toBe('PLUGIN b')
    })

    it('lets a plugin asset override a theme asset', async () => {
        await write(path.join(tmpRoot, 'config', 'app.yaml'), 'name: Demo\nlang: en\ntheme: ./base')
        await fs.mkdir(path.join(tmpRoot, 'base', 'views'), { recursive: true })
        await write(path.join(tmpRoot, 'base', 'assets', '_img', 'a.txt'), 'THEME a')
        await write(path.join(tmpRoot, 'base', 'assets', '_img', 'c.txt'), 'THEME c')
        await assetsPlugin('images', [
            { from: path.join(tmpRoot, 'cache', 'files'), to: '_img' },
        ])
        await build()

        expect(await read('_img/a.txt')).toBe('PLUGIN a')
        expect(await read('_img/c.txt')).toBe('THEME c')
    })

    it('discards a non-array result with a warning and keeps building', async () => {
        await writePlugin('broken', 'export function getAssets() { return { nope: true } }')
        await build()

        expect(warnings()).toMatch(/"broken" getAssets returned invalid format/)
        expect(await read('css/site.css')).toBe('SITE css')
        expect(exists('index.html')).toBe(true)
    })

    it('skips an entry whose to escapes public/, keeping the valid ones', async () => {
        await assetsPlugin('images', [
            { from: path.join(tmpRoot, 'cache', 'one.txt'), to: '../escaped.txt' },
            { from: path.join(tmpRoot, 'cache', 'one.txt'), to: '/abs.txt' },
            { to: '_img' },
            { from: path.join(tmpRoot, 'cache', 'files'), to: '_img' },
        ])
        await build()

        expect(warnings()).toMatch(/"images" getAssets entry skipped: "to" escapes public\//)
        expect(warnings()).toMatch(/"to" must be relative to public\//)
        expect(warnings()).toMatch(/missing "from"/)
        expect(fssync.existsSync(path.join(tmpRoot, 'escaped.txt'))).toBe(false)
        expect(exists('abs.txt')).toBe(false)
        expect(await read('_img/a.txt')).toBe('PLUGIN a')
    })

    it('skips a from that does not exist with a warning', async () => {
        await assetsPlugin('images', [
            { from: path.join(tmpRoot, 'cache', 'missing'), to: '_img' },
        ])
        await build()

        expect(warnings()).toMatch(/"images" asset not found, skipped/)
        expect(exists('_img')).toBe(false)
        expect(exists('index.html')).toBe(true)
    })

    it('applies base_path and asset_hashing to plugin assets', async () => {
        await write(
            path.join(tmpRoot, 'config', 'app.yaml'),
            'name: Demo\nlang: en\nbase_path: /sub\nasset_hashing: true'
        )
        await write(
            path.join(tmpRoot, 'pages', 'index.md'),
            '---\ntitle: Home\nlayout: layout.pug\n---\n<img src="/_img/pic.png" srcset="/_img/pic.png 480w, /_img/pic-2x.png 960w" alt="x">\n'
        )
        await write(path.join(tmpRoot, 'cache', 'img', 'pic.png'), 'PNG1')
        await write(path.join(tmpRoot, 'cache', 'img', 'pic-2x.png'), 'PNG2')
        await assetsPlugin('images', [
            { from: path.join(tmpRoot, 'cache', 'img'), to: '_img' },
        ])
        await build()

        const html = await read('index.html')
        expect(html).toContain(`src="/sub/_img/pic.png?v=${hashOf('PNG1')}"`)
        expect(html).toContain(
            `srcset="/sub/_img/pic.png?v=${hashOf('PNG1')} 480w, /sub/_img/pic-2x.png?v=${hashOf('PNG2')} 960w"`
        )
    })
})
