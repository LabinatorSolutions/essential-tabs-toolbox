// Keeps development files out of the AMO package: only manifest.json, icon.svg, LICENSE and src/ ship.
export default {
  ignoreFiles: [
    // AMO listing assets (icon, screenshots, store text) are uploaded separately.
    'amo',
    'amo/**',
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
