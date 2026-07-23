import { loadAppData, getPagesData, defaultSettings } from './core.js'
import { getPluginsData } from './setup-plugins.js'
import { copyFolder, deleteFolder, createHtmlFiles } from './render.js'
import { resolveTheme } from './theme.js'

const run = async (settings = defaultSettings) => {
    let data = loadAppData(settings)

    // Discover the configured theme (ROADMAP-themes.md §1). Null when no
    // `theme:` key is set, in which case render behaves exactly as before.
    const theme = resolveTheme({ app: data.app })

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
}

export default run
