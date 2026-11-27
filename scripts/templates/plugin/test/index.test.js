import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildSite, captureConsole, makeSite, readPublic, useSiteCwd } from '@nera-static/test-utils'
import { getAppData, getMetaData } from '../index.js'

const entry = fileURLToPath(new URL('../index.js', import.meta.url))

const pagesData = [
    { content: '', meta: { layout: 'layout.pug', href: '/index.html' } },
    { content: '', meta: { layout: 'layout.pug', href: '/de/index.html', lang: 'de' } },
    { content: '', meta: { href: '/draft.html' } },
]

describe('getAppData', () => {
    it('adds the number of rendered pages under the default property', () => {
        useSiteCwd()
        const app = getAppData({ app: { name: 'Demo' }, pagesData })
        expect(app).toEqual({ name: 'Demo', '{{short}}': { pages: 2 } })
    })

    it('writes under the configured property', () => {
        useSiteCwd({ 'config/{{short}}.yaml': 'property: stats\n' })
        expect(getAppData({ pagesData }).stats).toEqual({ pages: 2 })
    })

    it('warns with the plugin prefix about a bad config value', () => {
        useSiteCwd({ 'config/{{short}}.yaml': 'property: 42\n' })
        const warnings = captureConsole('warn')
        getAppData({ pagesData })
        expect(warnings()).toEqual([
            '⚠️ plugin-{{short}}: config/{{short}}.yaml: invalid property 42, using "{{short}}"',
        ])
    })
})

describe('getMetaData', () => {
    it('adds the page language to every page without changing the input', () => {
        useSiteCwd()
        const pages = getMetaData({ app: { lang: 'en' }, pagesData })
        expect(pages.map((page) => page.meta['{{short}}'])).toEqual([{ lang: 'en' }, { lang: 'de' }, { lang: 'en' }])
        expect(pagesData[0].meta).not.toHaveProperty('{{short}}')
    })
})

describe('a site build', () => {
    it('renders what the hooks add', async () => {
        const site = makeSite({
            plugins: { '{{short}}': entry },
            files: {
                'pages/index.md': '---\nlayout: layout.pug\n---\n',
                'views/layout.pug': 'p #{app["{{short}}"].pages} #{meta["{{short}}"].lang}\n',
            },
        })
        const { warnings } = await buildSite(site)
        expect(warnings).toEqual([])
        expect(readPublic(site, 'index.html')).toContain('<p>1 en</p>')
    })
})
