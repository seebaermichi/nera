import fs from 'fs'
import path from 'path'
import fsReaddirRecursive from 'fs-readdir-recursive'
import meta from 'markdown-it-meta'
import MarkdownIt from 'markdown-it'
import yaml from 'yaml'

const md = new MarkdownIt({ html: true }).use(meta)

export const defaultSettings = {
    folders: {
        assets: './assets',
        config: './config',
        pages: './pages',
        dist: './public',
        views: './views',
        plugins: './src/plugins',
    },
}

export const loadAppData = (settings = defaultSettings) => {
    let appConfig = {}
    let pages = []

    // Load app.yaml with better error handling
    const appConfigPath = path.join(settings.folders.config, 'app.yaml')
    try {
        if (fs.existsSync(appConfigPath)) {
            const configContent = fs.readFileSync(appConfigPath, 'utf-8')
            appConfig = yaml.parse(configContent) || {}
            console.log('✅ App configuration loaded successfully')
        } else {
            console.warn('⚠️ No app.yaml found, using empty configuration')
        }
    } catch (err) {
        console.error('❌ Failed to load app.yaml:', err.message)
        console.warn('⚠️ Using empty configuration as fallback')
    }

    // Load pages directory with error handling
    try {
        if (fs.existsSync(settings.folders.pages)) {
            pages = fsReaddirRecursive(settings.folders.pages)
            console.log(`✅ Found ${pages.length} page(s) to process`)
        } else {
            console.warn(
                `⚠️ Pages directory not found: ${settings.folders.pages}`
            )
        }
    } catch (err) {
        console.error('❌ Failed to read pages directory:', err.message)
        console.warn('⚠️ No pages will be processed')
    }

    return {
        app: appConfig,
        content: null,
        meta: null,
        pages,
        plugins: [],
        pagesData: [],
    }
}

export const getPagesData = (
    pages,
    baseDir = defaultSettings.folders.pages
) => {
    const results = []
    let successCount = 0
    let errorCount = 0

    pages.forEach((page) => {
        const fullPath = path.join(baseDir, page)

        try {
            // Check if file exists and is readable
            if (!fs.existsSync(fullPath)) {
                console.warn(`⚠️ Page file not found: ${fullPath}`)
                errorCount++
                return
            }

            // Read and parse markdown
            const fileContent = fs.readFileSync(fullPath, 'utf-8')
            const content = md.render(fileContent)

            // Get file stats safely
            let createdAt
            try {
                createdAt = fs.statSync(fullPath).birthtime
            } catch (statErr) {
                console.warn(
                    `⚠️ Could not get file stats for ${fullPath}:`,
                    statErr.message
                )
                createdAt = new Date() // Fallback to current date
            }

            const wholeFilePathString = `/${page.split('.md')[0]}.html`

            results.push({
                content,
                meta: {
                    ...md.meta,
                    createdAt,
                    href: `/${page.replace(/\.md$/, '.html')}`,
                    fullPath: wholeFilePathString,
                    dirname: path.dirname(wholeFilePathString),
                    filename: path.basename(wholeFilePathString),
                },
            })

            successCount++
        } catch (err) {
            console.error(`❌ Failed to process page ${page}:`, err.message)
            errorCount++
            // Skip this page - don't add it to results
        }
    })

    // Summary logging
    if (pages.length > 0) {
        console.log(
            `📄 Page processing complete: ${successCount} success, ${errorCount} errors`
        )
        if (errorCount > 0) {
            console.warn(`⚠️ ${errorCount} page(s) were skipped due to errors`)
        }
    }

    return results
}
