# Sub navigation
## Plugin for [nera](https://github.com/seebaermichi/nera) static site generator
This is a small plugin, which enables a simple sub navigation.

It puts links of sibling pages in the same directory in an array and pushes  
it into the main meta object. After this they can be rendered on each page.

It's also possible to customize what should be rendered in the sub navigation  
by just adding the elements of the sub nav into the meta data of the page.
```markdown
---
...
subNav:
    elements:
        - name: Google
          href: https://www.google.com
        - name: Tesla
          href: https://www.tesla.com
---
```
> No there won't be links to the siblings, but links to Google and Apple
