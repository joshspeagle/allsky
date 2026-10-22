"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    { ignores: ["public/libs/*", "!public/libs/earth", "playwright-report", "test-results"] },
    js.configs.recommended,
    {
        files: ["*.js", "tests/**/*.js"],
        languageOptions: { sourceType: "commonjs", globals: globals.node }
    },
    {
        // The page functions that the tests run in the browser.
        files: ["tests/**/*.js"],
        languageOptions: { globals: globals.browser }
    },
    {
        files: ["public/libs/earth/**/*.js"],
        languageOptions: {
            ecmaVersion: 5,
            sourceType: "script",
            globals: {
                ...globals.browser, _: "readonly", Backbone: "readonly", d3: "readonly", when: "readonly",
                µ: "writable", globes: "writable", products: "writable"
            }
        },
        // Each file defines one global (µ, globes, products) that the files after it read. These two rule options
        // go when the files become ES modules (#19, step 5).
        rules: { "no-redeclare": ["error", { builtinGlobals: false }], "no-unused-vars": ["error", { vars: "local" }] }
    }
];
