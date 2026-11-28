import { neraConfig } from '@nera-static/test-utils/vitest'

// The canonical include (`test/**/*.test.js`) is anchored at the repo root, so the
// test files under scripts/templates/*/test/ stay out: they are the tests of new
// repos (scripts/new-repo.js) and import @nera-static/test-utils as their own repo.
export default neraConfig()
