import fsReaddirRecursive from 'fs-readdir-recursive'
import path from 'path'
import { pathToFileURL } from 'url'

/**
 * Recursively collect all index.js files from the plugin path.
 * Assumes ESM-based plugins.
 */
export const getPlugins = (pluginPath = './src/plugins') =>
    fsReaddirRecursive(pluginPath).filter((file) => file.endsWith('index.js'))

/**
 * Dynamically imports ESM plugin modules and applies their data transformations.
 */
export const getPluginsData = async (data, pluginsDir = './src/plugins') => {
    const pluginPaths = getPlugins(pluginsDir)
    data.plugins = pluginPaths

    for (const file of pluginPaths) {
        const fullPath = path.join(pluginsDir, file)
        try {
            const plugin = await import(pathToFileURL(fullPath).href) // ESM only

            if (typeof plugin.getAppData === 'function') {
                data.app = { ...data.app, ...plugin.getAppData(data) }
            }

            if (typeof plugin.getMetaData === 'function') {
                const metaData = plugin.getMetaData(data)
                if (Array.isArray(metaData)) {
                    data.pagesData = metaData
                }
            }
        } catch (err) {
            console.warn(`Failed to load plugin ${file}: ${err.message}`)
        }
    }

    return data
}
