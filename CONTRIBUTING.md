# 🤝 Contributing to Nera

Thanks for your interest in contributing to **Nera**, the lightweight static site generator! 🎉  
This document will help you get started quickly and follow best practices along the way.

---

## 📦 Getting Started

1. **Clone the repository**:

    ```bash
    git clone https://github.com/seebaermichi/nera.git
    cd nera
    ```

2. **Install dependencies**:

    ```bash
    npm install
    ```

3. **Start development server**:

    ```bash
    npm run dev
    ```

This will:

-   Start the Vite dev server
-   Watch & render Markdown content
-   Watch assets for changes

---

## 🧪 Running Tests

We use [Vitest](https://vitest.dev/) for testing.

```bash
npm run test
```

You can also run in watch mode:

```bash
npx vitest watch
```

Please write or update tests if you contribute core functionality.

---

## 🧹 Code Style & Linting

-   ESLint (Flat config) is used for all `.js` files
-   Config lives in `eslint.config.js`
-   Format/lint errors will show on save in supported editors (e.g., VS Code)

To run manually:

```bash
npm run lint
```

---

## 🧩 Plugin Development

Nera supports **npm-based plugins** that allow you to extend and customize the rendering process.

### 🔌 Plugin Basics

A Nera plugin is a simple npm package that exports one or more of the following functions:

-   `getAppData(data)` – modify or enrich the global `app` data (e.g. add a tagCloud or navigation)
-   `getMetaData(data)` – modify or enrich individual page metadata (e.g. add slugs or tag links)
-   `getPagesData(data)` – modify or even _generate_ pages programmatically (e.g. create tag overview pages)

Each function receives a `data` object with:

-   `data.app`: the global app config
-   `data.pagesData`: an array of all pages (`[{ content, meta }]`)
-   `data.meta`: the current page’s metadata (only in `getMetaData`)

Plugins should return modified values, or the original input if unchanged.

### 📦 Installing Plugins

To use a plugin, simply install it via npm:

```bash
npm install @nera-static/plugin-navigation
```

Nera automatically discovers and loads installed packages that follow this naming pattern:

-   `@nera-static/*`

There’s no need to import or configure them manually — they’ll be applied in the order npm resolves them.

### 🧪 Example Plugin: Tags

A plugin like `@nera-static/plugin-tags` might do the following:

-   Add a `tagCloud` to the `app` object using `getAppData`
-   Add `tagLinks` to each tagged page using `getMetaData`
-   Generate overview pages for each tag using `getMetaData` or `getPagesData`

This makes it easy to create dynamic, content-driven pages based on frontmatter metadata.

### 🧱 Plugin Structure

A minimal plugin looks like this:

```js
// index.js
export function getAppData(data) {
    return {
        ...data.app,
        examplePluginEnabled: true,
    }
}
```

A plugin should include:

-   `package.json` with `"type": "module"`
-   Entry file (e.g. `index.js`) exporting the hooks
-   Optional: plugin-specific config files, helper utils, tests

### 🧰 Developing Locally

During development, you have two good options to test plugins with your Nera project:

#### 🗂 Option 1: Place plugin in `src/plugins/`

For quick prototyping, drop the plugin directly into `src/plugins/` inside your Nera project. Nera will auto-load it just like an installed package.

Example:

```
my-nera-project/
├── src/
│   └── plugins/
│       └── my-plugin/
│           └── index.js
```

#### 📦 Option 2: Use `npm install` with local path

For more realistic and reusable development, keep your plugin in a separate directory and install it with a local path:

```bash
npm install ../path/to/your-local-plugin
```

This will treat it like a proper npm package. Any changes require a re-run of `npm install`, or use `npm link` if you want live updates across projects.

Avoid using `"file:"` in `package.json` unless you want to hardcode the path — `npm install ../path/to/plugin` is usually clearer.

---

For examples, see:

-   [@nera-static/plugin-navigation](https://github.com/seebaermichi/nera-plugin-navigation)
-   [@nera-static/plugin-tags](https://github.com/seebaermichi/nera-plugin-tags)

---

## ✅ Pull Request Checklist

Before submitting a PR:

-   [ ] Code compiles and passes all tests
-   [ ] Linting passes (`npm run lint`)
-   [ ] For new features, docs or README are updated
-   [ ] The feature or fix is useful and aligned with Nera’s goals

---

## 🙋 Need Help?

-   Check open [Issues](https://github.com/YOUR_USERNAME/nera/issues)
-   Or open a new issue with questions, feature requests, or bug reports

---

## 📜 Code of Conduct

Please be respectful and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

Happy contributing! ✨
