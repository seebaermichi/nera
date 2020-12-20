const fs = require('fs')
const path = require('path')

const ncp = require('ncp').ncp // Asynchronous recursive file & directory copying
const pug = require('pug')
const pretty = require('pretty')
const rimraf = require('rimraf') // The UNIX command rm -rf for node.

const SUCCESS_COLOR = '\x1b[32m%s\x1b[0m'

const copyFolder = (sourceFolder, targetFolder) => {
    if (fs.existsSync(sourceFolder)) {
        ncp.limit = 16
        ncp(sourceFolder, targetFolder, error => {
            if (error) {
                return console.log(error)
            }

            console.log(SUCCESS_COLOR, 'Assets copied')
        })
    } else {
        console.log(SUCCESS_COLOR, 'No Assets found')
    }
}

const createHtmlFiles = (data, viewsFolder, publicFolder) => {
    if (fs.existsSync(viewsFolder)) {
        data.pagesData.forEach(pageData => {
            if (pageData.meta.layout) {
                const fn = pug.compileFile(`${viewsFolder}/${pageData.meta.layout}`)
                const html = fn(Object.assign({}, data, pageData))

                fs.promises
                    .mkdir(path.dirname(`${publicFolder}/${pageData.meta.htmlPathName}`), {
                        recursive: true
                    })
                    .then(() => {
                        fs.writeFileSync(
                            `${publicFolder}/${pageData.meta.htmlPathName}`,
                            pretty(html),
                            'utf-8'
                        )

                        console.log(SUCCESS_COLOR, 'Html files created')
                    })
            }
        })
    } else {
        console.error('views folder not found')
    }
}

const deleteFolder = folder => {
    if (fs.existsSync(folder)) {
        try {
            rimraf.sync(folder)

            console.log(SUCCESS_COLOR, 'public folder removed')
        } catch (error) {
            console.error(error)
        }
    }
}

module.exports = {
    copyFolder,
    deleteFolder,
    createHtmlFiles
}
