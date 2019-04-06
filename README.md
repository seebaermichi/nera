# Nera - a lightweight static site generator
Nera is a really simple static site generator. It creates static html files out of  
Markdown files.

## Get started
> Make sure you run at least Node version 10.2 on your system

```bash
git clone git@bitbucket.org:michab/static.schneckenmuehle.de.git

# Install dependencies
npm install

# Run local server
npm run serve

# Render the static files
npm run render
```

## Directory structure
```
|-- assets
|-- config
    |-- app.yaml
|-- pages
|-- views
```

### Assets
Are all CSS and JavaScript files which are used on your website. During the render process all assets are copied to the `public` directory.

### Config
Here you can define global settings for your website. All the global settings should got to the `config/app.yaml`. Like lang, name, etc.

### Pages
Within the pages directory you add the Markdown files which actually include the content of your page. Find more information about the Markdown files below.

### Views
In the views directory you put all the layout files. We use [pug](https://pugjs.org/api/getting-started.html) as a templating framework.

## Page Markdown files
Each Markdown file which includes the content of a dedicated webpage needs to have some settings in the head. See an example below:
```
---
layout: pages/default.pug
title: Homepage
---
# Content
Content goes here...
````
