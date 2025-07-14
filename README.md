# Nera – a lightweight static site generator

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
├── assets/              # CSS, JS, images, fonts – copied to /public
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
├── views/               # Pug templates (layouts and partials)
└── .neraignore          # List of asset files or folders to ignore during render
```

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

## 🎨 Templates (`views/`)

Nera uses [Pug](https://pugjs.org/) for layout rendering. You have access to:

- `app`: values from `config/app.yaml`
- `meta`: metadata from the current markdown page
- `t(key)`: translation function

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

For usage, see [PLUGINS.md](https://github.com/seebaermichi/nera/blob/master/PLUGINS.md).

---

## 📁 Asset Handling

All files in the `assets/` directory will be copied to `/public` during render. You can exclude files using `.neraignore`. Example:

```
ignore.txt
css/dev-only.css
```

Supports nested paths relative to `assets/`.

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
