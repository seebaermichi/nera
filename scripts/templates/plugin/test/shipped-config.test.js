import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadYaml } from '@nera-static/test-utils'
import { defaults, normalizeConfig } from '../src/config.js'

const shipped = fileURLToPath(new URL('../config/{{short}}.yaml', import.meta.url))

describe('config/{{short}}.yaml', () => {
    it('lists every key with its default', () => {
        expect(loadYaml(shipped)).toEqual(defaults())
    })

    it('reads without a warning', () => {
        const warnings = []
        normalizeConfig(loadYaml(shipped), { warn: (msg) => warnings.push(msg) })
        expect(warnings).toEqual([])
    })
})
