const Plugin = require('../../plugin')

class SubNavigation extends Plugin {
    addMetaData(data) {
        if (data !== null && typeof data === 'object') {
            const subNavs = []

            data.forEach(({ meta }, index) => {
                if (meta.pagePathName !== '') {
                    subNavs.push({
                        name: meta.title,
                        path: meta.pagePathName, // without file name
                        position: meta.position || index,
                        href: meta.htmlPathName
                    })
                }
            })

            data = data.map(dataSet => ({
                content: dataSet.content,
                meta: Object.assign({}, dataSet.meta, {
                    subNav: dataSet.meta.subNav || Object.assign({}, this.configData, {
                        elements: this.getSideNav(subNavs, dataSet.meta.htmlPathName)
                    })
                })
            }))

        }

        return data
    }

    getSideNav(subNavs, href) {
        return subNavs.filter(({ path }) => href.includes(path))
            .map(element => ({
                current: element.href === href,
                name: element.name,
                position: element.position,
                href: element.href
            }))
            .sort((a, b) => a.position - b.position)
    }
}

module.exports = new SubNavigation()
