const fs = require('fs')
const path = require('path')

const fsReaddirRecursive = require('fs-readdir-recursive')
const ncp = require('ncp').ncp
const pretty = require('pretty')
const pug = require('pug')
const readYaml = require('read-yaml')
const rimraf = require('rimraf')

const Markdown = require('markdown-it')
const meta = require('markdown-it-meta')
const md = new Markdown().use(meta)

const appConfig = readYaml.sync('./config/app.yaml')
const mainNav = readYaml.sync('./config/main-navigation.yaml')

const pages = fsReaddirRecursive('./pages')

rimraf.sync('./public')

let data = {
  app: Object.assign({}, appConfig, { mainNav }),
}

pages.forEach(file => {
  const content = md.render(fs.readFileSync(`./pages/${file}`, 'utf-8'))
  const newFilePath = `${file.split('.md')[0]}.html`

  data = Object.assign({}, data, {
    content: content,
    meta: Object.assign({}, md.meta, {
      pageUrl: newFilePath
    })
  })

  const fn = pug.compileFile(`./views/${md.meta.layout}`)
  const html = fn({
    app: data.app,
    content: data.content,
    meta: data.meta
  })

  fs.promises.mkdir(path.dirname(`./public/${newFilePath}`), {
    'recursive': true
  })
    .then(() => {
      fs.writeFileSync(`./public/${newFilePath}`, pretty(html), 'utf-8')
    })
})

if (fs.existsSync('./assets')) {
  ncp.limit = 16
  ncp('./assets', './public', error => {
    if (error) {
      return console.log(error)
    }

    console.log('\x1b[32m%s\x1b[0m', 'Done')
  })
} else {
  console.log('\x1b[32m%s\x1b[0m', 'Done')
}
