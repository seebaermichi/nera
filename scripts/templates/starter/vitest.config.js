import { neraConfig } from '@nera-static/test-utils/vitest'

export default neraConfig({
    // every test scaffolds and builds a site with the real CLI
    testTimeout: 120000,
    hookTimeout: 120000,
})
