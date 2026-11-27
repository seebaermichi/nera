# {{package}}

[![Test](https://github.com/seebaermichi/{{name}}/actions/workflows/test.yml/badge.svg)](https://github.com/seebaermichi/{{name}}/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/{{package}})](https://www.npmjs.com/package/{{package}})

{{description}}

<!-- One paragraph: "A theme for the [Nera](https://github.com/seebaermichi/nera) static site generator that …" -->

## 🚀 Installation

```bash
npm install {{package}}
```

Then name it in your site's `config/app.yaml`:

```yaml
theme: '{{package}}'
```

## 🧩 Usage

Every page names a page type of the theme as its layout:

```markdown
---
layout: pages/default.pug
title: About
---
```

| Page type | For |
| --- | --- |
| `pages/default.pug` | any standard page |

A site overrides any file of the theme with a file of the same path in its own `theme/views/` or `theme/assets/`.

## ⚙️ Configuration

The theme's colours and fonts are design tokens. Set any of them in your site's `config/theme.yaml`; the others keep their defaults:

```yaml
tokens:
    color:
        accent: '#006400'
```

| Token | Custom property | Default |
| --- | --- | --- |
| `color.bg` | `--theme-color-bg` | `#ffffff` |
| `color.text` | `--theme-color-text` | `#1b1b1f` |
| `color.accent` | `--theme-color-accent` | `#0b57d0` |
| `font.body` | `--theme-font-body` | `system-ui, sans-serif` |

## 🧵 Seams

A seam is an empty partial a site fills with a file of the same path in its own `theme/views/`.

| Seam | Renders |
| --- | --- |
| `partials/head-extra.pug` | at the end of `<head>` |
| `partials/footer-extra.pug` | inside `footer.site-footer` |

## 🧰 Contract functions

`pageLang(page)` returns the page's language, else the site's, else `en`. A site's own views may call it.

## 🧩 Compatibility

-   `@nera-static/core` 4.15.0 or later (`nera.generator` in `package.json`)
-   Node.js 22.12.0 or later

## 🧪 Development

```bash
npm install
npx vitest run
npm run lint
```

The tests build the fixture site in `test/site/` with the installed `nera` CLI. `npm run lint` runs [`nera-stan`](https://www.npmjs.com/package/@nera-static/stan), the Nera style check.

## 🤝 Contributing

See the [Nera contributing guide](https://github.com/seebaermichi/nera/blob/main/CONTRIBUTING.md) and the [style guide](https://nera.js.org/docs/style-guide/).

## 📦 License

MIT, see [LICENSE](LICENSE).
