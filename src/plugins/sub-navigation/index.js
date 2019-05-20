const Plugin = require('../plugin')

class SubNavigation extends Plugin {
    addMetaData() {
        if (this.pagesData !== null && Array.isArray(this.pagesData)) {
            const subNavs = []

            this.pagesData.forEach(({ meta }, index) => {
                if (meta.pagePathName !== '') {
                    subNavs.push({
                        name: meta.title,
                        path: meta.pagePathName, // without file name
                        position: meta.position || index,
                        href: meta.htmlPathName
                    })
                }
            })

            this.pagesData = this.pagesData.map(({ content, meta }) => ({
                content,
                meta: Object.assign({}, meta, {
                    subNav: meta.subNav || Object.assign({}, this.configData, {
                        elements: this.getSideNav(subNavs, meta.htmlPathName)
                    })
                })
            }))
        }

        return this.pagesData
    }

    getSideNav(subNavs, currentHref) {
        return subNavs.filter(({ path }) => currentHref.includes(path))
            .map(({ href, name, position }) => ({
                current: href === currentHref,
                name,
                position,
                href
            }))
            .sort((a, b) => a.position - b.position)
    }
}

module.exports = SubNavigation
