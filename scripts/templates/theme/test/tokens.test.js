import path from 'node:path'
import { inject } from 'vitest'
import { tokensSuite } from '@nera-static/test-utils/theme'
import { INJECTED, OVERRIDE } from './variants.js'

const builds = inject('builds')

tokensSuite({
    root: path.resolve(import.meta.dirname, '..'),
    defaults: builds.default.public,
    overrides: builds.overrides.public,
    prefix: '--theme',
    override: OVERRIDE,
    injected: INJECTED,
})
