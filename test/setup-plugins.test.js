import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import { fileURLToPath } from 'url'
import { getPluginsData } from '../src/setup-plugins.js'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TMP_DIR = path.resolve(
    process.env.TEST_TEMP_DIR || path.join(__dirname, '.test-temp')
)
const PLUGINS_DIR = path.join(TMP_DIR, 'src/plugins')
const CONFIG_DIR = path.join(TMP_DIR, 'config')

let originalCwd

async function writePlugin(dir, code) {
    const pluginDir = path.join(PLUGINS_DIR, dir)
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(path.join(pluginDir, 'index.js'), code, 'utf-8')
}

beforeAll(async () => {
    originalCwd = process.cwd()

    // clean tmp
    if (fssync.existsSync(TMP_DIR)) {
        await fs.rm(TMP_DIR, { recursive: true, force: true })
    }

    // re-create dirs
    await fs.mkdir(PLUGINS_DIR, { recursive: true })
    await fs.mkdir(CONFIG_DIR, { recursive: true })

    // plugin-a: adds to app, logs order
    await writePlugin(
        'plugin-a',
        `export function getAppData(data) {
            const order = Array.isArray(data.app.__order) ? data.app.__order : []
            order.push('a-app')
            return { ...data.app, pluginA: true, __order: order }
        }`
    )

    // plugin-b: adds page, logs order via getMetaData
    await writePlugin(
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
    await writePlugin('plugin-empty', '// intentionally empty')

    // plugin-order-mark: both hooks to see relative ordering
    await writePlugin(
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

    // No plugin-order.yaml by default; individual tests will create one if needed
})

afterAll(async () => {
    process.chdir(originalCwd)
    await fs.rm(TMP_DIR, { recursive: true, force: true })
})

beforeEach(async () => {
    // ensure we are in tmp project root so setup-plugins reads config/plugin-order.yaml
    process.chdir(TMP_DIR)
    // remove any existing plugin-order.yaml between tests
    await fs
        .rm(path.join(CONFIG_DIR, 'plugin-order.yaml'), { force: true })
        .catch(() => {})
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

    it('respects plugin-order start and end', async () => {
        // Write plugin-order.yaml such that plugin-a runs first, plugin-b last
        const yaml = `plugin-order:
  - start:
      - plugin-a
  - end:
      - plugin-b
`
        await fs.writeFile(path.join(CONFIG_DIR, 'plugin-order.yaml'), yaml)

        const data = { app: { __order: [] }, pagesData: [] }
        const result = await getPluginsData(data, PLUGINS_DIR)

        // order array mutated by plugins
        expect(result.app.__order).toEqual(['a-app', 'order-app', 'order-meta', 'b-meta'])

        // plugin-b adds page (still last)
        expect(result.pagesData).toEqual([{ title: 'from plugin B' }])
    })
})
