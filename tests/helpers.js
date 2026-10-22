"use strict";

const fs = require("fs");
const path = require("path");
const base = require("@playwright/test");

const LIBS = path.join(__dirname, "..", "public", "libs");

// index.html loads some libraries from cdnjs. Serve the vendored copies of the same versions instead, so tests
// need no network.
const CDN = /^https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([^/]+)\/([^/]+?)(-min|\.min)?\.js$/;

/**
 * The page fixture serves only local files, and fails the test if the page logs an error or throws.
 */
const test = base.test.extend({
    page: async ({ page }, use) => {
        const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
        await page.route(/^https?:\/\/(?!localhost)/, route => {
            const m = CDN.exec(route.request().url());
            const file = m && path.join(LIBS, m[1], m[2], m[3] + ".js");
            return file && fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
        });
        await use(page);
        base.expect(errors).toEqual([]);
    }
});

/**
 * Returns the number of overlays the page has drawn for newly interpolated fields (see earth.js).
 */
function overlayDraws(page) {
    return page.evaluate(() => +(document.documentElement.dataset.fieldOverlays || 0));
}

/**
 * Waits until the page has drawn more than the given number of overlays for newly interpolated fields.
 */
function waitForOverlayDraw(page, after) {
    return page.waitForFunction(n => +(document.documentElement.dataset.fieldOverlays || 0) > n, after);
}

/**
 * Opens the map at the given hash and waits until the field is interpolated and the overlay is drawn.
 */
async function openMap(page, hash) {
    await page.goto("/" + (hash ? "#" + hash : ""));
    await waitForOverlayDraw(page, 0);
}

/**
 * Clicks the map at a pixel and returns the location readout.
 */
async function readoutAt(page, x, y) {
    await page.mouse.click(x, y);
    return page.evaluate(() => {
        const text = id => document.getElementById(id).textContent;
        return {
            coord: text("location-coord"),
            vector: [text("location-wind"), text("location-wind-units")].join(" ").trim(),
            value: [text("location-value"), text("location-value-units")].join(" ").trim()
        };
    });
}

/**
 * Returns the hash fragment of the page, without the leading "#".
 */
function hashOf(page) {
    return page.evaluate(() => window.location.hash.substr(1));
}

module.exports = { test, expect: base.expect, openMap, overlayDraws, waitForOverlayDraw, readoutAt, hashOf };
