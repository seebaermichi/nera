import { neraConfig } from '@nera-static/test-utils/vitest'

export default neraConfig({
    // the fixture variants are built once, with the real CLI, before the test files
    globalSetup: ['test/global-setup.js'],
})
