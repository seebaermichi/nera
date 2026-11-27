export default [
    {
        // scripts/templates/ holds the files of new repos (scripts/new-repo.js), written
        // for nera-stan; its eslint.config.js imports @nera-static/stan, which core lacks.
        ignores: ['node_modules', 'public', 'dist', 'scripts/templates'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            indent: ['error', 4],
            semi: ['error', 'never'],
            quotes: ['error', 'single'],
            'no-unused-vars': ['warn'],
        },
    },
]