// @ts-expect-error No types
import istanbul from 'rollup-plugin-istanbul';

export default {
  input: 'index.cjs',
  external: [
    'node:fs', 'node:path', 'node:child_process',
    'electron', 'stickynote', 'stickynote', 'jamilih',
    'jquery', 'miller-columns', 'open-with-me', '@parcel/watcher',
    'base64-js', 'system-icon2'
  ],
  output: {
    file: 'index.instrumented.cjs',
    format: 'cjs'
  },
  plugins: [
    istanbul()
  ]
};
