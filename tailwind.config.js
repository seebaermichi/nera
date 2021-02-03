module.exports = {
    purge: [],
    darkMode: false, // or 'media' or 'class'
    theme: {
        extend: {}
    },
    variants: {
        extend: {
            display: ['group-hover'],
            inset: ['group-hover']
        }
    },
    plugins: [
        require('@tailwindcss/forms')
    ]
}
