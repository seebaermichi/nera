export default [
    {
        ignores: ['node_modules', 'public', 'dist'],
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
        },
        rules: {
            indent: ['error', 4],
        },
    },
];
