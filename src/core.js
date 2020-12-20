const fs = require('fs')
const path = require('path')

const fsReaddirRecursive = require('fs-readdir-recursive')
const meta = require('markdown-it-meta')
const md = require('markdown-it')({ html: true }).use(meta)
const readYaml = require('read-yaml')

const defaultSettings = {
    folders: {
        assets: './assets',
        config: './config',
        pages: './pages',
        dist: './public',
        views: './views'
    }
}

const appData = {
    app: readYaml.sync(`${defaultSettings.folders.config}/app.yaml`),
    content: null,
    meta: null,
    pages: fsReaddirRecursive(defaultSettings.folders.pages),
    plugins: [],
    pagesData: []
}

const getPagesData = pages => {
    return pages.map(page => ({
        content: md.render(
            fs.readFileSync(`${defaultSettings.folders.pages}/${page}`, 'utf-8')
        ),
        meta: Object.assign({}, md.meta, {
            createdAt: fs.statSync(`${defaultSettings.folders.pages}/${page}`)
                .birthtime,
            htmlPathName: `/${page.split('.md')[0]}.html`, /* depricated */
            href: `/${page.split('.md')[0]}.html`,
            pagePathName: path.dirname(page), /* depricated */
            dirname: path.dirname(page)
        })
    }))
}

module.exports = {
    appData,
    defaultSettings,
    getPagesData
}
