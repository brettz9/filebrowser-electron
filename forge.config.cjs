'use strict';

const {FusesPlugin} = require('@electron-forge/plugin-fuses');
const {FuseV1Options, FuseVersion} = require('@electron/fuses');
const {execSync} = require('child_process');

module.exports = {
  packagerConfig: {
    asar: true
  },
  rebuildConfig: {
    // Explicitly set to empty array to prevent automatic rebuilding
    onlyModules: [],
    force: true
  },
  hooks: {
    // Run our custom rebuild script before Electron Forge starts
    preStart () {
      // eslint-disable-next-line no-console -- Logging
      console.log('Running custom rebuild script...');
      // No longer needed
      // // eslint-disable-next-line n/no-sync -- For rebuilding
      // execSync('./rebuild.sh', {stdio: 'inherit', cwd: __dirname});
      return Promise.resolve();
    }
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {}
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-deb',
      config: {}
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {}
    }
  ],
  plugins: [
    // Disabled auto-unpack-natives plugin since we handle native module
    //   rebuilding manually
    // {
    //   name: '@electron-forge/plugin-auto-unpack-natives',
    //   config: {}
    // },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};
