import { loadAppData, getPagesData, defaultSettings } from './core.js'
import { getPluginsData } from './setup-plugins.js'
import {
    copyFolder,
    deleteFolder,
    createHtmlFiles,
    rewriteAssetUrls,
} from './render.js'
import { resolveTheme, checkThemeCompatibility } from './theme.js'

const run = async (settings = defaultSettings) => {
    let data = loadAppData(settings)

    // Discover the configured theme (ROADMAP-themes.md §1). Null when no
    // `theme:` key is set, in which case render behaves exactly as before.
    const theme = resolveTheme({ app: data.app })

    // Verify the theme's compatibility declarations before doing any work (§5):
    // a nera.generator range that excludes THIS generator fails the build (a
    // newer theme may use an app.* key or behaviour that does not exist here),
    // while an unsatisfied plugin peerDependency only warns (the plugin still
    // renders correct markup; the theme just may lack CSS for it). Synchronous;
    // a theme declaring neither field, or a themeless site, is unaffected.
    checkThemeCompatibility(theme)

    // Expose the theme to templates as one namespaced object (§1c), so a layout
    // reads `app.theme.config.colors.primary`. `config` is the theme's own
    // `config/theme.yaml` defaults deep-merged with the site's optional override.
    // Attached before the plugin pass so plugins see it too and it threads
    // through the app object like `lang` and `name` do.
    if (theme) {
        data.app = {
            ...data.app,
            theme: {
                name: theme.name,
                package: theme.package,
                config: theme.config,
            },
        }
    }

    // From `data.app`, not from `settings`: loadAppData has already merged any
    // `folders` block in config/app.yaml over the defaults, and this is what
    // makes that block take effect. Reading `settings.folders` here meant the
    // key was honoured by anything reading `app.folders` — plugins — while the
    // render itself ignored it, so a site that set `folders.assets` had its
    // plugin output written to one folder and a different one copied into
    // public/.
    const { assets, dist, views, pages, plugins } = data.app.folders

    data.pagesData = getPagesData(data.pages, pages)
    data = await getPluginsData(data, plugins)

    await deleteFolder(dist)
    await createHtmlFiles(data, views, dist, theme)

    // Assets layer like views: theme first, site second, so a site file with
    // the same path overwrites the theme's (§2). A theme that ships no assets
    // is fine — copyFolder no-ops on a missing source. The theme pass passes
    // `null` so it is unfiltered — a theme package's payload is author-controlled
    // and must not be dropped by anyone's .neraignore (§2d). The site pass reads
    // the site's own .neraignore from the site root ('.'), so it keeps filtering
    // the site's assets even though they now live under `theme/assets`.
    if (theme) {
        await copyFolder(theme.assetsRoot, dist, null)
    }
    await copyFolder(assets, dist, '.')

    // Subdirectory deploys: prefix root-absolute URLs inside copied assets that
    // the HTML rewrite can't reach (CSS `url(/…)`, the web app manifest). Runs
    // after both asset passes; no-op when `base_path` is unset.
    await rewriteAssetUrls(dist, data.app.basePath)
}

export default run

// Public API barrel for `@nera-static/core`. `run` (the whole build) doubles as
// the default and a named export; the rest is what the CLI, `@nera-static/validate`
// and tooling reuse — the pipeline stages, the layered resolver, and the
// read-only site-model loader. Subpath exports (`@nera-static/core/resolve`,
// `/site-model`, …) stay available for callers that want only one module.
export { run }
export {
    loadAppData,
    getPagesData,
    computeFolders,
    defaultSettings,
    normalizeBasePath,
} from './core.js'
export { getPluginsData } from './setup-plugins.js'
export {
    makeLayeredResolver,
    resolveEntry,
    defaultResolvePath,
} from './resolve.js'
export { resolveSiteModel } from './site-model.js'
export {
    resolveTheme,
    checkThemeCompatibility,
    deepMerge,
} from './theme.js'
