# {{package}}

[![Test](https://github.com/seebaermichi/{{name}}/actions/workflows/test.yml/badge.svg)](https://github.com/seebaermichi/{{name}}/actions/workflows/test.yml)
[![npm version](https://img.shields.io/npm/v/{{package}})](https://www.npmjs.com/package/{{package}})

{{description}}

<!-- One paragraph: "A ready-to-edit … for the [Nera](https://github.com/seebaermichi/nera) static site generator, on @nera-static/theme-…" -->

## Usage

```bash
npx @nera-static/nera new my-site --starter {{short}}
```

## What you get

-   A home page, an imprint and a privacy page in `pages/`
-   One layout in `theme/views/`, with a skip link and the legal links in its footer

## Requirements

-   `@nera-static/nera` 1.30.0 or later
-   Node.js 22.12.0 or later

## License

MIT, see [LICENSE](LICENSE).

## First steps

1.  Set your site's `name` and `origin` in `config/app.yaml`.
2.  Write your imprint in `pages/imprint.md` and your privacy policy in `pages/privacy.md`.
3.  Replace the home page in `pages/index.md` with your own.
