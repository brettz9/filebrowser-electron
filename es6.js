// Adapted from https://stackoverflow.com/a/51684113/271577
const {app} = require('electron');
const {protocol} = require('electron');
const nfs = require('fs');
const npjoin = require('path').join;
const es6Path = __dirname;

protocol.registerStandardSchemes(['es6']);

app.on('ready', () => {
  protocol.registerBufferProtocol('es6', (req, cb) => {
    nfs.readFile(
      npjoin(es6Path, req.url.replace(/^es6:\/\//, '').replace(/\/$/, '')),
      (e, b) => {
        cb({ // eslint-disable-line standard/no-callback-literal
          mimeType: 'text/javascript',
          data: b
        });
      }
    );
  });
});
