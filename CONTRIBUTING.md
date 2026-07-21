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

A Nera plugin is a simple npm package that exports one or both of the following functions:

-   `getAppData(data)` – modify or enrich the global `app` data (e.g. add a tagCloud or navigation). **Must return a plain object.**
-   `getMetaData(data)` – modify or enrich page metadata, and optionally _generate_ pages by returning additional entries (e.g. tag overview pages). **Must return an array.**

These are the only two hooks. Any other exported function is ignored.

Each function receives a `data` object with exactly:

-   `data.app`: the global app config
-   `data.pagesData`: an array of all pages (`[{ content, meta }]`)

`getAppData` runs first, and `getMetaData` then sees the `app` it returned.

Return the **whole** value, not a fragment — `getAppData` must spread the
incoming app (`{ ...data.app, myKey }`), or every other plugin's data is
discarded. If a hook returns the wrong type it is skipped with a console
warning and the build continues, so a plugin that "does nothing" is usually a
return-type problem — check the console.

Write hooks **synchronously**. Both hooks are awaited as of generator 4.3.0,
but the generator is distributed by clone, so an `async` hook breaks any site
running an older copy.

### 📦 Installing Plugins

To use a plugin, simply install it via npm:

```bash
npm install @nera-static/plugin-navigation
```

Nera discovers plugins from two places:

-   any dependency in the generator's `package.json` named `@nera-static/*`
-   local directories under `src/plugins/*/index.js`

There’s no need to import them manually. They run in this order:

1. names listed under `start:` in `config/plugin-order.yaml`
2. everything else, alphabetically
3. names listed under `end:`

Order matters when one plugin consumes data another produces — `plugin-search`,
for example, should run last so it indexes pages other plugins have generated.

### 🧪 Example Plugin: Tags

A plugin like `@nera-static/plugin-tags` might do the following:

-   Add a `tagCloud` to the `app` object using `getAppData`
-   Add `tagLinks` to each tagged page using `getMetaData`
-   Generate an overview page per tag by returning them alongside the authored
    pages from `getMetaData` (`return [...authoredPages, ...tagPages]`)

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
