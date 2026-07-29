const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [root],
  resolver: {
    // The library is the workspace root, so npm doesn't link it into
    // node_modules — point its package name at the source directly.
    extraNodeModules: {
      [pkg.name]: root,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);