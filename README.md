# filebrowser-electron

***ONLY VERY MINIMALLY FUNCTIONAL***

This aims to be a cross-platform and enhanced substitute for the
desktop file browser.

## Install

```bash
npm i filebrowser-electron
cd filebrowser-electron && npm install && npm start
```

## To-dos

1. Build/set icon:
    <https://stackoverflow.com/questions/31529772/how-to-set-app-icon-for-electron-atom-shell-app>
1. Allow integration with Open-with (and thus file handler web apps)
1. Design in such a way that privileged APIs could work if WebExtensions
    allowed overriding browser's `file:///` browser (not only for
    directories, but also to allow injecting a button to allow editing
    browsed files as well)
