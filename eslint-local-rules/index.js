'use strict';

// Local ESLint plugin (referenced as `bridge` in .eslintrc.js) holding rules specific to
// the on-device Solid Devtools bridge. Wired in via the `file:eslint-local-rules`
// devDependency so it resolves as `eslint-plugin-bridge` in node_modules.
module.exports = {
    rules: {
        'no-loop-closure-capture': require('./no-loop-closure-capture')
    }
};
