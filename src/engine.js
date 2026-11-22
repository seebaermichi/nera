import pug from 'pug'
import { makeLayeredResolver } from './resolve.js'

// The template-engine seam (PUG-STRATEGY.md Track B0): the only module in core
// that talks to Pug. The render loop asks it to compile a layout and gets back
// a plain `fn(data) → html`; everything around that call — finding the layout
// (`resolveEntry`), caching compiled layouts, `t()`/`url()`, URL rewriting and
// formatting — stays engine-agnostic in render.js. A second engine would slot
// in here without touching the render loop.

// The file extension of the engine's templates, for tooling that lists or
// names layout files.
export const templateExtension = '.pug'

// The layered `resolve` plugin per chain of view roots, so a build that compiles
// several layouts against the same `roots` array builds the resolver once, not
// once per layout. Keyed weakly: a finished build's chain is collected with it.
const resolvePlugins = new WeakMap()

const layeredPlugins = (roots) => {
    let plugins = resolvePlugins.get(roots)
    if (!plugins) {
        plugins = [{ resolve: makeLayeredResolver(roots) }]
        resolvePlugins.set(roots, plugins)
    }
    return plugins
}

// Compile the layout at `entry` into a template function `fn(data) → html`.
// `roots` is the ordered chain of view roots (site first, theme second);
// basedir-absolute includes (`/vendor/x.pug`) resolve against `roots[0]`. A
// single root means no theme: Pug gets `{ basedir }` alone, no resolve plugin,
// exactly as core compiled before the seam. More than one root attaches the
// layered resolver, so an include falls through from the site to the theme.
export const compileLayout = (entry, { roots }) => {
    const options = roots.length > 1
        ? { basedir: roots[0], plugins: layeredPlugins(roots) }
        : { basedir: roots[0] }
    return pug.compileFile(entry, options)
}
