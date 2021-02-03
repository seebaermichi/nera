const fs = require('fs')
const path = require('path')

const express = require('express')
const app = express()
const port = 8888

const fsReaddirRecursive = require('fs-readdir-recursive')
const bodyParser = require('body-parser')
const meta = require('markdown-it-meta')
const md = require('markdown-it')({ html: true }).use(meta)

app.set('view engine', 'pug')
app.set('views', path.join(__dirname, 'views'))

app.use('/static', express.static(path.join(__dirname, 'public')))
app.use(bodyParser.urlencoded({ extended: true }))

const getPath = name => path.join(__dirname, `../../pages/${name}`)

const getMarkdownContent = page => {
    const pagePath = getPath(page)
    const pageMarkdown = fs.readFileSync(pagePath, 'utf-8')
    md.render(pageMarkdown)
    return {
        content: fs.readFileSync(pagePath, 'utf-8').split('---\n')[2],
        meta: md.meta
    }
}

app.get('/admin', (req, res) => {
    const selectedPage = req.query.page || ''
    const pagesPath = path.join(__dirname, '../../pages')
    const pages = fsReaddirRecursive(pagesPath).map(page => {
        const pageContent = getMarkdownContent(page)
        const pathParts = page.split('/')
        const pageFile = pathParts.slice(pathParts.length - 1)

        return {
            isPage: pageContent.meta.layout || false,
            href: page,
            page: pageFile[0],
            parent: pathParts.slice(0, pathParts.length - 1).join('/')
        }
    })
        .sort((a, b) => {
            return (a.href < b.href) ? -1 : (a.href > b.href) ? 1 : 0
        })

    let result = []
    let level = { result }

    pages.forEach(({ href, isPage }) => {
        href.split('/').reduce((r, name, i, a) => {
            if (!r[name]) {
                r[name] = { result: [] }
                r.result.push({ name, href: name.includes('.md') ? href : false, isPage, children: r[name].result })
                r.result.sort((a, b) => {
                    return !a.href && b.href ? -1 : (a.href && !b.href) ? 1 : 0
                })
            }

            return r[name]
        }, level)
    })

    result = [{
        name: 'pages',
        href: false,
        isPage: false,
        children: result
    }]

    res.render('pages/index', {
        title: 'Admin',
        pageStructure: result,
        page: selectedPage
    })
})

app.get('/admin/edit/', (req, res) => {
    const showPreview = req.query.showPreview || false
    const page = req.query.page
    const pageContent = getMarkdownContent(page)
    const pageParts = page.split('/')
    const pagePath = pageParts.slice(0, pageParts.length - 1).join('/')
    const pageName = pageParts.slice(pageParts.length - 1).join('').replace('.md', '')

    const selectedLayout = pageContent.meta.layout || ''

    if (pageContent.meta.layout) {
        pageContent.meta.layout = fs.readdirSync(path.join(__dirname, '../../views/pages'))
    }

    const editorToolbar = {
        element: () => document.querySelector('.preview .content'),
        spellChecker: false,
        toolbar: [
            'bold',
            'italic',
            'strikethrough',
            '|',
            'heading',
            'heading-1',
            'heading-2',
            'heading-3',
            'quote',
            '|',
            'unordered-list',
            'ordered-list',
            'table',
            '|',
            'link',
            'image',
            '|',
            'guide'
        ]
    }

    res.render('pages/edit', {
        title: 'Edit page',
        page,
        pagePath,
        pageName,
        pageContent,
        selectedLayout,
        showPreview,
        sidebarWidth: 3,
        editorToolbar
    })
})

app.get('/admin/copy/', (req, res) => {
    const page = req.query.page
    const pageContent = getMarkdownContent(page)

    const selectedLayout = pageContent.meta.layout || ''

    if (pageContent.meta.layout) {
        pageContent.meta.layout = fs.readdirSync(path.join(__dirname, '../../views/pages'))
    }

    res.render('pages/edit', { title: 'Edit page', page, pageContent, selectedLayout, copy: true })
})

app.get('/admin/delete/', (req, res) => {
    const page = req.query.page
    const pageContent = getMarkdownContent(page)

    const selectedLayout = pageContent.meta.layout || ''

    if (pageContent.meta.layout) {
        pageContent.meta.layout = fs.readdirSync(path.join(__dirname, '../../views/pages'))
    }

    res.render('pages/edit', { title: 'Edit page', page, pageContent, selectedLayout, delete: true })
})

app.post('/admin/page/store/', (req, res) => {
    const page = req.body.page
    const meta = req.body.meta
    const metaKeys = Object.keys(req.body.meta)

    let pageContent = '---\n'
    pageContent += metaKeys.map(key => `${key}: '${meta[key]}'`).join('\n')
    pageContent += '\n---\n'
    pageContent += req.body.content

    fs.writeFileSync(getPath(page), pageContent, 'utf-8')

    res.redirect(`/admin/edit?page=${page}&showPreview=true`)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
})
