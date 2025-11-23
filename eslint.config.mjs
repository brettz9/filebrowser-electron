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
  })
];
