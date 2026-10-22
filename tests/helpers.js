"use strict";

const base = require("@playwright/test");

/**
 * The page fixture blocks requests to other hosts, and fails the test if the page logs an error or throws.
 */
const test = base.test.extend({
    page: async ({ page }, use) => {
        const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
        await page.route(/^https?:\/\/(?!localhost)/, route => route.abort());
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
            vector: [text("location-velocity"), text("location-velocity-units")].join(" ").trim(),
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
