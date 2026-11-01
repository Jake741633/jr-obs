// eslint-disable-next-line @typescript-eslint/no-require-imports -- Legacy lint plugins need a callable CommonJS export.
const { minimatch, Minimatch } = require("minimatch-modern");

module.exports = Object.assign((...args) => minimatch(...args), minimatch, {
  // import/no-internal-modules uses only makeRe(pattern).test(path).
  makeRe(pattern, options) {
    const matcher = new Minimatch(pattern, options);
    return { test: path => matcher.match(path) };
  },
});
