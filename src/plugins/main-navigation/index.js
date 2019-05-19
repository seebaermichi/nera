const Plugin = require('../plugin')

class MainNavigation extends Plugin {
    constructor() {
        super(`${__dirname}/config/main-navigation.yaml`)
    }

    addAppData(data) {
        if (data !== null && typeof data === 'object') {
            return Object.assign({}, data, {
                mainNav: this.configData
            })
        }

        return data
    }
}

module.exports = new MainNavigation()
