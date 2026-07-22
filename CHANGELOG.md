# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [4.5.0] - 2026-07-22

### Fixed

-   a `folders` block in `config/app.yaml` now actually takes effect. It was
    merged into the app data, so every plugin read the configured value, but
    the render pipeline kept using the built-in defaults — `run()` destructured
    `settings.folders`, and `index.js` calls `run()` with no argument. Setting
    `folders.assets: ./static` therefore had `@nera-static/plugin-search` write
    its index to `static/`, while the render logged `No Assets found` and
    copied nothing into `public/`: the built site 404'd on an index that
    existed on disk. Any plugin writing into the assets folder had the same
    split
-   a `folders` block naming only some keys no longer blanks the rest. The
    merge replaced the whole object, so `folders: { assets: ./static }` left
    `dist`, `views` and `pages` undefined for anything reading `app.folders`.
    Keys are now merged individually over the defaults
-   `folders.pages` is honoured when the page list is built, not just when it
    is read back

### Changed

-   folders are resolved once, in `loadAppData`, and every later stage reads
    the result from `data.app.folders`. `folders.config` remains the one key
    that can only come from the caller — app.yaml is found through it

### Added

-   tests covering per-key merging, the configured pages folder, and that
    app.yaml cannot redirect the config folder it was itself read from


## [4.4.1] - 2026-07-21

### Fixed

-   installed `@nera-static/*` plugins are now discovered from the project
    being built (`process.cwd()`) rather than from a path resolved relative
    to `src/setup-plugins.js`. Every other lookup in the pipeline is already
    cwd-relative — `config/plugin-order.yaml`, and core's `./config`,
    `./pages`, `./views` — so plugin discovery was the one place that ignored
    the working directory. Rendering a site is unaffected, since `npm run
    render` runs from the project root and both paths resolve to the same
    directory; what it fixes is any tooling that points cwd at another
    project, which previously kept loading the wrong dependency list

### Added

-   a regression test covering the above. This repo declares no
    `@nera-static` dependencies of its own, so the defect was invisible to
    the suite until a fixture project declared one


## [4.4.0] - 2026-07-21

### Changed

-   minimum supported Node raised from 18 to 20; Node 18 reached
    end-of-life on 2025-04-30 and the dev toolchain (vitest 4, vite 8,
    eslint 10) requires Node 20+
-   CI matrix now tests Node 20 and 22 (dropped 18)


## [4.3.0] - 2026-07-19

### Fixed

-   plugin hooks are now awaited, so an async `getAppData` no longer
    replaces the entire app config with a Promise
-   pug templates now compile with `basedir` set, so absolute
    `include /vendor/...` paths work as documented by plugins
-   `meta.fullPath` and `meta.href` are derived consistently, so pages
    whose path contains `.md` mid-string no longer render to a location
    their links do not point at
-   path separators are normalised, fixing URLs on Windows


## [4.2.2] - 2025-08-02

### Changed
  - move test folder into src



## [4.2.1] - 2025-07-25

### Changed
  - loadAppData() now loads appConfig.folders into the app data


## [4.2.0] - 2025-07-23

### Added

- Plugin execution order control via `config/plugin-order.yaml`
- Support for `start` and `end` plugin groups with flexible ordering logic
- Alphabetical fallback sorting for unspecified plugins

### Changed

- Internal plugin orchestration updated to allow manual ordering
- `setup-plugins.js` fully rewritten for clarity and flexibility

### Technical

- Improved test coverage for plugin ordering edge cases
- Updated test suite to isolate and verify execution sequences


## [4.1.0] - 2025-07-19

### Added

-   Enhanced error handling in `core.js` with detailed logging and graceful failure recovery
-   Performance optimizations for plugin loading with parallel execution
-   Comprehensive logging system with emoji indicators for better developer experience
-   File existence checks before processing to prevent unnecessary errors
-   Plugin loading performance monitoring with timing information
-   Improved test coverage for error scenarios

### Changed

-   Plugin loading now executes in parallel instead of sequentially for better performance
-   `getPagesData()` now skips corrupted files instead of including them with empty content
-   `loadAppData()` provides better fallback handling for missing configuration files
-   Plugin data merging now uses full object replacement for consistency with meta data handling

### Fixed

-   `link-attributes` plugin now correctly uses `getMetaData` instead of `getAppData`
-   `popular-content` plugin now returns complete app data object instead of partial data
-   File stat errors no longer crash the build process
-   Missing directories are handled gracefully without terminating the build

### Technical

-   Added comprehensive test coverage for new error handling scenarios
-   Improved test isolation and safety measures
-   Enhanced plugin architecture consistency across all plugins


## [4.0.1] - 2025-07-19

### Fixed

-   HTML page is only created if layout property exists in frontmatter

### Security

-   Updated outdated and deprecated packages
-   Replaced deprecated dependencies with modern alternatives

### Changed

-   Migrated from deprecated ESLint configuration to flat config
-   Updated build tools and development dependencies


## [4.0.0] - 2025-07-15

### Breaking Changes

-   Major dependency updates with potential breaking changes
-   Updated minimum Node.js version requirements

### Added

-   Modern ESLint flat configuration
-   Updated Vite build system
-   Improved development tooling

### Security

-   Fixed multiple security vulnerabilities
-   Updated all dependencies to latest secure versions


## [3.2.0] - 2021-10-29

### Security

-   Updated packages and fixed vulnerabilities
-   Resolved multiple npm audit issues


## [3.0.0] - 2021-01-25

### Added

-   **Translation Support**: Multi-language site capabilities
-   **Canonical Links Plugin**: SEO improvements with canonical URL support
-   Plugin documentation and guides

### Changed

-   Enhanced configuration system for internationalization
-   Updated layout templates for translation support


## [2.0.0] - 2019-11-15

### Breaking Changes

-   **Complete Refactor**: Moved to functional programming paradigm
-   Restructured core architecture

### Added

-   Modular plugin system (`setup-plugins.js`)
-   Functional core components (`core.js`, `render.js`)
-   Improved separation of concerns

### Changed

-   Plugin API redesigned for better extensibility
-   Core functionality split into focused modules


## [1.x] - 2019 and earlier

### Initial Development

-   Basic static site generation
-   Markdown to HTML conversion
-   Pug template support
-   Plugin system foundation
-   Main navigation features
-   Asset copying and management
-   Basic SEO features (meta descriptions, keywords)
-   Sub-navigation support

[4.2.1]: https://github.com/seebaermichi/nera/compare/v4.2.0...v4.2.1
