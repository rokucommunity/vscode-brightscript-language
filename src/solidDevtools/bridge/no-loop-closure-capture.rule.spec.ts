/* eslint-disable */
// Unit test for the local ESLint rule `bridge/no-loop-closure-capture`
// (eslint-local-rules/no-loop-closure-capture.js). Uses ESLint's RuleTester, which
// registers mocha tests when run, so it's picked up by the normal `src/**/*.spec.ts` glob.
import { RuleTester } from 'eslint';

const rule = require('eslint-plugin-bridge').rules['no-loop-closure-capture'];

const ruleTester = new RuleTester({ parserOptions: { ecmaVersion: 2020, sourceType: 'module' } });

ruleTester.run('no-loop-closure-capture', rule, {
    valid: [
        // immediately-invoked read via the allow-listed synchronous caller — never escapes
        'for (let i = 0; i < n; i++) { untrackRead(() => arr[i]); }',
        'for (const k of keys) { untrackRead(() => obj[k]); }',
        // closure defined OUTSIDE the loop, merely called inside it
        'const f = () => x; for (let i = 0; i < n; i++) { f(); }',
        // loop body with no closure at all
        'for (const k of keys) { out.push(obj[k]); }',
        // a loop nested INSIDE a closure (the closure is not itself in a loop)
        'run(() => { for (let i = 0; i < n; i++) { sum += i; } });',
        // custom allow-list honoured
        {
            code: 'for (let i = 0; i < n; i++) { read(() => arr[i]); }',
            options: [{ allowSyncCallers: ['read'] }]
        }
    ],
    invalid: [
        // escaping closure capturing the loop variable — the Hermes per-iteration hazard
        {
            code: 'const out = []; for (let i = 0; i < n; i++) { out.push(() => i); }',
            errors: [{ messageId: 'loopClosure' }]
        },
        // deferred via a non-allow-listed caller
        {
            code: 'for (const k of keys) { defer(() => obj[k]); }',
            errors: [{ messageId: 'loopClosure' }]
        },
        // member-call (not an allow-listed bare identifier) is not exempt
        {
            code: 'for (let i = 0; i < n; i++) { queue.add(() => arr[i]); }',
            errors: [{ messageId: 'loopClosure' }]
        },
        // while-loop closure
        {
            code: 'while (cond) { handlers.push(function () { return v; }); }',
            errors: [{ messageId: 'loopClosure' }]
        }
    ]
});
