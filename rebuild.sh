#!/bin/bash
cd node_modules/system-icon2 && npx --package=node-gyp@latest node-gyp rebuild --target=39.2.3 --arch=arm64 --dist-url=https://electronjs.org/headers
