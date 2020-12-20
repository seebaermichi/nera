const { appData, getPagesData, defaultSettings } = require('./core')
const getPluginsData = require('./setup-plugins')
const { copyFolder, deleteFolder, createHtmlFiles } = require('./render')

const run = () => {
    let data = appData
    const { assets, dist, views } = defaultSettings.folders
    data.pagesData = getPagesData(data.pages)

    data = getPluginsData(data)

    deleteFolder(dist)
    createHtmlFiles(data, views, dist)
    copyFolder(assets, dist)
}

module.exports = run
