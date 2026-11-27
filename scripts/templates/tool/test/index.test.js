import { describe, expect, it } from 'vitest'
import * as entry from '{{package}}'
import manifest from '{{package}}/package.json' with { type: 'json' }
import { version } from '../src/index.js'

describe('{{package}}', () => {
    it('resolves its own name through the exports map to src/index.js', () => {
        expect(entry.version).toBe(version)
    })

    it('reports the version its package.json declares', () => {
        expect(version()).toBe(manifest.version)
        expect(version()).toMatch(/^\d+\.\d+\.\d+/)
    })
})
