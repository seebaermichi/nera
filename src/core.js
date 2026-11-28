import fs from 'fs'
import path from 'path'
import fsReaddirRecursive from 'fs-readdir-recursive'
import MarkdownIt from 'markdown-it'
import yaml from 'yaml'
import {
    FRONTMATTER_OPTIONS,
    splitFrontmatter,
} from '@nera-static/plugin-utils/frontmatter'
import { normalizeBasePath } from '@nera-static/plugin-utils/urls'

// `normalizeBasePath` (a site's `base_path` → '' or `/sub`) lives in
// plugin-utils; it stays exported here because tooling imports it from
// `@nera-static/core/core`.
export { normalizeBasePath }

const md = new MarkdownIt({ html: true })

// A page's frontmatter and Markdown body: the `---` fence is found by
// plugin-utils' `splitFrontmatter` and the YAML parsed with its
// `FRONTMATTER_OPTIONS` (unquoted dates become Dates, `<<` merge keys work, a
// repeated key takes the last value), the same rule `nera validate` applies.
// The meta is built per page, so a page without frontmatter never inherits
// another page's.
const parsePage = (fileContent) => {
    const split = splitFrontmatter(fileContent)
    if (!split) return { content: md.render(fileContent), meta: {} }
    return {
        content: md.render(split.body),
        meta: yaml.parse(split.yamlText, FRONTMATTER_OPTIONS) || {},
    }
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

// Resolve a site's presentation folders — the `folders` block from app.yaml
// merged over the defaults, then the `theme/` probe (ROADMAP-themes.md §1b):
// when `<cwd>/theme/` exists and views/assets are still the untouched defaults,
// point them at `./theme/views`/`./theme/assets`. `config` can only come from
// `settings` (app.yaml is found through it), so it is never overridden here.
//
// cwd-aware and side-effect-free by default, so a caller outside the site
// directory — `@nera-static/validate`, the platform's Node service — gets the
// exact same folders the build uses (see resolveSiteModel). Pass `warn: true`
// to emit the one-time legacy-root deprecation notice; loadAppData does, a
// read-only caller does not.
export const computeFolders = (
    appConfig = {},
    { settings = defaultSettings, cwd = process.cwd(), warn = false } = {}
) => {
    const baseFolders = settings?.folders || defaultSettings.folders
    const folders = {
        ...baseFolders,
        ...(appConfig.folders || {}),
        config: baseFolders.config,
    }

    const themeFolderExists = fs.existsSync(path.join(cwd, 'theme'))
    // A site that names a theme package but has no presentation of its own —
    // neither `theme/` nor a legacy root `views/` — takes the theme layout too:
    // the theme supplies every view, and a later override lands in `theme/`.
    const themeOnly =
        Boolean(appConfig.theme) && !fs.existsSync(path.join(cwd, 'views'))
    const usesDefault = (key) =>
        folders[key] === defaultSettings.folders[key] &&
        appConfig.folders?.[key] === undefined

    if (themeFolderExists || themeOnly) {
        if (usesDefault('views')) folders.views = './theme/views'
        if (usesDefault('assets')) folders.assets = './theme/assets'
    } else if (warn && usesDefault('views')) {
        console.warn(
            '⚠️ Nera: rendering from the legacy root `views/`/`assets/` is ' +
                'deprecated — move your presentation to `theme/views/` and ' +
                '`theme/assets/` (see ROADMAP-themes.md §1b).'
        )
    }

    return folders
}

export const loadAppData = (settings = defaultSettings) => {
    let appConfig = {}
    let pages = []

    // Load app.yaml with better error handling. The folders may be relative
    // (the defaults are), so they are resolved against `process.cwd()` here,
    // as computeFolders does, instead of handing fs a relative path.
    const appConfigPath = path.resolve(settings.folders.config, 'app.yaml')
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
    // answer — the `folders` merge plus the `theme/` probe, both now owned by
    // computeFolders so a read-only caller (the validator, the platform) gets
    // an identical answer. `warn: true` emits the legacy-root deprecation notice
    // once per build (loadAppData is called once).
    const folders = computeFolders(appConfig, { settings, warn: true })

    appConfig = { ...appConfig, folders }

    // The site's URL prefix for subdirectory deploys, exposed to templates and
    // plugins as `app.basePath` and used by getPagesData/render to prefix
    // root-absolute URLs. '' for a root-served site (the default) → no-op.
    appConfig.basePath = normalizeBasePath(appConfig.base_path)

    // Load pages directory with error handling
    try {
        const pagesFolder = path.resolve(appConfig.folders.pages)
        if (fs.existsSync(pagesFolder)) {
            pages = fsReaddirRecursive(pagesFolder)
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
            const { content, meta: pageMeta } = parsePage(fileContent)

            // Resolve the creation date. Prefer an author/platform-supplied
            // date from frontmatter — `createdAt`, else `date` — because the
            // filesystem `birthtime` fallback is unreliable under CI: a fresh
            // clone/checkout stamps every file with the same birthtime, which
            // silently breaks anything that orders or displays by date
            // (pagination, tag overviews, page lists, printed dates). Only when
            // frontmatter carries neither key do we fall back to `birthtime`,
            // which keeps a purely-local build byte-identical to before.
            // See nera-platform R1 (plans/01) and ROADMAP notes.
            let createdAt = pageMeta.createdAt || pageMeta.date
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
                    ...pageMeta,
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
