import { loadAppData, getPagesData, defaultSettings } from './core.js'
import { getPluginsData } from './setup-plugins.js'
import { copyFolder, deleteFolder, createHtmlFiles } from './render.js'

const run = async (settings = defaultSettings) => {
    let data = loadAppData(settings)
    const { assets, dist, views, pages, plugins } = settings.folders

    data.pagesData = getPagesData(data.pages, pages)
    data = await getPluginsData(data, plugins)

    await deleteFolder(dist)
    await createHtmlFiles(data, views, dist)
    await copyFolder(assets, dist)
}

export default run
