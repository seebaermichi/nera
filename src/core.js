import fs from 'fs'
import path from 'path'
import fsReaddirRecursive from 'fs-readdir-recursive'
import meta from 'markdown-it-meta'
import MarkdownIt from 'markdown-it'
import readYaml from 'read-yaml'

const md = new MarkdownIt({ html: true }).use(meta)

export const defaultSettings = {
    folders: {
        assets: './assets',
        config: './config',
        pages: './pages',
        dist: './public',
        views: './views'
    }
}

export const loadAppData = (settings = defaultSettings) => {
    let appConfig = {}

    try {
        appConfig = readYaml.sync(
            path.join(settings.folders.config, 'app.yaml')
        )
    } catch (err) {
        console.warn('Could not load app.yaml:', err.message)
    }

    return {
        app: appConfig,
        content: null,
        meta: null,
        pages: fsReaddirRecursive(settings.folders.pages),
        plugins: [],
        pagesData: []
    }
}

export const getPagesData = (pages, baseDir = defaultSettings.folders.pages) => {
    return pages.map((page) => {
        const fullPath = path.join(baseDir, page)
        let content = ''

        try {
            content = md.render(fs.readFileSync(fullPath, 'utf-8'))
        } catch (err) {
            console.warn('Failed to parse markdown for', fullPath, err.message)
        }

        return {
            content,
            meta: {
                ...md.meta,
                createdAt: fs.statSync(fullPath).birthtime,
                href: `/${page.replace(/\.md$/, '.html')}`,
                dirname: path.dirname(page),
                filename: path.parse(page).name
            }
        }
    })
}
