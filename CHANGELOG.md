# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[4.1.0]: https://github.com/seebaermichi/nera/compare/v4.0.1...v4.1.0
