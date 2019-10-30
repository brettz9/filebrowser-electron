// Adapted from https://stackoverflow.com/a/51684113/271577
const {readFile} = require('fs');
const {join} = require('path');
const {app, protocol} = require('electron');

const es6Path = __dirname;

protocol.registerSchemesAsPrivileged([{
  scheme: 'es6'
}]);

app.on('ready', () => {
  // eslint-disable-next-line promise/prefer-await-to-callbacks
  protocol.registerBufferProtocol('es6', (req, cb) => {
    // eslint-disable-next-line node/prefer-promises/fs
    readFile(
      join(es6Path, req.url.replace(/^es6:\/\//u, '').replace(/\/$/u, '')),
      (e, b) => {
        // eslint-disable-next-line promise/prefer-await-to-callbacks
        cb({ // eslint-disable-line standard/no-callback-literal
          mimeType: 'text/javascript',
          data: b
        });
      }
    );
  });
});
