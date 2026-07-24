import fs from 'fs'
import path from 'path'
import fsReaddirRecursive from 'fs-readdir-recursive'
import meta from 'markdown-it-meta'
import MarkdownIt from 'markdown-it'
import yaml from 'yaml'

const md = new MarkdownIt({ html: true }).use(meta)

// Normalise a site's `base_path` (config/app.yaml) into a URL prefix.
// Absent/blank/`/` → '' so a root-served site is untouched and renders
// byte-identically. Otherwise: trim, drop trailing slashes, guarantee one
// leading slash. `nera-website` → `/nera-website`; `/foo/bar/` → `/foo/bar`.
// This is the prefix a subdirectory deploy (e.g. GitHub *project* Pages served
// under `/<repo>/`) needs so that every root-absolute link and asset resolves.
export const normalizeBasePath = (raw) => {
    if (typeof raw !== 'string') return ''
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed === '/') return ''
    const noTrailing = trimmed.replace(/\/+$/, '')
    return noTrailing.startsWith('/') ? noTrailing : `/${noTrailing}`
}

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

    // Resolve the folders once, here, so every later stage reads the same
    // answer. Merged per key rather than replaced wholesale: a `folders` block
    // in app.yaml that names only `assets` must keep the defaults for `dist`,
    // `views` and the rest, not blank them.
    //
    // `folders.config` is the exception it has to be — app.yaml is found
    // through it, so it can only come from `settings`.
    const baseFolders = settings?.folders || defaultSettings.folders
    const folders = {
        ...baseFolders,
        ...(appConfig.folders || {}),
        config: baseFolders.config,
    }

    // Revised theme layout (ROADMAP-themes.md §1b, 2026-07-23): a site groups
    // its own presentation under `theme/{views,assets}`. When that folder
    // exists — and views/assets are still the defaults nobody overrode — point
    // them there. Otherwise render from the legacy root `views/`/`assets/`,
    // which is DEPRECATED but kept so an existing site renders byte-identically
    // to today, with a one-time deprecation warning. An explicit `folders:`
    // block in app.yaml always wins over this probe. This runs once per build
    // (loadAppData is called once), so the warning is naturally one-time.
    const themeFolderExists = fs.existsSync('theme')
    const usesDefault = (key) =>
        folders[key] === defaultSettings.folders[key] &&
        appConfig.folders?.[key] === undefined

    if (themeFolderExists) {
        if (usesDefault('views')) folders.views = './theme/views'
        if (usesDefault('assets')) folders.assets = './theme/assets'
    } else if (usesDefault('views')) {
        console.warn(
            '⚠️ Nera: rendering from the legacy root `views/`/`assets/` is ' +
                'deprecated — move your presentation to `theme/views/` and ' +
                '`theme/assets/` (see ROADMAP-themes.md §1b).'
        )
    }

    appConfig = { ...appConfig, folders }

    // The site's URL prefix for subdirectory deploys, exposed to templates and
    // plugins as `app.basePath` and used by getPagesData/render to prefix
    // root-absolute URLs. '' for a root-served site (the default) → no-op.
    appConfig.basePath = normalizeBasePath(appConfig.base_path)

    // Load pages directory with error handling
    try {
        if (fs.existsSync(appConfig.folders.pages)) {
            pages = fsReaddirRecursive(appConfig.folders.pages)
            console.log(`✅ Found ${pages.length} page(s) to process`)
        } else {
            console.warn(
                `⚠️ Pages directory not found: ${appConfig.folders.pages}`
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

            // Resolve the creation date. Prefer an author/platform-supplied
            // date from frontmatter — `createdAt`, else `date` — because the
            // filesystem `birthtime` fallback is unreliable under CI: a fresh
            // clone/checkout stamps every file with the same birthtime, which
            // silently breaks anything that orders or displays by date
            // (pagination, tag overviews, page lists, printed dates). Only when
            // frontmatter carries neither key do we fall back to `birthtime`,
            // which keeps a purely-local build byte-identical to before.
            // See nera-platform R1 (plans/01) and ROADMAP notes.
            let createdAt = md.meta.createdAt || md.meta.date
            if (!createdAt) {
                try {
                    createdAt = fs.statSync(fullPath).birthtime
                } catch (statErr) {
                    console.warn(
                        `⚠️ Could not get file stats for ${fullPath}:`,
                        statErr.message
                    )
                    createdAt = new Date() // Fallback to current date
                }
            }

            // Single source of truth for the output path: separators are
            // normalised to `/` so URLs are identical on every platform, and
            // only a trailing `.md` is replaced so `.mdx` or a path
            // containing `.md` mid-string cannot make href and fullPath
            // disagree.
            const wholeFilePathString = `/${page
                .split(path.sep)
                .join('/')
                .replace(/\.md$/, '.html')}`

            // `href` stays in the site's LOGICAL (un-prefixed) namespace — the
            // same value whether or not the site is deployed to a subdirectory.
            // A `base_path` prefix is applied uniformly at the very end, in the
            // render/asset URL rewrite, NOT here: templates and plugins do URL
            // math on `meta.href` (e.g. a language switcher stripping `/de`, an
            // active-link `link.href === meta.href` check), and pre-prefixing it
            // would break that math and double-prefix on rewrite.
            results.push({
                content,
                meta: {
                    ...md.meta,
                    createdAt,
                    href: wholeFilePathString,
                    fullPath: wholeFilePathString,
                    dirname: path.posix.dirname(wholeFilePathString),
                    filename: path.posix.basename(wholeFilePathString),
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
