import fs from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, it } from 'vitest'
import { expectCleanBuild, scaffoldStarter, STRICT_VALIDATE } from '@nera-static/test-utils'

const ROOT = path.resolve(import.meta.dirname, '..')

let site

beforeAll(async () => {
    site = await scaffoldStarter(ROOT, 'site')
})

describe('nera new --starter <this repo>', () => {
    it('scaffolds a site that builds, checks and validates clean', async () => {
        await expectCleanBuild(site)
    })

    it('stays clean with every output rule at error', async () => {
        fs.writeFileSync(path.join(site, 'config/validate.yaml'), STRICT_VALIDATE)
        await expectCleanBuild(site)
    })
})
