const fsReaddirRecursive = require('fs-readdir-recursive')

const getPlugins = () =>
  fsReaddirRecursive('./src/plugins').filter(file => file.includes('index.js'))

const getPluginsData = data => {
  data.plugins = getPlugins()

  if (data.plugins.length > 0) {
    data.plugins.forEach(file => {
      const plugin = require(`./plugins/${file}`)

      if (plugin.hasOwnProperty('getAppData')) {
        data.app = plugin.getAppData(data)
      }

      if (plugin.hasOwnProperty('getMetaData')) {
        data.pagesData = plugin.getMetaData(data)
      }
    })
  }

  return data
}

module.exports = getPluginsData
