const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/renderer.js'],
  bundle: true,
  outfile: 'src/dist/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome108',
  sourcemap: true,
  // The spell checker's dictionary files are loaded as text.
  loader: { '.aff': 'text', '.dic': 'text' },
}).catch(() => process.exit(1));
