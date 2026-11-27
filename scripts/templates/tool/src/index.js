// {{package}} — {{description}}
//
// The entry point `exports` names. `version()` stands in for the tool's API: replace
// it with what the tool does and keep the shape: named exports with a JSDoc block
// each, generic helpers from the @nera-static/plugin-utils subpaths, never a copy.
import { ownVersion } from '@nera-static/plugin-utils/packages'

/**
 * The version of {{package}} that is running, as its package.json declares it.
 * @returns {string|null} the version, `null` when no package.json can be read
 */
export function version() {
    return ownVersion(import.meta.url)
}
