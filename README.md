# Nera – a lightweight static site generator

[![Test](https://github.com/seebaermichi/nera/actions/workflows/test.yml/badge.svg)](https://github.com/seebaermichi/nera/actions/workflows/test.yml)

**Nera** is a minimal static site generator that transforms Markdown content into fast, clean HTML pages using [Pug](https://pugjs.org/) templates. It is designed to be simple to use, yet extendable with plugins.

> ⚠️ This project is under active development. Breaking changes may occur.

---

## 🚀 Getting Started

```bash
npm install -g @nera-static/installer

# Create a new project
nera new my-nera-site

cd my-nera-site
npm run dev        # Start dev server with live reload
npm run render     # Render the static site to /public
```

Alternatively, clone manually:

```bash
git clone git@github.com:seebaermichi/nera.git
cd nera
rm -fr .git
npm install
npm run dev
```

---

## 🗂️ Directory Structure

```bash
my-nera-site/
├── config/
│   └── app.yaml         # Global site config (name, lang, translations, etc.)
├── pages/               # Markdown content with frontmatter metadata
├── public/              # Rendered static site output
├── src/
│   ├── plugins/         # Local plugins (optional)
│   ├── core.js
│   ├── index.js
│   ├── render.js
│   └── setup-plugins.js
├── theme/               # Your site's presentation (layered over an installed theme)
│   ├── assets/          # CSS, JS, images, fonts – copied to /public
│   └── views/           # Pug templates (layouts and partials)
└── .neraignore          # List of asset files or folders to ignore during render
```

> **Presentation lives under `theme/`.** Your site's `theme/views/` and
> `theme/assets/` are yours to edit; if you also set `theme: <name>` in
> `config/app.yaml`, an installed theme package is layered *under* them and your
> files override it per file. Sites created before this layout keep their
> `views/`/`assets/` at the project root — that still works (with a deprecation
> warning), but move them to `theme/views/` and `theme/assets/` when you can.

---

## 📄 Page Content (`pages/`)

Each Markdown file must define frontmatter metadata, e.g.:

```markdown
---
layout: pages/default.pug
title: Homepage
---
# Welcome to Nera

This content will be injected into the layout file defined above.
```

> All frontmatter values are accessible as the `meta` object in your Pug templates.

---

## 🎨 Templates (`theme/views/`)

Nera uses [Pug](https://pugjs.org/) for layout rendering. You have access to:

- `app`: values from `config/app.yaml`
- `meta`: metadata from the current markdown page
- `t(key)`: translation function
- `url(path)`: prefixes a root-absolute path with the site's `base_path` (see
  [Deploying to a subdirectory](#-deploying-to-a-subdirectory-base_path)); a
  no-op when `base_path` is unset

Example:

```pug
doctype html
html(lang=app.lang)
  head
    title= meta.title
    meta(name="description", content=meta.description || t('app_description'))
  body
    h1= meta.title
    != content
```

---

## 🌍 Translations

You can define translations in `config/app.yaml`:

```yaml
lang: en
translations:
  en:
    app_description: Nera is a simple static site generator.
  de:
    app_description: Nera ist ein einfacher Generator für statische Webseiten.
```

Use the `t` function in templates:

```pug
meta(name="description", content=t('app_description'))
```

---

## 📁 Deploying to a subdirectory (`base_path`)

By default Nera writes root-absolute URLs (`/css/main.css`, `/about.html`), which
assume the site is served from a domain root. When it is served from a
**subdirectory** instead — most commonly a GitHub **project** Pages site at
`https://<user>.github.io/<repo>/` — those URLs resolve against the domain root
and 404.

Set `base_path` in `config/app.yaml` to the subdirectory:

```yaml
base_path: /my-repo
```

Nera then prefixes every root-absolute URL in the built output with it — links,
`<script>`/`<link>`/`<img>` sources, `srcset`, CSS `url(…)`, the web app
manifest, and `href`/`url` values in JSON assets such as the search index. The
physical output layout is unchanged (files still land at the artifact root, which
*is* the served subdirectory), and `meta.href` stays in the site's logical
(un-prefixed) namespace so template URL logic keeps working.

It is fully additive: with no `base_path` (or `base_path: ''`) the build is
byte-identical to before. Remove it when you move the site to a domain root (e.g.
a custom domain).

For **absolute** URLs you build yourself (canonical/OpenGraph tags, a sitemap),
set the relevant plugin's origin to include the subdirectory, or wrap a hardcoded
path in the `url()` helper:

```pug
link(rel="preload", as="font", href=url('/fonts/body.woff2'))
```

If the key or language is missing, the key itself is returned as fallback.

---

## 🔌 Plugins

Nera supports plugins that can:

- Add data to the app or individual pages
- Modify metadata
- Inject routes or components
- Extend rendering logic

You can place local plugins in `src/plugins/` or install official ones via npm:

```bash
npm install @nera-static/plugin-navigation
```

For a complete list of existing plugins, see [PLUGINS.md](https://github.com/seebaermichi/nera/blob/main/PLUGINS.md).

### ⚙️ Plugin Execution Order

To control the **execution order** of plugins, you can define a `config/plugin-order.yaml` file like this:

```yaml
plugin-order:
  - start:
      - plugin-tags
  - end:
      - plugin-search
```

- `start`: plugins listed here will run first (in the order listed).
- `end`: plugins listed here will run last (in the order listed).
- Any other plugins not listed will be placed in the middle, sorted alphabetically.

This is especially useful when some plugins (like `plugin-search`) rely on metadata added by earlier ones.

---

## 📁 Asset Handling

All files in the `theme/assets/` directory will be copied to `/public` during render. You can exclude files using a `.neraignore` at the project root. Example:

```
ignore.txt
css/dev-only.css
```

Supports nested paths relative to `theme/assets/`.

---

## 🛠 Development Scripts

```bash
npm run dev     # Starts local development server
npm run render  # Renders pages to /public
npm start       # Shortcut for dev mode
```

---

## 📚 Further Reading

- [How Nera is used to build its own website](https://medium.com/@micha.becker79/building-nera-website-with-nera-4b50ed5dbff2)

---
