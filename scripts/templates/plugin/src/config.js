// The plugin's config: config/{{short}}.yaml in the site, every key optional. The
// readers of @nera-static/plugin-utils/config merge it over defaults() key by key and
// warn about an unknown key or a bad value, which then keeps its default.
import { createConfigReader, loadPluginConfig } from '@nera-static/plugin-utils/config'
import { isText } from '@nera-static/plugin-utils/values'

/** The config file's name in the site's config folder, without `.yaml`. */
export const CONFIG_NAME = '{{short}}'

/** The config file as the site owner knows it, the prefix of every config warning. */
export const CONFIG_FILE = `config/${CONFIG_NAME}.yaml`

const DEFAULTS = Object.freeze({
    property: '{{short}}',
})

const READERS = {
    property: (value, current, reader) => (isText(value) ? value.trim() : reader.bad('property', value, current)),
}

/** The full default config, a fresh copy on every call. */
export function defaults() {
    return structuredClone(DEFAULTS)
}

/**
 * The config from a parsed config/{{short}}.yaml: defaults() with every valid key
 * of `raw` over it.
 * @param {unknown} raw the parsed file (`{}` when it is missing)
 * @param {{ warn?: (message: string) => void }} [options] where warnings go
 * @returns {{ property: string }}
 */
export function normalizeConfig(raw, { warn } = {}) {
    return createConfigReader({ file: CONFIG_FILE, defaults: DEFAULTS, readers: READERS, warn }).normalize(raw)
}

/**
 * The site's config: config/{{short}}.yaml below `cwd`, in `app.folders.config`
 * when the site moved its config folder.
 * @param {{ cwd?: string, app?: object, warn?: (message: string) => void }} [options]
 * @returns {{ property: string }}
 */
export function loadConfig({ cwd = process.cwd(), app, warn } = {}) {
    return normalizeConfig(loadPluginConfig(CONFIG_NAME, { cwd, app }), { warn })
}
