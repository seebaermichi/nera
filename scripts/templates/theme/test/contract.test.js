import path from 'node:path'
import { contractSuite } from '@nera-static/test-utils/theme'

// The theme's contract: what a site may rely on. Renaming or removing any of
// it is a major release.
contractSuite({
    root: path.resolve(import.meta.dirname, '..'),
    views: ['layouts/layout.pug', 'partials/helpers.pug', 'partials/tokens.pug'],
    seams: ['partials/head-extra.pug', 'partials/footer-extra.pug'],
    pageTypes: ['pages/default.pug'],
    blocks: ['head', 'main', 'footer'],
    helpers: ['pageLang'],
    globals: ['neraTheme'],
    keys: ['tokens'],
    tokens: { color: ['bg', 'text', 'accent'], font: ['body'] },
    tKeys: ['Skip to content'],
    classes: ['skip-link', 'site-main', 'site-footer', 'page'],
})
