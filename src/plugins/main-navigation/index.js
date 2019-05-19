const Plugin = require('../plugin')

class MainNavigation extends Plugin {
    constructor() {
        super(`${__dirname}/config/main-navigation.yaml`)
    }

    addAppData(appData) {
        if (appData !== null && typeof appData === 'object') {
            return Object.assign({}, appData, {
                mainNav: this.configData
            })
        }

        return appData
    }
}

module.exports = new MainNavigation()
