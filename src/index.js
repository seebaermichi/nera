import { loadAppData, getPagesData, defaultSettings } from './core.js'
import { getPluginsData } from './setup-plugins.js'
import { copyFolder, deleteFolder, createHtmlFiles } from './render.js'

const run = async (settings = defaultSettings) => {
    let data = loadAppData(settings)

    // From `data.app`, not from `settings`: loadAppData has already merged any
    // `folders` block in config/app.yaml over the defaults, and this is what
    // makes that block take effect. Reading `settings.folders` here meant the
    // key was honoured by anything reading `app.folders` — plugins — while the
    // render itself ignored it, so a site that set `folders.assets` had its
    // plugin output written to one folder and a different one copied into
    // public/.
    const { assets, dist, views, pages, plugins } = data.app.folders

    data.pagesData = getPagesData(data.pages, pages)
    data = await getPluginsData(data, plugins)

    await deleteFolder(dist)
    await createHtmlFiles(data, views, dist)
    await copyFolder(assets, dist)
}

export default run
