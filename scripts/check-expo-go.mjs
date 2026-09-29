// Every native package must match the version Expo Go ships for this SDK.
// A mismatch (often a hidden dependency npm picked up) makes the screen that
// loads it crash to a black screen in Expo Go.
import { createRequire } from 'node:module';
import semver from 'semver';

const require = createRequire(import.meta.url);
const bundled = require('expo/bundledNativeModules.json');
const off = [];
for (const [name, range] of Object.entries(bundled)) {
  let version;
  try {
    version = require(`${name}/package.json`).version;
  } catch {
    continue; // not installed
  }
  if (!semver.satisfies(version, range)) off.push(`${name}: installed ${version}, Expo Go needs ${range}`);
}
if (off.length) {
  console.error('Native packages that don\'t match Expo Go:\n  ' + off.join('\n  '));
  console.error('Fix with: npx expo install <package>');
  process.exit(1);
}
console.log('All native packages match Expo Go.');
