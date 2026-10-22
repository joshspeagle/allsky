"use strict";

const fs = require("fs");
const path = require("path");

const LIBS = path.join(__dirname, "..", "public", "libs");

// index.html loads some libraries from cdnjs. Serve the vendored copies of the same versions instead, so tests
// need no network.
const CDN = /^https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([^/]+)\/([^/]+?)(-min|\.min)?\.js$/;

/**
 * Opens the map at the given hash and waits until the field is interpolated and the overlay is drawn.
 * Returns the list of page errors and console errors seen so far, which grows while the page stays open.
 */
async function openMap(page, hash) {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

    await page.route(/^https?:\/\/(?!localhost)/, route => {
        const m = CDN.exec(route.request().url());
        const file = m && path.join(LIBS, m[1], m[2], m[3] + ".js");
        return file && fs.existsSync(file) ?
            route.fulfill({ path: file, contentType: "application/javascript" }) :
            route.abort();
    });

    const animating = page.waitForEvent("console", m => m.text().startsWith("particle count"));
    await page.goto("/" + (hash ? "#" + hash : ""));
    await animating;
    await waitForStableOverlay(page);
    return errors;
}

/**
 * Waits until the overlay canvas stops changing. The overlay is drawn in the event turn after the animation starts.
 */
async function waitForStableOverlay(page) {
    await page.evaluate(() => { window.__overlayChecks = []; });
    await page.waitForFunction(() => {
        const c = document.getElementById("overlay");
        const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 97) sum = (sum + data[i] * (i % 1009)) % 1e9;
        const w = window.__overlayChecks;
        w.push(sum);
        return w.length >= 3 && w[w.length - 1] === w[w.length - 2] && w[w.length - 2] === w[w.length - 3];
    }, null, { polling: 100 });
}

/**
 * Hides the layers that are not deterministic (the particle animation) or not part of the map (the menu and text).
 */
async function hideNondeterministicLayers(page) {
    await page.addStyleTag({ content: "#animation, #details { visibility: hidden !important; }" });
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

module.exports = { openMap, waitForStableOverlay, hideNondeterministicLayers, readoutAt, hashOf };
