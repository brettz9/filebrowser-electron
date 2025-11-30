import ashNazg from 'eslint-config-ash-nazg';

export default [
  {
    ignores: [
      'dist',
      'instrumented',
      'coverage'
    ]
  },
  ...ashNazg(['sauron', 'browser', 'node']),
  ...ashNazg(['sauron', 'node', 'script']).map((cfg) => {
    return {
      ...cfg,
      files: ['**/*.cjs'],
      languageOptions: {
        sourceType: 'script'
      }
    };
  }),
  {
    files: ['test/**/*.js'],
    rules: {
      // Use different `window` than for normal Mocha tests
      'no-shadow': 'off'
    }
  },
  {
    rules: {
      // Thinks we're using Node globals despite browser reference above
      'n/no-unsupported-features/node-builtins': 'off'
    }
  }
];
