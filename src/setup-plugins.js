import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

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
    const plugins = []
    const loadingPromises = []

    // 1. Load local plugins in parallel
    console.log('🔌 Loading local plugins...')
    try {
        const localPluginDirs = await fs
            .readdir(localPluginsDir)
            .catch(() => [])

        for (const dir of localPluginDirs) {
            const pluginPath = path.join(localPluginsDir, dir, 'index.js')

            // Check if plugin file exists before trying to import
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

    // 2. Load installed plugins from node_modules in parallel
    console.log('📦 Loading npm plugins...')
    try {
        const __dirname = path.dirname(fileURLToPath(import.meta.url))
        const pkgJsonPath = path.resolve(__dirname, '../package.json')
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'))
        const deps = Object.keys(pkgJson.dependencies || {}).filter((name) =>
            name.startsWith('@nera-static/')
        )

        for (const name of deps) {
            const loadPromise = import(name)
                .then((mod) => {
                    console.log(`  ✅ Loaded npm plugin: ${name}`)
                    return { type: 'npm', name, module: mod }
                })
                .catch((err) => {
                    console.warn(
                        `  ❌ Failed to load npm plugin ${name}:`,
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

    // 3. Wait for all plugins to load in parallel
    const results = await Promise.allSettled(loadingPromises)

    // 4. Process results and collect successfully loaded plugins
    let successCount = 0
    let errorCount = 0

    results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
            plugins.push(result.value.module)
            successCount++
        } else {
            errorCount++
        }
    })

    const loadTime = Math.round(performance.now() - startTime)
    console.log(
        `🎯 Plugin loading complete: ${successCount} loaded, ${errorCount} failed (${loadTime}ms)`
    )

    // 3. Apply plugin methods
    let appData = { ...initialData.app }
    let pagesData = [...initialData.pagesData]

    for (const plugin of plugins) {
        if (plugin.getAppData) {
            const result = plugin.getAppData({ app: appData, pagesData })
            if (
                result &&
                typeof result === 'object' &&
                !Array.isArray(result)
            ) {
                appData = result
            } else {
                console.warn(
                    '⚠️ Plugin getAppData returned invalid format, skipping replace'
                )
            }
        }

        if (plugin.getMetaData) {
            const result = plugin.getMetaData({ app: appData, pagesData })
            if (Array.isArray(result)) {
                pagesData = result
            } else {
                console.warn(
                    '⚠️ Plugin getMetaData returned invalid format, skipping append'
                )
            }
        }
    }

    return { app: appData, pagesData, plugins }
}
