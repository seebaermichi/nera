# {{package}}

[![Test](https://github.com/seebaermichi/{{name}}/actions/workflows/test.yml/badge.svg)](https://github.com/seebaermichi/{{name}}/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/{{package}})](https://www.npmjs.com/package/{{package}})

{{description}}

<!-- One paragraph: "A plugin for the [Nera](https://github.com/seebaermichi/nera) static site generator that …" -->

## ✨ Features

-   Adds `app.{{short}}`, the number of rendered pages.
-   Adds `meta.{{short}}` to every page, with the page's language.

## 🚀 Installation

```bash
nera add {{short}}
```

`nera add` installs the package and copies `config/{{short}}.yaml` into your site. By hand:

```bash
npm install {{package}}
```

Nera detects the plugin during `nera build`.

## 🧩 Usage

```pug
p #{app['{{short}}'].pages} pages
p Language: #{meta['{{short}}'].lang}
```

## ⚙️ Configuration

Every key is optional; without `config/{{short}}.yaml` the defaults apply.

| Key | Default | Meaning |
| --- | --- | --- |
| `property` | `{{short}}` | The key the plugin writes under: `app.<property>` and `meta.<property>` |

```yaml
# config/{{short}}.yaml
property: '{{short}}'
```

## 📊 Generated Output

```js
app['{{short}}'] = { pages: 2 }
page.meta['{{short}}'] = { lang: 'en' }
```

## ⚠️ Warnings

A bad value or an unknown key in `config/{{short}}.yaml` prints one line and keeps the default:

```text
⚠️ plugin-{{short}}: config/{{short}}.yaml: invalid property 42, using "{{short}}"
⚠️ plugin-{{short}}: config/{{short}}.yaml: ignoring unknown key "propery"
```

## 🧩 Compatibility

-   `@nera-static/core` 4.x
-   Node.js 22.12.0 or later

## 🧪 Development

```bash
npm install
npx vitest run
npm run lint
```

`npm run test:watch` runs Vitest in watch mode. `npm run lint` runs [`nera-stan`](https://www.npmjs.com/package/@nera-static/stan), the Nera style check.

## 🤝 Contributing

See the [Nera contributing guide](https://github.com/seebaermichi/nera/blob/main/CONTRIBUTING.md) and the [style guide](https://nera.js.org/docs/style-guide/).

## 📦 License

MIT, see [LICENSE](LICENSE).
