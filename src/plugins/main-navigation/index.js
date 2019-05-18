const readYaml = require('read-yaml')
const Plugin = require('../../plugin')

class MainNavigation extends Plugin {
    constructor() {
        super()
        this.mainNavData = readYaml.sync(`${__dirname}/config/main-navigation.yaml`)
    }

    addAppData(data) {
        if (data !== null && typeof data === 'object') {
            return Object.assign({}, data, {
                mainNav: this.mainNavData
            })
        }

        return data
    }
}

module.exports = new MainNavigation()
