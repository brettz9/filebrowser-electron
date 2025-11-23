import ashNazg from 'eslint-config-ash-nazg';

export default [
  {
    ignores: [
      'dist'
    ]
  },
  ...ashNazg(['sauron', 'browser', 'node', 'script']),
  ...ashNazg(['sauron', 'node']).map((cfg) => {
    return {
      ...cfg,
      files: ['*.mjs'],
      languageOptions: {
        sourceType: 'module'
      },
    };
  }),
  {
    rules: {
      // Thinks we're using Node globals despite browser reference above
      'n/no-unsupported-features/node-builtins': 'off'
    }
  }
];
