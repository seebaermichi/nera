import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { createHash } from 'crypto'
import { hashAssetUrls } from '../render.js'
import run from '../index.js'

const createTempPath = () =>
    path.join(
        os.tmpdir(),
        `.nera-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )

const hashOf = (content) =>
    createHash('sha256').update(content).digest('hex').slice(0, 10)

const write = async (file, content) => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, content)
}

describe('hashAssetUrls', () => {
    let pub

    const read = (rel) => fs.readFile(path.join(pub, rel), 'utf-8')

    beforeEach(async () => {
        pub = createTempPath()
        await write(path.join(pub, 'js/app.js'), 'console.log(1)')
        await write(path.join(pub, 'img/logo.png'), 'PNG')
        await write(path.join(pub, 'img/logo@2x.png'), 'PNG2')
        await write(path.join(pub, 'icons.svg'), '<svg/>')
        await write(path.join(pub, 'fonts/a.woff2'), 'FONT')
        await write(
            path.join(pub, 'css/main.css'),
            '@font-face { src: url("../fonts/a.woff2") format("woff2"); }\n' +
                '.x { background: url(/img/logo.png); }\n' +
                '.y { background: url(data:image/png;base64,AAAA); }'
        )
    })

    afterEach(async () => {
        await fs.rm(pub, { recursive: true, force: true })
    })

    it('is a no-op when disabled', async () => {
        const html = '<link rel="stylesheet" href="/css/main.css">'
        await write(path.join(pub, 'index.html'), html)

        await hashAssetUrls(pub, '', false)

        expect(await read('index.html')).toBe(html)
        expect(await read('css/main.css')).toContain('url("../fonts/a.woff2")')
    })

    it('versions local asset URLs with a hash of their content', async () => {
        await write(
            path.join(pub, 'index.html'),
            '<script src="/js/app.js" defer></script>\n' +
                '<img src=\'img/logo.png\' srcset="/img/logo.png 1x, /img/logo@2x.png 2x">'
        )

        await hashAssetUrls(pub, '', true)

        const html = await read('index.html')
        expect(html).toContain(`src="/js/app.js?v=${hashOf('console.log(1)')}"`)
        expect(html).toContain(`src='img/logo.png?v=${hashOf('PNG')}'`)
        expect(html).toContain(
            `srcset="/img/logo.png?v=${hashOf('PNG')} 1x, /img/logo@2x.png?v=${hashOf('PNG2')} 2x"`
        )
    })

    it('rewrites CSS url() refs and hashes the stylesheet after that', async () => {
        await write(
            path.join(pub, 'index.html'),
            '<link rel="stylesheet" href="/css/main.css">'
        )

        await hashAssetUrls(pub, '', true)

        const css = await read('css/main.css')
        expect(css).toContain(`url("../fonts/a.woff2?v=${hashOf('FONT')}")`)
        expect(css).toContain(`url(/img/logo.png?v=${hashOf('PNG')})`)
        expect(css).toContain('url(data:image/png;base64,AAAA)')

        // The stylesheet's version is the hash of its final, rewritten content,
        // so a changed font busts the CSS too.
        expect(await read('index.html')).toContain(
            `href="/css/main.css?v=${hashOf(css)}"`
        )
    })

    it('leaves pages, external, query, fragment-only and missing refs alone', async () => {
        const html = [
            '<a href="/about.html">About</a>',
            '<a href="/blog/">Blog</a>',
            '<a href="#top">Top</a>',
            '<a href="mailto:a@b.c">Mail</a>',
            '<script src="https://cdn.example.com/x.js"></script>',
            '<script src="//cdn.example.com/y.js"></script>',
            '<script src="/js/app.js?v=manual"></script>',
            '<img src="/img/missing.png">',
            '<img src="/../outside.png">',
        ].join('\n')
        await write(path.join(pub, 'about.html'), 'about')
        await write(path.join(pub, 'blog/index.html'), 'blog')
        await write(path.join(pub, 'index.html'), html)

        await hashAssetUrls(pub, '', true)

        expect(await read('index.html')).toBe(html)
    })

    it('keeps a fragment after the version query', async () => {
        await write(
            path.join(pub, 'index.html'),
            '<use href="/icons.svg#star"></use>'
        )

        await hashAssetUrls(pub, '', true)

        expect(await read('index.html')).toContain(
            `href="/icons.svg?v=${hashOf('<svg/>')}#star"`
        )
    })

    it('resolves base_path-prefixed URLs', async () => {
        await write(
            path.join(pub, 'index.html'),
            '<script src="/repo/js/app.js"></script>'
        )

        await hashAssetUrls(pub, '/repo', true)

        expect(await read('index.html')).toContain(
            `src="/repo/js/app.js?v=${hashOf('console.log(1)')}"`
        )
    })

    it('versions the search index referenced by data-search-index', async () => {
        await write(path.join(pub, 'search-index.json'), '[]')
        await write(
            path.join(pub, 'search/index.html'),
            '<input data-search-index="/search-index.json">'
        )

        await hashAssetUrls(pub, '', true)

        expect(await read('search/index.html')).toContain(
            `data-search-index="/search-index.json?v=${hashOf('[]')}"`
        )
    })
})

describe('run() with asset_hashing', () => {
    let TMP_DIR, settings

    const build = async (appYaml) => {
        await write(path.join(TMP_DIR, 'config/app.yaml'), appYaml)
        await run(settings)
        return fs.readFile(path.join(TMP_DIR, 'public/index.html'), 'utf-8')
    }

    beforeEach(async () => {
        TMP_DIR = createTempPath()
        settings = {
            folders: {
                config: path.join(TMP_DIR, 'config'),
                pages: path.join(TMP_DIR, 'pages'),
                views: path.join(TMP_DIR, 'views'),
                assets: path.join(TMP_DIR, 'assets'),
                dist: path.join(TMP_DIR, 'public'),
                plugins: path.join(TMP_DIR, 'src/plugins'),
            },
        }
        await write(
            path.join(TMP_DIR, 'pages/index.md'),
            '---\ntitle: Site\nlayout: layout.pug\n---\n\n# Hello\n'
        )
        await write(
            path.join(TMP_DIR, 'views/layout.pug'),
            'doctype html\nhtml\n  head\n    link(rel="stylesheet", href="/css/main.css")\n  body !{content}\n'
        )
        await write(path.join(TMP_DIR, 'assets/css/main.css'), 'body{}')
    })

    afterEach(async () => {
        await fs.rm(TMP_DIR, { recursive: true, force: true })
    })

    it('leaves the output untouched without the config key', async () => {
        const html = await build('name: Site\nlang: en')
        expect(html).toContain('href="/css/main.css"')
    })

    it('versions asset URLs when enabled', async () => {
        const html = await build('name: Site\nlang: en\nasset_hashing: true')
        expect(html).toContain(`href="/css/main.css?v=${hashOf('body{}')}"`)
    })

    it('composes with base_path', async () => {
        const html = await build(
            'name: Site\nlang: en\nbase_path: /repo\nasset_hashing: true'
        )
        expect(html).toContain(
            `href="/repo/css/main.css?v=${hashOf('body{}')}"`
        )
    })
})
