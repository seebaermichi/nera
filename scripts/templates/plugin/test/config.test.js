import { describe, expect, it } from 'vitest'
import { captureConsole, tempDir, writeFiles } from '@nera-static/test-utils'
import { CONFIG_FILE, defaults, loadConfig, normalizeConfig } from '../src/config.js'

describe('normalizeConfig', () => {
    it('returns the defaults for an empty or missing config', () => {
        expect(normalizeConfig({})).toEqual(defaults())
        expect(normalizeConfig(undefined)).toEqual(defaults())
    })

    it('takes a valid property, trimmed', () => {
        expect(normalizeConfig({ property: ' stats ' })).toEqual({ ...defaults(), property: 'stats' })
    })

    it('keeps the default for an empty key', () => {
        expect(normalizeConfig({ property: null })).toEqual(defaults())
    })

    it('warns about a bad value and keeps the default', () => {
        const warnings = []
        expect(normalizeConfig({ property: 42 }, { warn: (msg) => warnings.push(msg) })).toEqual(defaults())
        expect(warnings).toEqual([`${CONFIG_FILE}: invalid property 42, using "${defaults().property}"`])
    })

    it('warns about an unknown key and a config that is no mapping', () => {
        const warnings = []
        const warn = (msg) => warnings.push(msg)
        normalizeConfig({ unknown: true }, { warn })
        normalizeConfig(['property'], { warn })
        expect(warnings).toEqual([
            `${CONFIG_FILE}: ignoring unknown key "unknown"`,
            `${CONFIG_FILE}: expected a mapping at the top level, using defaults`,
        ])
    })
})

describe('loadConfig', () => {
    it('reads config/{{short}}.yaml below cwd', () => {
        const cwd = writeFiles(tempDir('nera-config-'), { [CONFIG_FILE]: 'property: stats\n' })
        expect(loadConfig({ cwd }).property).toBe('stats')
    })

    it('follows app.folders.config', () => {
        const cwd = writeFiles(tempDir('nera-config-'), { 'settings/{{short}}.yaml': 'property: stats\n' })
        expect(loadConfig({ cwd, app: { folders: { config: 'settings' } } }).property).toBe('stats')
    })

    it('returns the defaults without a config file and warns nothing', () => {
        const warnings = captureConsole('warn')
        expect(loadConfig({ cwd: tempDir('nera-config-') })).toEqual(defaults())
        expect(warnings()).toEqual([])
    })
})
