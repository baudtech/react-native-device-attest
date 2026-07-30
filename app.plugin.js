// Expo loads this file when an app lists this package in the `plugins` array of
// its app config. The plugin itself lives in `src/expo/withDeviceAttest.ts` and
// is compiled to `lib/commonjs` by bob, so this entry point stays a thin
// wrapper that adds the package identity used for run-once deduplication.
const { createRunOncePlugin } = require('expo/config-plugins')

const pkg = require('./package.json')
const withDeviceAttest = require('./lib/commonjs/expo/withDeviceAttest.js')

module.exports = createRunOncePlugin(
  withDeviceAttest.default ?? withDeviceAttest,
  pkg.name,
  pkg.version
)
