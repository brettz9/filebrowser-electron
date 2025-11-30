import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// We are using this not only to allow ESM in source, but
//   it is apparently required for bundling the Electron packages

export default {
  input: 'src/renderer/index.js',
  external: [],
  output: {
    file: 'index.cjs',
    format: 'iife',
    sourcemap: true
  },
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    // @ts-expect-error Bug?
    commonjs()
  ]
};
