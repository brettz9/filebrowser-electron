#!/bin/bash

# Rebuild all native modules for Electron
ELECTRON_VERSION=39.2.4
ARCH=arm64

echo "Rebuilding native modules for Electron ${ELECTRON_VERSION}..."

# Rebuild system-icon2
if [ -d "node_modules/system-icon2" ]; then
  echo "Rebuilding system-icon2..."
  cd node_modules/system-icon2 && npx --package=node-gyp@latest node-gyp rebuild --target=${ELECTRON_VERSION} --arch=${ARCH} --dist-url=https://electronjs.org/headers
  cd ../..
fi

# Rebuild open-with-me (has launch_services.node)
if [ -d "node_modules/open-with-me/native" ]; then
  echo "Rebuilding open-with-me..."
  cd node_modules/open-with-me/native && npx --package=node-gyp@latest node-gyp rebuild --target=${ELECTRON_VERSION} --arch=${ARCH} --dist-url=https://electronjs.org/headers
  cd ../../..
fi

# Note: @parcel/watcher uses prebuilt binaries, should work without rebuild
# Note: fsevents uses prebuilt binaries, should work without rebuild

echo "Rebuild complete!"
