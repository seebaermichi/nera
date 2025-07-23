import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import YAML from 'yaml'

/**
 * Normalize an npm-scoped plugin name to its short name.
 * @example "@nera-static/plugin-search" -> "plugin-search"
 */
function shortPluginName(fullName) {
    return fullName.startsWith('@nera-static/')
        ? fullName.replace('@nera-static/', '')
        : fullName
}

/**
 * Try to load plugin-order config.
 *
 * Expected YAML shape:
 *
 * plugin-order:
 *   - start:
 *       - plugin-one
 *       - plugin-two
 *   - end:
 *       - plugin-before-last
 *       - plugin-last
 *
 * All keys optional. Unknown plugin names are ignored.
 */
async function loadPluginOrderConfig() {
    const orderPath = path.resolve(process.cwd(), 'config/plugin-order.yaml')
    try {
        const raw = await fs.readFile(orderPath, 'utf-8')
        const parsed = YAML.parse(raw)
        const order = parsed?.['plugin-order'] || []

        let start = []
        let end = []

        for (const entry of order) {
            if (entry.start) start = entry.start.slice()
            if (entry.end) end = entry.end.slice()
        }

        return { start, end, hasConfig: true }
    } catch {
        return { start: [], end: [], hasConfig: false }
    }
}

/**
 * Sort loaded plugins based on plugin-order config.
 * Unlisted plugins go in the middle, sorted alphabetically by short name.
 */
function orderPlugins(loadedPlugins, startOrder, endOrder) {
    const pluginMap = new Map(loadedPlugins.map((p) => [p.name, p]))

    const middle = loadedPlugins
        .filter(
            (p) => !startOrder.includes(p.name) && !endOrder.includes(p.name)
        )
        .sort((a, b) => a.name.localeCompare(b.name))

    return [
        ...startOrder.map((name) => pluginMap.get(name)).filter(Boolean),
        ...middle,
        ...endOrder.map((name) => pluginMap.get(name)).filter(Boolean),
    ]
}

/**
 * Loads and applies local and installed plugins that can modify app and page data.
 *
 * @param {object} initialData - Contains `app` and `pagesData` keys.
 * @param {string} localPluginsDir - Path to local plugin directory.
 * @returns {Promise<{app: object, pagesData: object[], plugins: object[]}>}
 */
export async function getPluginsData(
    initialData,
    localPluginsDir = 'src/plugins'
) {
    const startTime = performance.now()
    const loadingPromises = []

    //
    // 1. Load local plugins in parallel
    //
    console.log('🔌 Loading local plugins...')
    try {
        const localPluginDirs = await fs.readdir(localPluginsDir).catch(() => [])

        for (const dir of localPluginDirs) {
            const pluginPath = path.join(localPluginsDir, dir, 'index.js')

            const loadPromise = fs
                .access(pluginPath)
                .then(() => import(pathToFileURL(pluginPath)))
                .then((mod) => {
                    console.log(`  ✅ Loaded local plugin: ${dir}`)
                    return { type: 'local', name: dir, module: mod }
                })
                .catch((err) => {
                    console.warn(
                        `  ⚠️ Failed to load local plugin ${dir}:`,
                        err.message
                    )
                    return null
                })

            loadingPromises.push(loadPromise)
        }
    } catch (err) {
        console.warn('⚠️ Could not read local plugins directory:', err.message)
    }

    //
    // 2. Load installed @nera-static/* plugins in parallel
    //
    console.log('📦 Loading npm plugins...')
    try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const pkgJsonPath = path.resolve(__dirname, '../package.json')
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'))
        const deps = Object.keys(pkgJson.dependencies || {}).filter((name) =>
            name.startsWith('@nera-static/')
        )

        for (const fullName of deps) {
            const shortName = shortPluginName(fullName)

            const loadPromise = import(fullName)
                .then((mod) => {
                    console.log(`  ✅ Loaded npm plugin: ${shortName}`)
                    return { type: 'npm', name: shortName, module: mod }
                })
                .catch((err) => {
                    console.warn(
                        `  ❌ Failed to load npm plugin ${shortName}:`,
                        err.message
                    )
                    return null
                })

            loadingPromises.push(loadPromise)
        }
    } catch (err) {
        console.warn(
            '⚠️ Could not load package.json for npm plugins:',
            err.message
        )
    }

    //
    // 3. Wait for all plugins to load
    //
    const results = await Promise.allSettled(loadingPromises)
    const loadedPlugins = []
    let successCount = 0
    let errorCount = 0

    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            loadedPlugins.push(result.value)
            successCount++
        } else {
            errorCount++
        }
    }

    const loadTime = Math.round(performance.now() - startTime)
    console.log(
        `🎯 Plugin loading complete: ${successCount} loaded, ${errorCount} failed (${loadTime}ms)`
    )

    //
    // 4. Determine order (start / middle / end)
    //
    const { start: startOrder, end: endOrder } = await loadPluginOrderConfig()
    const ordered = orderPlugins(loadedPlugins, startOrder, endOrder)

    //
    // 5. Apply plugin methods
    //
    let appData = { ...initialData.app }
    let pagesData = [...initialData.pagesData]

    for (const plugin of ordered) {
        const mod = plugin.module

        if (typeof mod.getAppData === 'function') {
            const result = mod.getAppData({ app: appData, pagesData })
            if (result && typeof result === 'object' && !Array.isArray(result)) {
                appData = result
            } else {
                console.warn(
                    `⚠️ Plugin "${plugin.name}" getAppData returned invalid format, skipping replace.`
                )
            }
        }

        if (typeof mod.getMetaData === 'function') {
            const result = mod.getMetaData({ app: appData, pagesData })
            if (Array.isArray(result)) {
                pagesData = result
            } else {
                console.warn(
                    `⚠️ Plugin "${plugin.name}" getMetaData returned invalid format, skipping append.`
                )
            }
        }
    }

    //
    // 6. Return final
    //
    return {
        app: appData,
        pagesData,
        plugins: ordered.map((p) => p.module),
    }
}
