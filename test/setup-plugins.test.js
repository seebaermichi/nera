import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import fssync from 'fs'
import { getPluginsData } from '../src/setup-plugins.js'
import dotenv from 'dotenv'

dotenv.config()

const TMP_DIR = path.resolve(process.env.TEST_TEMP_DIR || '.test-temp')
const PLUGINS_DIR = path.join(TMP_DIR, 'src/plugins')

beforeAll(async () => {
    if (fssync.existsSync(TMP_DIR)) {
        await fs.rm(TMP_DIR, { recursive: true, force: true })
    }

    await fs.mkdir(path.join(PLUGINS_DIR, 'plugin-a'), { recursive: true })
    await fs.mkdir(path.join(PLUGINS_DIR, 'plugin-b'), { recursive: true })
    await fs.mkdir(path.join(PLUGINS_DIR, 'plugin-empty'), { recursive: true })

    await fs.writeFile(
        path.join(PLUGINS_DIR, 'plugin-a/index.js'),
        `export function getAppData(data) {
      return { ...data.app, pluginA: true };
    }`
    )

    await fs.writeFile(
        path.join(PLUGINS_DIR, 'plugin-b/index.js'),
        `export function getMetaData(data) {
      return [...data.pagesData, { title: 'from plugin B' }];
    }`
    )

    await fs.writeFile(
        path.join(PLUGINS_DIR, 'plugin-empty/index.js'),
        '// intentionally left empty'
    )
})

afterAll(async () => {
    await fs.rm(TMP_DIR, { recursive: true, force: true })
})

describe('getPluginsData', () => {
    it('loads plugins and updates data correctly', async () => {
        const data = {
            app: { siteName: 'Original' },
            pagesData: [],
        }

        const result = await getPluginsData(data, PLUGINS_DIR)

        expect(result.app.pluginA).toBe(true)
        expect(result.app.siteName).toBe('Original')
        expect(result.pagesData).toEqual([{ title: 'from plugin B' }])
    })

    it('handles empty plugins gracefully', async () => {
        const data = { app: {}, pagesData: [] }
        const result = await getPluginsData(data, PLUGINS_DIR)

        expect(result.app).toBeTypeOf('object')
        expect(result.pagesData).toBeTypeOf('object')
    })

    it('handles non-existing plugin directory gracefully', async () => {
        const data = { app: { test: true }, pagesData: [] }
        const result = await getPluginsData(data, '/non/existing/path')

        expect(result.app.test).toBe(true) // Original data should be preserved
        expect(result.pagesData).toEqual([])
        expect(result.plugins).toHaveLength(0) // No plugins loaded
    })
})
