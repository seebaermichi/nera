import fs from 'fs/promises'
import path from 'path'
import { pathToFileURL } from 'url'

/**
 * Loads and applies local and installed plugins that can modify app and page data.
 *
 * @param {object} initialData - Contains `app` and `pagesData` keys.
 * @param {string} localPluginsDir - Path to local plugin directory.
 * @returns {Promise<{app: object, pagesData: object[], plugins: object[]}>}
 */
export async function getPluginsData (initialData, localPluginsDir = 'src/plugins') {
    const plugins = []

    // 1. Load local plugins
    const localPluginDirs = await fs.readdir(localPluginsDir).catch(() => [])
    for (const dir of localPluginDirs) {
        const pluginPath = path.join(localPluginsDir, dir, 'index.js')
        try {
            const mod = await import(pathToFileURL(pluginPath))
            plugins.push(mod)
        } catch {
            // Ignore broken or empty plugin
        }
    }

    // 2. Load installed plugins from node_modules
    const pkgJson = JSON.parse(await fs.readFile('./package.json', 'utf-8'))
    const deps = Object.keys(pkgJson.dependencies || {}).filter((name) =>
        name.startsWith('@nera-static/')
    )

    for (const name of deps) {
        try {
            const mod = await import(name)
            plugins.push(mod)
        } catch (err) {
            console.warn(`Failed to load plugin ${name}`, err)
        }
    }

    // 3. Apply plugin methods
    let appData = { ...initialData.app }
    let pagesData = [...initialData.pagesData]

    for (const plugin of plugins) {
        if (plugin.getAppData) {
            const result = plugin.getAppData({ app: appData, pagesData })
            if (result && typeof result === 'object' && !Array.isArray(result)) {
                appData = { ...appData, ...result }
            } else {
                console.warn('⚠️ Plugin getAppData returned invalid format, skipping merge')
            }
        }

        if (plugin.getMetaData) {
            const result = plugin.getMetaData({ app: appData, pagesData })
            if (Array.isArray(result)) {
                pagesData = [...pagesData, ...result]
            } else {
                console.warn('⚠️ Plugin getMetaData returned invalid format, skipping append')
            }
        }
    }

    return { app: appData, pagesData, plugins }
}
