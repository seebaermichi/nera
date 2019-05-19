const Plugin = require('../plugin')

class SubNavigation extends Plugin {
    addMetaData(pagesData) {
        if (pagesData !== null && Array.isArray(pagesData)) {
            const subNavs = []

            pagesData.forEach(({ meta }, index) => {
                if (meta.pagePathName !== '') {
                    subNavs.push({
                        name: meta.title,
                        path: meta.pagePathName, // without file name
                        position: meta.position || index,
                        href: meta.htmlPathName
                    })
                }
            })

            pagesData = pagesData.map(({ content, meta }) => ({
                content,
                meta: Object.assign({}, meta, {
                    subNav: meta.subNav || Object.assign({}, this.configData, {
                        elements: this.getSideNav(subNavs, meta.htmlPathName)
                    })
                })
            }))
        }

        return pagesData
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

module.exports = new SubNavigation()
