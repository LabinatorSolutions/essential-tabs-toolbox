// Keeps development files out of the AMO package: only manifest.json, icon.svg, LICENSE and src/ ship.
export default {
  ignoreFiles: [
    'tests',
    'docs',
    '.superpowers',
    'node_modules',
    'package.json',
    'bun.lock',
    'biome.json',
    'tsconfig.json',
    '.rumdl.toml',
    '*.md',
    'web-ext-config.mjs',
  ],
};
