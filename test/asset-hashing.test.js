import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tempDir, writeFiles } from '@nera-static/test-utils'
import { hashAssetUrls, hashHtmlUrls } from '../src/render.js'
import run from '../src/index.js'

const hashOf = (content) =>
    createHash('sha256').update(content).digest('hex').slice(0, 10)

describe('hashAssetUrls', () => {
    let pub

    const read = (rel) => fs.readFile(path.join(pub, rel), 'utf-8')

    beforeEach(() => {
        pub = writeFiles(tempDir('nera-hash-'), {
            'js/app.js': 'console.log(1)',
            'img/logo.png': 'PNG',
            'img/logo@2x.png': 'PNG2',
            'icons.svg': '<svg/>',
            'fonts/a.woff2': 'FONT',
            'css/main.css':
                '@font-face { src: url("../fonts/a.woff2") format("woff2"); }\n' +
                '.x { background: url(/img/logo.png); }\n' +
                '.y { background: url(data:image/png;base64,AAAA); }',
        })
    })

    it('is a no-op when disabled', async () => {
        const html = '<link rel="stylesheet" href="/css/main.css">'
        writeFiles(pub, { 'index.html': html })

        await hashAssetUrls(pub, '', false)

        expect(await read('index.html')).toBe(html)
        expect(await read('css/main.css')).toContain('url("../fonts/a.woff2")')
    })

    it('versions local asset URLs with a hash of their content', async () => {
        writeFiles(pub, {
            'index.html':
                '<script src="/js/app.js" defer></script>\n' +
                '<img src=\'img/logo.png\' srcset="/img/logo.png 1x, /img/logo@2x.png 2x">',
        })

        await hashAssetUrls(pub, '', true)

        const html = await read('index.html')
        expect(html).toContain(`src="/js/app.js?v=${hashOf('console.log(1)')}"`)
        expect(html).toContain(`src='img/logo.png?v=${hashOf('PNG')}'`)
        expect(html).toContain(
            `srcset="/img/logo.png?v=${hashOf('PNG')} 1x, /img/logo@2x.png?v=${hashOf('PNG2')} 2x"`,
        )
    })

    it('rewrites CSS url() refs and hashes the stylesheet after that', async () => {
        writeFiles(pub, { 'index.html': '<link rel="stylesheet" href="/css/main.css">' })

        await hashAssetUrls(pub, '', true)

        const css = await read('css/main.css')
        expect(css).toContain(`url("../fonts/a.woff2?v=${hashOf('FONT')}")`)
        expect(css).toContain(`url(/img/logo.png?v=${hashOf('PNG')})`)
        expect(css).toContain('url(data:image/png;base64,AAAA)')

        // The stylesheet's version is the hash of its final, rewritten content,
        // so a changed font busts the CSS too.
        expect(await read('index.html')).toContain(
            `href="/css/main.css?v=${hashOf(css)}"`,
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
        writeFiles(pub, {
            'about.html': 'about',
            'blog/index.html': 'blog',
            'index.html': html,
        })

        await hashAssetUrls(pub, '', true)

        expect(await read('index.html')).toBe(html)
    })

    it('keeps a fragment after the version query', async () => {
        writeFiles(pub, { 'index.html': '<use href="/icons.svg#star"></use>' })

        await hashAssetUrls(pub, '', true)

        expect(await read('index.html')).toContain(
            `href="/icons.svg?v=${hashOf('<svg/>')}#star"`,
        )
    })

    it('resolves base_path-prefixed URLs', async () => {
        writeFiles(pub, { 'index.html': '<script src="/repo/js/app.js"></script>' })

        await hashAssetUrls(pub, '/repo', true)

        expect(await read('index.html')).toContain(
            `src="/repo/js/app.js?v=${hashOf('console.log(1)')}"`,
        )
    })

    it('leaves the base path itself and the site root unversioned', async () => {
        writeFiles(pub, {
            'index.html': '<a href="/repo">home</a><a href="/">root</a><a href="/repo/">slash</a>',
        })

        await hashAssetUrls(pub, '/repo', true)

        expect(await read('index.html')).toBe(
            '<a href="/repo">home</a><a href="/">root</a><a href="/repo/">slash</a>',
        )
    })

    it('leaves URLs with a scheme alone, also when a same-named file exists', async () => {
        writeFiles(pub, {
            'data/x.js': 'x',
            'index.html': '<script src="data:x.js"></script><a href="tel:123">t</a>',
        })

        await hashAssetUrls(pub, '', true)

        expect(await read('index.html')).toBe(
            '<script src="data:x.js"></script><a href="tel:123">t</a>',
        )
    })

    it('versions a file in a public/ child folder whose name starts with ".."', async () => {
        // Written by hand: test-utils 1.0.1's writeFiles takes a first segment
        // starting with ".." for an escape and refuses it.
        await fs.mkdir(path.join(pub, '..cache'))
        await fs.writeFile(path.join(pub, '..cache', 'a.js'), 'A')
        writeFiles(pub, { 'index.html': '<script src="/..cache/a.js"></script>' })

        await hashAssetUrls(pub, '', true)

        expect(await read('index.html')).toContain(
            `src="/..cache/a.js?v=${hashOf('A')}"`,
        )
    })

    it('versions the search index referenced by data-search-index', async () => {
        writeFiles(pub, {
            'search-index.json': '[]',
            'search/index.html': '<input data-search-index="/search-index.json">',
        })

        await hashAssetUrls(pub, '', true)

        expect(await read('search/index.html')).toContain(
            `data-search-index="/search-index.json?v=${hashOf('[]')}"`,
        )
    })
})

describe('hashHtmlUrls (start tags only)', () => {
    // A stub hasher: versions every non-empty URL, so a test sees exactly
    // which values the pass reached.
    const hashUrl = (url) => (url ? `${url}?v=h` : url)
    const hash = (html) => hashHtmlUrls(html, '/pub/index.html', hashUrl)

    it('leaves quoted attributes in inline code text untouched', () => {
        const html =
            '<p>Use <code>script(src="/js/search.js")</code> and ' +
            '<code>link(href=\'/css/main.css\')</code>.</p>'
        expect(hash(html)).toBe(html)
    })

    it('leaves <pre> text untouched but hashes elements inside it', () => {
        const html =
            '<pre><code class="hljs">img(src="/a.png" srcset="/a.png 1x")\n' +
            '<span class="x">a(href="/b.html")</span>' +
            '<a href="/c.html">c</a></code></pre>'
        expect(hash(html)).toBe(
            '<pre><code class="hljs">img(src="/a.png" srcset="/a.png 1x")\n' +
                '<span class="x">a(href="/b.html")</span>' +
                '<a href="/c.html?v=h">c</a></code></pre>',
        )
    })

    it('hashes every attribute of a tag with ">" in another value', () => {
        const html =
            '<a title="a > b" href="/a.html">a</a>' +
            '<img alt=\'x > y\' src="/i.png" srcset="/i.png 1x, /j.png 2x">'
        expect(hash(html)).toBe(
            '<a title="a > b" href="/a.html?v=h">a</a>' +
                '<img alt=\'x > y\' src="/i.png?v=h" ' +
                'srcset="/i.png?v=h 1x, /j.png?v=h 2x">',
        )
    })

    it('keeps text with a bare "<", comments and the doctype intact', () => {
        const html =
            '<!doctype html><!-- keep --><p>a < b, src="/x.js"</p>' +
            '<script src="/app.js"></script>'
        expect(hash(html)).toBe(
            '<!doctype html><!-- keep --><p>a < b, src="/x.js"</p>' +
                '<script src="/app.js?v=h"></script>',
        )
    })

    it('stays linear on many stray, never-closed "<a x" in text', () => {
        const html = '<a x'.repeat(50000)
        const start = performance.now()
        expect(hash(html)).toBe(html)
        // The scan that let `<` into a tag took ~20 s here; linear is ms.
        expect(performance.now() - start).toBeLessThan(1000)
    })

    it('leaves text after a stray "<a x" alone, hashes the next tag', () => {
        expect(hash('<p>if a <a x(href="/z")</p><link href="/m.css">')).toBe(
            '<p>if a <a x(href="/z")</p><link href="/m.css?v=h">',
        )
    })

    it('hashes a tag whose quoted value holds a "<"', () => {
        expect(hash('<a title="a < b" href="/a.html">a</a>')).toBe(
            '<a title="a < b" href="/a.html?v=h">a</a>',
        )
    })
})

describe('run() with asset_hashing', () => {
    let TMP_DIR, settings

    const build = async (appYaml) => {
        writeFiles(TMP_DIR, { 'config/app.yaml': appYaml })
        await run(settings)
        return fs.readFile(path.join(TMP_DIR, 'public/index.html'), 'utf-8')
    }

    beforeEach(() => {
        TMP_DIR = tempDir('nera-hash-run-')
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
        writeFiles(TMP_DIR, {
            'pages/index.md': '---\ntitle: Site\nlayout: layout.pug\n---\n\n# Hello\n',
            'views/layout.pug':
                'doctype html\nhtml\n  head\n    link(rel="stylesheet", href="/css/main.css")\n  body !{content}\n',
            'assets/css/main.css': 'body{}',
        })
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
            'name: Site\nlang: en\nbase_path: /repo\nasset_hashing: true',
        )
        expect(html).toContain(
            `href="/repo/css/main.css?v=${hashOf('body{}')}"`,
        )
    })

    describe('with a quoted attribute in page text', () => {
        const codeText = 'script(src="/css/main.css")'

        beforeEach(() => {
            writeFiles(TMP_DIR, {
                'views/layout.pug':
                    'doctype html\nhtml\n  head\n    link(rel="stylesheet", href="/css/main.css")\n' +
                    `  body\n    p\n      code ${codeText}\n`,
            })
        })

        it('versions the link but leaves the text', async () => {
            const html = await build(
                'name: Site\nlang: en\nasset_hashing: true',
            )
            expect(html).toContain(
                `href="/css/main.css?v=${hashOf('body{}')}"`,
            )
            expect(html).toContain(`<code>${codeText}</code>`)
        })

        it('prefixes the link with base_path but leaves the text', async () => {
            const html = await build('name: Site\nlang: en\nbase_path: /repo')
            expect(html).toContain('href="/repo/css/main.css"')
            expect(html).toContain(`<code>${codeText}</code>`)
        })
    })
})
