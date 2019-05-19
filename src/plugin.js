const fs = require('fs')
const readYaml = require('read-yaml')

class Plugin {
    constructor(configFilePath) {
        this.configData = ''

        if (fs.existsSync(configFilePath)) {
            this.configData = readYaml.sync(configFilePath)
        }
    }

    addAppData(data) {
        return data
    }

    addMetaData(data) {
        return data
    }
}

module.exports = Plugin
