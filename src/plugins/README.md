# Plugins for nera
To enhance the functionality of nera you can create your own plugin.  

## Get started
Start with creating a folder with the name of your plugin, like `main-navigation`.  
Include at least an `index.js` which will include the functionality of your  
plugin.  

### The mandatory `index.js` file
This is how the `index.js` file of the main navigation plugin looks like.
```javascript
const Plugin = require('../../plugin')

class MainNavigation extends Plugin {
    constructor() {
        super(`${__dirname}/config/main-navigation.yaml`)
    }

    addAppData(data) {
        if (data !== null && typeof data === 'object') {
            return Object.assign({}, data, {
                mainNav: this.configData
            })
        }

        return data
    }
}

module.exports = new MainNavigation()
```
> Note: You must always extend your plugin from the `Plugin` class.

### The optional config file
In the main navigation plugin we add a `main-naviagation.yaml` file to the  
`config` folder. It looks like follows:
```yaml
activeClass: 'current'
activePathClass: 'current-path'
elements:
  - href: /index.html
    name: Home
  - href: /sub-pages-first-group/page-one.html
    name: First page one
  - href: /sub-pages-second-group/page-two.html
    name: Second page one
```
And defines which css classes will be used and which elements actually exist in  
the main navigation.

### The optional view file(s)
Like for the main navigation you might want to add also a view file. In our case  
the `main-navigation.pug` file. It defines how the main navigation should be  
rendered and looks like this.
```pug
nav
  each item, index in app.mainNav.elements
    - const currentClass = item.href.includes(meta.htmlPathName) ? app.mainNav.activeClass : ''
    - const currentPathClass = currentClass === '' && meta.pagePathName !== '' && item.href.includes(meta.pagePathName) ? app.mainNav.activePathClass : ''

    if index !== 0
      | &nbsp;|&nbsp;
    a(href=item.href, class=`${currentClass}${currentPathClass}`) #{ item.name }

```
> This view file can be included in your layout file or where ever you need it.

## Directory and files of a plugin
```
|-- plugins/
    |-- my-plugin
        |-- config/
            |-- my-plugin.yaml
        |-- views
            |-- my-plugin.pug
        |-- index.js
    |-- plugin.js
```
