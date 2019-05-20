const Plugin = require('../plugin')

class MainNavigation extends Plugin {
    constructor(data) {
        super(data, `${__dirname}/config/main-navigation.yaml`)
    }

    addAppData() {
        if (this.appData !== null && typeof this.appData === 'object') {
            return Object.assign({}, this.appData, {
                mainNav: this.configData
            })
        }

        return this.appData
    }
}

module.exports = MainNavigation
