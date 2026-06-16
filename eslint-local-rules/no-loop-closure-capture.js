'use strict';

// Custom ESLint rule for the on-device Solid Devtools bridge (src/solidDevtools/bridge).
//
// The bridge is esbuild-bundled and PREPENDED to the app bundle post-build, so it never
// goes through the SDK's Babel block-scoping transform — and esbuild cannot lower
// let/const to var. So the bridge relies on Hermes 0.12's native block scoping. The one
// runtime hazard is the per-iteration binding case: a closure created directly inside a
// loop that ESCAPES (is stored/returned/deferred) and captures the loop-scoped
// let/const. ESLint's built-in `no-loop-func` does NOT catch this (it trusts spec
// per-iteration semantics — the very thing Hermes may not honor), so we flag every
// closure created directly in a loop body, EXCEPT ones handed straight to an allow-listed
// synchronous caller (e.g. untrackRead) that invokes them immediately and discards them.

const LOOP_TYPES = new Set(['ForStatement', 'ForInStatement', 'ForOfStatement', 'WhileStatement', 'DoWhileStatement']);
const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow closures created directly inside a loop in the on-device bridge (Hermes 0.12 may not honor per-iteration let/const binding, and the bridge bypasses the SDK block-scoping transform). Immediately-invoked reads via an allow-listed synchronous caller are exempt.'
        },
        schema: [{
            type: 'object',
            properties: {
                allowSyncCallers: {
                    type: 'array',
                    items: { type: 'string' }
                }
            },
            additionalProperties: false
        }],
        messages: {
            loopClosure: 'Avoid creating a closure directly inside a loop: if it escapes and captures the loop variable, Hermes 0.12 may not honor per-iteration let/const semantics (this bridge bypasses the SDK block-scoping transform). Read the value immediately via {{allow}}(), or hoist the closure out of the loop.'
        }
    },
    create(context) {
        const configured = (context.options[0] && context.options[0].allowSyncCallers) || ['untrackRead'];
        const allow = new Set(configured);

        // A closure is exempt when it is passed DIRECTLY as an argument to an allow-listed
        // caller, e.g. `untrackRead(() => arr[i])` — invoked synchronously, never escapes.
        function isExempt(node) {
            const parent = node.parent;
            return !!parent
                && parent.type === 'CallExpression'
                && parent.arguments.indexOf(node) !== -1
                && parent.callee.type === 'Identifier'
                && allow.has(parent.callee.name);
        }

        // True when `node` sits directly in a loop body — i.e. walking up the ancestor
        // chain we reach a loop before any other function boundary. A closure nested in
        // ANOTHER function inside the loop is that function's concern, not this one's.
        function isDirectlyInLoop(node) {
            let cur = node.parent;
            while (cur) {
                if (FN_TYPES.has(cur.type)) {
                    return false;
                }
                if (LOOP_TYPES.has(cur.type)) {
                    return true;
                }
                cur = cur.parent;
            }
            return false;
        }

        function check(node) {
            if (isDirectlyInLoop(node) && !isExempt(node)) {
                context.report({
                    node: node,
                    messageId: 'loopClosure',
                    data: { allow: [...allow].join('/') }
                });
            }
        }

        return {
            ArrowFunctionExpression: check,
            FunctionExpression: check
        };
    }
};
