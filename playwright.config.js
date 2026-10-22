"use strict";

const { defineConfig } = require("@playwright/test");

const PORT = 8123;

module.exports = defineConfig({
    testDir: "tests",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
    snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.001 }
    },
    use: {
        baseURL: `http://localhost:${PORT}`,
        browserName: "chromium",
        viewport: { width: 960, height: 600 },
        deviceScaleFactor: 1
    },
    webServer: {
        command: `node dev-server.js ${PORT}`,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: !process.env.CI
    }
});
