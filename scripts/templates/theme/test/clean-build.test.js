import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'vitest'
import { expectCleanBuild, STRICT_VALIDATE } from '@nera-static/test-utils'
import { mirrorFixture } from '@nera-static/test-utils/theme'

const root = path.resolve(import.meta.dirname, '..')

describe('the fixture site on this theme', () => {
    it('builds, checks and validates clean with every output rule at error', async () => {
        const { site } = mirrorFixture({
            root,
            name: 'strict',
            mutate: (dir) => fs.writeFileSync(path.join(dir, 'config/validate.yaml'), STRICT_VALIDATE),
        })
        await expectCleanBuild(site, { root })
    })
})
