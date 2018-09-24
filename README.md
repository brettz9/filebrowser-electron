# filebrowser-electron

***NOT YET FUNCTIONAL***

This aims to be a cross-platform and enhanced substitute for the
desktop file browser.

## Install

```bash
npm i filebrowser-electron  
cd filebrowser-electron && npm install && npm start
```

## To-dos

1. Allow [column browser](https://github.com/brettz9/miller-columns)
1. Allow integration with WebAppFind/Open-with (and AtYourCommand,
    ExecutableBuilder, and AsYouWish)
1. Design in such a way that privileged APIs could work if WebExtensions
    allowed overriding browser's `file:///` browser (not only for
    directories, but also to allow injecting a button to allow editing
    browsed files as well)
