"use strict";

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    { ignores: ["public/libs", "playwright-report", "test-results"] },
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
        files: ["public/js/**/*.js"],
        languageOptions: { sourceType: "module", globals: globals.browser }
    }
];
