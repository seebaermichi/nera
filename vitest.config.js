import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        // Only core's own tests: scripts/templates/ holds the test files of new repos
        // (scripts/new-repo.js), which import @nera-static/test-utils.
        include: ['src/test/**/*.test.js'],
        globals: true,
        environment: 'node',
        coverage: {
            reporter: ['text', 'html']
        }
    }
})
