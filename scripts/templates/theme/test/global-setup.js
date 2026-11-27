// Build every fixture variant once, before the test files, and hand the
// results to them as inject('builds').
import path from 'node:path'
import { themeGlobalSetup } from '@nera-static/test-utils/theme'
import { VARIANTS } from './variants.js'

export const { setup, teardown } = themeGlobalSetup({
    root: path.resolve(import.meta.dirname, '..'),
    variants: VARIANTS,
})
