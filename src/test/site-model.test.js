import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { resolveSiteModel } from '../site-model.js'

// resolveSiteModel is cwd-parameterised on purpose — no chdir here. It must
// return the same folders/roots the build uses, and must NOT throw on a broken
// site (it reports appConfigError/themeError for the validator to surface).

let cwd

beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'nera-sitemodel-'))
    await fs.mkdir(path.join(cwd, 'config'), { recursive: true })
})

afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true })
})

const writeApp = (yaml) => fs.writeFile(path.join(cwd, 'config', 'app.yaml'), yaml)

describe('resolveSiteModel', () => {
    it('points views at theme/ and yields a single root when no theme package is set', async () => {
        await writeApp('name: Probe\nlang: en\n')
        await fs.mkdir(path.join(cwd, 'theme', 'views'), { recursive: true })

        const model = resolveSiteModel({ cwd })

        expect(model.folders.views).toBe('./theme/views')
        expect(model.viewsRoot).toBe(path.join(cwd, 'theme', 'views'))
        expect(model.roots).toEqual([path.join(cwd, 'theme', 'views')])
        expect(model.theme).toBeNull()
        expect(model.themeError).toBeNull()
    })

    it('falls back to the legacy root views/ without warning', async () => {
        await writeApp('name: Probe\n')

        const model = resolveSiteModel({ cwd })

        expect(model.folders.views).toBe('./views')
        expect(model.viewsRoot).toBe(path.join(cwd, 'views'))
    })

    it('honours an explicit folders block in app.yaml', async () => {
        await writeApp('name: Probe\nfolders:\n  views: ./custom-views\n')

        const model = resolveSiteModel({ cwd })

        expect(model.folders.views).toBe('./custom-views')
        expect(model.viewsRoot).toBe(path.join(cwd, 'custom-views'))
    })

    it('resolves a local theme and layers its views after the site', async () => {
        await writeApp('name: Probe\ntheme: ./my-theme\n')
        await fs.mkdir(path.join(cwd, 'theme', 'views'), { recursive: true })
        await fs.mkdir(path.join(cwd, 'my-theme', 'views'), { recursive: true })

        const model = resolveSiteModel({ cwd })

        expect(model.theme).not.toBeNull()
        expect(model.themeError).toBeNull()
        expect(model.roots).toEqual([
            path.join(cwd, 'theme', 'views'),
            path.join(cwd, 'my-theme', 'views'),
        ])
    })

    it('captures an unresolvable theme as themeError instead of throwing', async () => {
        await writeApp('name: Probe\ntheme: ./missing-theme\n')

        const model = resolveSiteModel({ cwd })

        expect(model.theme).toBeNull()
        expect(model.themeError).toEqual(expect.stringContaining('missing-theme'))
        // Still yields a usable single-root chain for the rest of validation.
        expect(model.roots).toHaveLength(1)
    })

    it('captures a malformed app.yaml as appConfigError instead of throwing', async () => {
        await writeApp('name: [unterminated\n')

        const model = resolveSiteModel({ cwd })

        expect(model.appConfigError).toBeTruthy()
        // Degrades to defaults rather than aborting.
        expect(model.folders.views).toBe('./views')
    })

    it('treats a site with no app.yaml as empty config', async () => {
        const model = resolveSiteModel({ cwd })

        expect(model.appConfigError).toBeNull()
        expect(model.appConfig).toEqual({})
        expect(model.roots).toHaveLength(1)
    })
})
