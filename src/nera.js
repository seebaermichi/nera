const fs = require('fs')
const path = require('path')

const fsReaddirRecursive = require('fs-readdir-recursive')
const Markdown = require('markdown-it')
const meta = require('markdown-it-meta')
const md = new Markdown().use(meta)
const ncp = require('ncp').ncp // Asynchronous recursive file & directory copying
const pretty = require('pretty')
const pug = require('pug')
const readYaml = require('read-yaml')
const rimraf = require('rimraf') //The UNIX command rm -rf for node.

class Nera {
    constructor() {
        this.config = readYaml.sync('./config/app.yaml')
        this.md = new Markdown().use(meta)
        this.pages = fsReaddirRecursive('./pages')
        this.plugins = []
        this.pagesData = []
        this.successLogColor = '\x1b[32m%s\x1b[0m'
        this.data = {
            app: this.config
        }

        this.setPagesData()
        this.setPlugins()
    }

    run() {
        this.loadPlugins()
        this.createHtmlFiles()
        this.copyAssetsToPublic()
    }

    loadPlugins() {
        this.plugins.forEach(file => {
            const pluginClass = require(`./plugins/${file}`)
            const plugin = new pluginClass({ appData: this.data.app, pagesData: this.pagesData })

            this.data.app = plugin.addAppData()
            this.pagesData = plugin.addMetaData()
        })
    }

    createHtmlFiles() {
        this.pagesData.forEach(pageData => {
            const fn = pug.compileFile(`./views/${pageData.meta.layout}`)
            const html = fn(Object.assign({}, this.data, pageData))

            fs.promises.mkdir(path.dirname(`./public/${pageData.meta.htmlPathName}`), {
                'recursive': true
              })
                .then(() => {
                  fs.writeFileSync(`./public/${pageData.meta.htmlPathName}`, pretty(html), 'utf-8')
                })
        })
    }

    copyAssetsToPublic() {
        if (fs.existsSync('./assets')) {
            ncp.limit = 16
            ncp('./assets', './public', error => {
              if (error) {
                return console.log(error)
              }

              console.log(this.successLogColor, 'Done')
            })
        } else {
            console.log(this.successLogColor, 'Done')
        }
    }

    removePublicFolder() {
        rimraf.sync('./public')
    }

    setPagesData() {
        this.pagesData = this.pages.map(page => ({
            content: md.render(fs.readFileSync(`./pages/${page}`, 'utf-8')),
            meta: Object.assign({}, md.meta, {
                createdAt: fs.statSync(`./pages/${page}`).birthtime,
                htmlPathName: `/${page.split('.md')[0]}.html`,
                pagePathName: this.getPathName(page) // path name without file
            })
        }))
    }

    getPathName(pagePath) {
        const pathElements = pagePath.split('/')
        return pathElements.length > 0 ? pathElements.splice(0, pathElements.length - 1).join('/') : '/'
    }

    setPlugins() {
        this.plugins = fsReaddirRecursive('./src/plugins').filter(file => file.includes('index.js'))
    }
}

module.exports = Nera
