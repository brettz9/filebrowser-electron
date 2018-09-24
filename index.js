const path = require('path');

function getBasePath () {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return path.normalize(
    params.has('path') ? params.get('path') + '/' : '/'
  );
}

const isWebAppFind = false;

function changePath () {
  // console.log('change path');
  const basePath = getBasePath();
  if (!basePath.match(/^[\w./ -]*$/)) {
    // Todo: Refactor to allow non-ASCII and just escape single quotes, etc.
    console.log('Non-ASCII path provided'); // eslint-disable-line no-console
    return;
  }
  if (isWebAppFind) {
    window.postMessage({
      webappfind: {
        method: 'nodeEval',
        string: `
  const fs = require('fs');
  fs.readdirSync('${basePath}').map((fileOrDir) => {
    const stat = fs.lstatSync('${basePath}' + fileOrDir);
    return [stat.isDirectory() || stat.isSymbolicLink(), fileOrDir];
  });`
      }
    }, '*');
    return;
  }

  const fs = require('fs');
  // console.log('basePath', basePath);
  const result = fs.readdirSync(basePath).map((fileOrDir) => {
    const stat = fs.lstatSync(basePath + fileOrDir);
    return [stat.isDirectory() || stat.isSymbolicLink(), fileOrDir];
  });
  // console.log('result', result);
  addItems(result);
}

function addItems (result) {
  const basePath = getBasePath();
  document.querySelector('i').hidden = true;
  const ul = document.querySelector('ul');
  while (ul.firstChild) {
    ul.firstChild.remove();
  }
  // Todo: Do for WebAppFind
  if (!isWebAppFind && basePath !== '/') {
    console.log('basePath', basePath);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#path=' + path.normalize(path.join(basePath, '..'));
    a.append('..');
    li.append(a);
    ul.append(li);
  }

  ul.append(...result.map(([isDir, title]) => {
    const li = document.createElement('li');
    if (isDir) {
      const a = document.createElement('a');
      a.href = '#path=' + basePath + encodeURIComponent(title);
      a.append(title);
      li.append(a);
    } else {
      li.append(title);
    }
    return li;
  }));
}

window.addEventListener('hashchange', changePath);
window.addEventListener('message', ({data: {webappfind}}) => {
  if (webappfind.method) { // Don't echo items just posted below
    return;
  }
  if (webappfind.evalReady) {
    changePath();
    return;
  }
  addItems(webappfind.result);
});

changePath();
