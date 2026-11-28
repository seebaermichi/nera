import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import path from 'path'
import { tempDir, useSiteCwd, writeFiles } from '@nera-static/test-utils'
import { getPluginsData } from '../src/setup-plugins.js'

// The plugin folders, written once for the whole file (an import() is cached
// per file URL anyway). Each test gets its own site as `process.cwd()`, where
// setup-plugins reads config/plugin-order.yaml and package.json.
const TMP_DIR = tempDir('nera-setup-plugins-')
const PLUGINS_DIR = path.join(TMP_DIR, 'src/plugins')
const ASYNC_PLUGINS_DIR = path.join(TMP_DIR, 'src/async-plugins')
const CLASS_PLUGINS_DIR = path.join(TMP_DIR, 'src/class-plugins')
const SORT_PLUGINS_DIR = path.join(TMP_DIR, 'src/sort-plugins')

let site

const writePlugin = (dir, code, base = PLUGINS_DIR) =>
    writeFiles(base, { [`${dir}/index.js`]: code })

beforeAll(() => {
    // plugin-a: adds to app, logs order
    writePlugin(
        'plugin-a',
        `export function getAppData(data) {
            const order = Array.isArray(data.app.__order) ? data.app.__order : []
            order.push('a-app')
            return { ...data.app, pluginA: true, __order: order }
        }`
    )

    // plugin-b: adds page, logs order via getMetaData
    writePlugin(
        'plugin-b',
        `export function getMetaData(data) {
            const app = data.app
            if (Array.isArray(app.__order)) {
                app.__order.push('b-meta')
            }
            return [...data.pagesData, { title: 'from plugin B' }]
        }`
    )

    // plugin-empty: no exports
    writePlugin('plugin-empty', '// intentionally empty')

    // plugin-order-mark: both hooks to see relative ordering
    writePlugin(
        'plugin-order-mark',
        `export function getAppData(data) {
            const order = Array.isArray(data.app.__order) ? data.app.__order : []
            order.push('order-app')
            return { ...data.app, orderMarker: true, __order: order }
        }
        export function getMetaData(data) {
            const app = data.app
            if (Array.isArray(app.__order)) {
                app.__order.push('order-meta')
            }
            return data.pagesData
        }`
    )

    // plugin-async: both hooks are async, as a real-world plugin may write them
    writePlugin(
        'plugin-async',
        `export async function getAppData(data) {
            return { ...data.app, asyncApp: true }
        }
        export async function getMetaData(data) {
            return [...data.pagesData, { title: 'from async plugin' }]
        }`,
        ASYNC_PLUGINS_DIR
    )

    // plugin-class-app: getAppData returns a class instance, which is no `app`
    writePlugin(
        'plugin-class-app',
        `class App { constructor(app) { Object.assign(this, app) } }
        export function getAppData(data) {
            return new App({ ...data.app, fromClass: true })
        }`,
        CLASS_PLUGINS_DIR
    )

    // Unlisted plugins run in code-unit order: Zeta before alpha before beta
    for (const name of ['beta', 'Zeta', 'alpha']) {
        writePlugin(
            name,
            `export function getAppData(data) {
                return { ...data.app, ran: [...(data.app.ran || []), '${name}'] }
            }`,
            SORT_PLUGINS_DIR
        )
    }
})

beforeEach(() => {
    // No plugin-order.yaml or package.json by default; a test writes one if it needs it.
    site = useSiteCwd()
})

describe('getPluginsData', () => {
    it('loads plugins and updates data correctly (baseline, no ordering)', async () => {
        const data = {
            app: { siteName: 'Original' },
            pagesData: [],
        }

        const result = await getPluginsData(data, PLUGINS_DIR)

        // plugin-a modifies app
        expect(result.app.pluginA).toBe(true)
        expect(result.app.siteName).toBe('Original')

        // plugin-b adds page
        expect(result.pagesData).toEqual([{ title: 'from plugin B' }])
    })

    it('handles empty plugins gracefully', async () => {
        const data = { app: {}, pagesData: [] }
        const result = await getPluginsData(data, PLUGINS_DIR)

        expect(result.app).toBeTypeOf('object')
        expect(Array.isArray(result.pagesData)).toBe(true)
    })

    it('handles non-existing plugin directory gracefully', async () => {
        const data = { app: { test: true }, pagesData: [] }
        const result = await getPluginsData(data, '/non/existing/path')

        expect(result.app.test).toBe(true) // preserves original
        expect(result.pagesData).toEqual([])
        expect(result.plugins).toHaveLength(0)
    })

    it('awaits async hooks instead of storing their Promise', async () => {
        const data = {
            app: { siteName: 'Original', lang: 'en' },
            pagesData: [],
        }

        const result = await getPluginsData(data, ASYNC_PLUGINS_DIR)

        // A Promise passes the `typeof === 'object' && !Array.isArray` check,
        // so without `await` the whole app config is silently replaced by one.
        expect(result.app).not.toBeInstanceOf(Promise)
        expect(result.app.siteName).toBe('Original')
        expect(result.app.lang).toBe('en')
        expect(result.app.asyncApp).toBe(true)

        expect(result.pagesData).toEqual([{ title: 'from async plugin' }])
    })

    it('drops a class instance returned from getAppData with the warning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        try {
            const data = { app: { siteName: 'Original' }, pagesData: [] }
            const result = await getPluginsData(data, CLASS_PLUGINS_DIR)

            expect(result.app).toEqual({ siteName: 'Original' })
            expect(warn).toHaveBeenCalledWith(
                '⚠️ Plugin "plugin-class-app" getAppData returned invalid format, skipping replace.'
            )
        } finally {
            warn.mockRestore()
        }
    })

    it('runs unlisted plugins in code-unit order of their names', async () => {
        const result = await getPluginsData({ app: {}, pagesData: [] }, SORT_PLUGINS_DIR)

        expect(result.app.ran).toEqual(['Zeta', 'alpha', 'beta'])
    })

    it('respects plugin-order start and end', async () => {
        // Write plugin-order.yaml such that plugin-a runs first, plugin-b last
        const yaml = `plugin-order:
  - start:
      - plugin-a
  - end:
      - plugin-b
`
        writeFiles(site, { 'config/plugin-order.yaml': yaml })

        const data = { app: { __order: [] }, pagesData: [] }
        const result = await getPluginsData(data, PLUGINS_DIR)

        // order array mutated by plugins
        expect(result.app.__order).toEqual(['a-app', 'order-app', 'order-meta', 'b-meta'])

        // plugin-b adds page (still last)
        expect(result.pagesData).toEqual([{ title: 'from plugin B' }])
    })

    it('reads the npm plugin list from the project being built, not from the generator', async () => {
        // This repo declares no @nera-static dependencies of its own, so a
        // discovery bug here is invisible unless the fixture project declares
        // one. Naming a package that cannot resolve is enough: the loader has
        // to have read *this* package.json to attempt it at all.
        writeFiles(site, {
            'package.json': JSON.stringify({
                name: 'fixture-project',
                dependencies: { '@nera-static/plugin-not-installed': '^1.0.0' },
            }),
        })

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        try {
            const data = { app: {}, pagesData: [] }
            const result = await getPluginsData(data, PLUGINS_DIR)

            const attempted = warn.mock.calls.some((args) =>
                args.some(
                    (a) =>
                        typeof a === 'string' &&
                        a.includes('plugin-not-installed')
                )
            )
            expect(attempted).toBe(true)

            // The unresolvable plugin is skipped rather than aborting the run.
            expect(Array.isArray(result.pagesData)).toBe(true)
        } finally {
            warn.mockRestore()
        }
    })

    it('treats only @nera-static/plugin-* as plugins, not core/nera/theme/plugin-utils', async () => {
        // A thin site depends on @nera-static/nera (and, transitively, core);
        // neither, nor a theme, nor the plugin-utils library, must be import()ed
        // as a plugin — only real @nera-static/plugin-* packages are.
        writeFiles(site, {
            'package.json': JSON.stringify({
                name: 'fixture-project',
                dependencies: {
                    '@nera-static/nera': '^1.0.0',
                    '@nera-static/core': '^4.9.0',
                    '@nera-static/theme-foo': '^1.0.0',
                    '@nera-static/plugin-utils': '^1.0.0',
                    '@nera-static/plugin-not-installed': '^1.0.0',
                },
            }),
        })

        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const log = vi.spyOn(console, 'log').mockImplementation(() => {})

        try {
            await getPluginsData({ app: {}, pagesData: [] }, PLUGINS_DIR)

            const mentions = (needle) =>
                [...warn.mock.calls, ...log.mock.calls].some((args) =>
                    args.some(
                        (a) =>
                            typeof a === 'string' &&
                            a.includes('npm plugin') &&
                            a.includes(needle)
                    )
                )

            // The real plugin is attempted (it just can't resolve).
            expect(mentions('plugin-not-installed')).toBe(true)
            // The non-plugins are never even attempted.
            for (const nonPlugin of ['nera', 'core', 'theme-foo', 'plugin-utils']) {
                expect(mentions(nonPlugin)).toBe(false)
            }
        } finally {
            warn.mockRestore()
            log.mockRestore()
        }
    })
})
