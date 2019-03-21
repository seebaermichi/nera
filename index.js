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
const subNavs = []

pages.forEach((page, index) => {
  const subPath = getPath(page)
  md.render(fs.readFileSync(`./pages/${page}`, 'utf-8'))

  if (subPath !== '') {
    subNavs.push({
      name: md.meta.title,
      path: subPath,
      pos: md.meta.position || index,
      url: page.replace('.md', '.html')
    })
  }
})

rimraf.sync('./public')

let data = {
  app: Object.assign({}, appConfig, { mainNav }),
}

pages.forEach(page => {
  const content = md.render(fs.readFileSync(`./pages/${page}`, 'utf-8'))
  const newPagePath = `${page.split('.md')[0]}.html`

  data = Object.assign({}, data, {
    content: content,
    meta: Object.assign({}, md.meta, {
      pagePath: getPath(page),
      pageUrl: newPagePath,
      sideNav: getSubNav(subNavs, newPagePath)
    })
  })

  const fn = pug.compileFile(`./views/${md.meta.layout}`)
  const html = fn({
    app: data.app,
    content: data.content,
    meta: data.meta
  })

  fs.promises.mkdir(path.dirname(`./public/${newPagePath}`), {
    'recursive': true
  })
    .then(() => {
      fs.writeFileSync(`./public/${newPagePath}`, pretty(html), 'utf-8')
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

function getPath(url) {
  const pathElements = url.split('/')
  return pathElements.length > 0 ? pathElements.splice(0, pathElements.length - 1).join('/') : '/'
}

function getSubNav(subNavs, url) {
  return subNavs.filter(({ path }) => url.includes(path))
    .map(element => ({
      current: element.url === url,
      name: element.name,
      pos: element.pos,
      url: `/${element.url}`
    }))
    .sort((a, b) => a.pos - b.pos)
}
