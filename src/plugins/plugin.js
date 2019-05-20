const fs = require('fs')
const readYaml = require('read-yaml')

class Plugin {
    constructor({ appData, pagesData }, configFilePath = '') {
        this.appData = appData
        this.pagesData = pagesData
        this.configData = ''

        if (configFilePath !== '' && fs.existsSync(configFilePath)) {
            this.configData = readYaml.sync(configFilePath)
        }
    }

    addAppData() {
        return this.appData
    }

    addMetaData() {
        return this.pagesData
    }
}

module.exports = Plugin
