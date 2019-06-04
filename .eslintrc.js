module.exports = {
  "extends": ["ash-nazg/sauron-node"],
  "parserOptions": {
    "sourceType": "module"
  },
  "plugins": [],
  "env": {
    "node": true,
    "browser": true
  },
  "globals": {
    "require": "readonly",
    "__dirname": "readonly"
  },
  "settings": {
    "polyfills": [
      "Promise",
      "Promise.all",
      "URLSearchParams"
    ]
  },
  "rules": {
    "import/unambiguous": 0,
    "import/no-commonjs": 0
  }
};
