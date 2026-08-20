const path = require('path');

/**
 * Optional post-build copy into the Crafter Studio plugin static-assets tree.
 * Set PLUGIN_DEPLOY_PATH to enable, e.g.:
 *   PLUGIN_DEPLOY_PATH=../../../authoring/static-assets/plugins/org/rd/plugin/crafterwf/apps/crafterwf yarn dist
 *
 * A relative path is resolved against this package, not against the working directory, so calling
 * rollup from anywhere still deploys into the same tree.
 */
function getPluginCopyTargets() {
  const deployPath = process.env.PLUGIN_DEPLOY_PATH;
  if (!deployPath) {
    return [];
  }
  return [
    {
      // Named explicitly: everything else in dist/ is a build by-product Studio never loads.
      src: path.resolve(__dirname, 'dist/app.js'),
      dest: path.resolve(__dirname, deployPath)
    }
  ];
}

module.exports = { getPluginCopyTargets };
