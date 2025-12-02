# filebrowser-electron

***ONLY VERY MINIMALLY FUNCTIONAL***

This aims to be a cross-platform and enhanced substitute for the
desktop file browser.

![screenshot](images/screenshot.png)

## Install

```bash
npm i filebrowser-electron
cd filebrowser-electron && npm install && npm start
```

## Create your own Mac Quick Action

1. Open Automator
1. Create a new Quick Action
1. Set "Workflow receives current" to "files or folders"
1. Find the action "Run Shell Script" and drag it into the Quick Action
1. Change "Pass input" to "as arguments"
1. Paste the following, adapting the filebrowser-electron path to your own
```shell
for f in "$@"
do
	open -a "/Users/brett/filebrowser/out/filebrowser-electron-darwin-arm64/filebrowser-electron.app" --args --path "$f"
done
```
1. Save (e.g., as "Open in Filebrowser")
1. Go to the Finder, choose a folder or file, and right-click it and select "Quick Actions" and your name created in the previous step.

## Invoking with arguments during development

1. Invoke like such: `npm run start -- --path /Users/brett`

## To-dos

1. **BUG**: Context menu "Open with..." submenu icons may not be visible after moving to context-isolated preload script - the icon URLs (data URLs from `getAppIcons`) might not be loading properly in the CSS `--background` variable
1. **BUG**: Context menu "Open with..." submenu doesn't adjust position correctly near viewport edges - submenu extends beyond viewport (950px) when it should stay within (820px)
1. **BUG**: Context menu submenu items are not visible/clickable when testing - element appears in DOM but is not visible for Playwright click action (may be timing or visibility CSS issue)
1. Add Playwright tests
  1. Testing for better listening for external changes; release
1. Moving/Copying
1. Preview/Editing Metadata/File
1. List view/Gallery view
1. Demo with file handler web apps
1. Build/set icon:
    <https://stackoverflow.com/questions/31529772/how-to-set-app-icon-for-electron-atom-shell-app>
1. Proper publishing: <https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating>
1. Make extensible
1. Design in such a way that privileged APIs could work if WebExtensions
    allowed overriding browser's `file:///` browser (not only for
    directories, but also to allow injecting a button to allow editing
    browsed files as well)
1. Ideally would allow separate windows and tabs

## Misc. to-dos

1. After deleting an external file, prompting a refresh, let the scroll be back
    to the exact coordinates as before if that is in the viewport
1. Retain z-index of stickies
1. Fix icon view and local sticky note creation at root
1. Fix column view and local sticky note creation at root
1. Allow escape key in column view (or clicking off folder at root) to show
    local sticky for root
1. Investigate why icons on context menu are no longer visible in
    context-isolated code
1. Add breadcrumbs for both views
1. Way to clean up opened Finder windows from tests?
