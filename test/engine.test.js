import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import pug from 'pug'
import { tempDir } from '@nera-static/test-utils'
import { compileLayout, templateExtension } from '../src/engine.js'

// The engine seam (PUG-STRATEGY.md B0): compileLayout must compile exactly as
// render.js did before the seam — `{ basedir }` alone without a theme, the
// layered resolve plugin with one.

let root, siteViews, themeViews

beforeEach(async () => {
    root = tempDir('nera-engine-')
    siteViews = path.join(root, 'site', 'views')
    themeViews = path.join(root, 'theme-pkg', 'views')
    await fs.mkdir(path.join(siteViews, 'partials'), { recursive: true })
    await fs.mkdir(path.join(themeViews, 'partials'), { recursive: true })
})

afterEach(() => {
    vi.restoreAllMocks()
})

const write = (p, source) => fs.writeFile(p, source)

describe('templateExtension', () => {
    it('names the Pug file extension', () => {
        expect(templateExtension).toBe('.pug')
    })
})

describe('compileLayout', () => {
    it('compiles a single-root layout into a template function', async () => {
        const entry = path.join(siteViews, 'layout.pug')
        await write(entry, 'p= title\n')

        const fn = compileLayout(entry, { roots: [siteViews] })

        expect(fn({ title: 'Hello' })).toBe('<p>Hello</p>')
    })

    it('passes Pug only `basedir` when there is a single root', async () => {
        const entry = path.join(siteViews, 'layout.pug')
        await write(entry, 'p x\n')
        const spy = vi.spyOn(pug, 'compileFile')

        compileLayout(entry, { roots: [siteViews] })

        expect(spy).toHaveBeenCalledTimes(1)
        const [file, options] = spy.mock.calls[0]
        expect(file).toBe(entry)
        // Pug itself adds `filename` to the options object it is given.
        expect(Object.keys(options).sort()).toEqual(['basedir', 'filename'])
        expect(options.basedir).toBe(siteViews)
    })

    it('resolves a basedir-absolute include against the first root', async () => {
        await write(path.join(siteViews, 'partials', 'head.pug'), 'p head\n')
        const entry = path.join(siteViews, 'layout.pug')
        await write(entry, 'include /partials/head.pug\n')

        const fn = compileLayout(entry, { roots: [siteViews] })

        expect(fn({})).toBe('<p>head</p>')
    })

    it('lets the site override a theme include and falls through to the theme otherwise', async () => {
        await write(path.join(siteViews, 'partials', 'head.pug'), 'p site head\n')
        await write(path.join(themeViews, 'partials', 'head.pug'), 'p theme head\n')
        await write(path.join(themeViews, 'partials', 'foot.pug'), 'p theme foot\n')
        const entry = path.join(themeViews, 'layout.pug')
        await write(
            entry,
            'include partials/head.pug\ninclude /partials/foot.pug\n',
        )

        const fn = compileLayout(entry, { roots: [siteViews, themeViews] })

        expect(fn({})).toBe('<p>site head</p><p>theme foot</p>')
    })

    it('builds the layered resolver once per chain of roots', async () => {
        const a = path.join(themeViews, 'a.pug')
        const b = path.join(themeViews, 'b.pug')
        await write(a, 'p a\n')
        await write(b, 'p b\n')
        const roots = [siteViews, themeViews]
        const spy = vi.spyOn(pug, 'compileFile')

        compileLayout(a, { roots })
        compileLayout(b, { roots })
        compileLayout(a, { roots: [siteViews, themeViews] })

        const [first, second, other] = spy.mock.calls.map(([, o]) => o.plugins)
        expect(first).toHaveLength(1)
        expect(typeof first[0].resolve).toBe('function')
        expect(second).toBe(first)
        expect(other).not.toBe(first)
    })

    it('names the missing include in its error', async () => {
        const entry = path.join(siteViews, 'layout.pug')
        await write(entry, 'include /partials/missing.pug\n')

        expect(() => compileLayout(entry, { roots: [siteViews] })).toThrow(
            path.join(siteViews, 'partials', 'missing.pug'),
        )
    })
})
