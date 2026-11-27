// {{package}} — {{description}}
//
// `getAppData` adds `app.<property>` (the number of rendered pages), `getMetaData`
// adds `meta.<property>` (the page's language) to every page; `property` comes from
// config/{{short}}.yaml. Replace both with what the plugin does and keep the shape:
// each hook destructures only the keys it uses, with defaults, and reads its config
// inside the hook.
import { createLogger } from '@nera-static/plugin-utils/log'
import { pageLang } from '@nera-static/plugin-utils/lang'
import { isRenderedPage } from '@nera-static/plugin-utils/pages'
import { loadConfig } from './src/config.js'

const log = createLogger('plugin-{{short}}')

export function getAppData({ app = {}, pagesData = [] } = {}) {
    const config = loadConfig({ app, warn: log.warn })
    const pages = pagesData.filter((page) => isRenderedPage(page.meta)).length
    return { ...app, [config.property]: { pages } }
}

export function getMetaData({ app = {}, pagesData = [] } = {}) {
    const config = loadConfig({ app, warn: log.warn })
    return pagesData.map((page) => ({
        ...page,
        meta: { ...page.meta, [config.property]: { lang: pageLang(page.meta, app) } },
    }))
}
