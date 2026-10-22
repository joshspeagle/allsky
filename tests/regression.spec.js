"use strict";

// Regression tests: they record what the map shows today, so that refactoring can be checked against it.
// Update the snapshots (npx playwright test --update-snapshots) only for an output change the lead approved.

const fs = require("fs");
const { test, expect, openMap, overlayDraws, waitForOverlayDraw, readoutAt, hashOf } = require("./helpers");

// The distance bins, overlays and projections, by the names the page uses in the hash and the menu.
const BINS = ["0-2kpc", "1-3kpc", "2-4kpc", "3-6kpc", "5-8kpc", "7-11kpc", "10-15kpc", "13-25kpc", "20-50kpc"];
const OVERLAYS = ["none", "velocity", "density", "metallicity", "age"];
const PROJECTIONS = [
    "mollweide", "azimuthal_equidistant", "conic_equidistant", "equirectangular",
    "orthographic", "stereographic", "waterman", "winkel3"
];

function hashFor(bin, overlay, projection = "mollweide") {
    return [bin, overlay, projection].join("/");
}

// The selector of the menu button for a distance bin, an overlay or a projection.
const button = {
    bin: bin => `[data-bin="${bin}"]`,
    overlay: overlay => `[data-overlay="${overlay}"]`,
    projection: projection => `[data-projection="${projection}"]`,
    grid: "#show-grid"
};

// Pixels in the 960x600 view that land off the sphere, on observed sky and on masked sky, in the default view.
// The probe off the sphere comes first, because a click there leaves any earlier readout in place.
const PROBES = [[20, 20], [480, 140], [300, 200], [700, 230], [480, 300], [380, 420], [600, 470]];

test.describe("map pixels", () => {
    const cases = [
        ["default view", ""],
        ["velocity 0-2 kpc", hashFor("0-2kpc", "velocity")],
        ["no overlay", hashFor("5-8kpc", "none")],
        ["grid points", hashFor("5-8kpc", "density") + "/grid"],
        ["zoomed orthographic", hashFor("3-6kpc", "age", "orthographic=40.00,-20.00,600")]
    ];
    for (const overlay of ["density", "metallicity", "age"]) {
        cases.push([overlay + " 5-8 kpc", hashFor("5-8kpc", overlay)]);
    }
    for (const projection of PROJECTIONS) {
        cases.push([projection + " projection", hashFor("0-2kpc", "density", projection)]);
    }

    for (const [name, hash] of cases) {
        test(`${name} matches its snapshot`, async ({ page }) => {
            await openMap(page, hash);
            await expect(page).toHaveScreenshot(name.replace(/ /g, "-") + ".png");
        });
    }
});

test.describe("colour bars", () => {
    // Compare the bar's colours at fixed fractions of its width.
    for (const overlay of ["velocity", "density", "metallicity", "age"]) {
        test(`${overlay} colour bar matches its snapshot`, async ({ page }) => {
            await openMap(page, hashFor("5-8kpc", overlay));
            const profile = await page.evaluate(() => {
                const c = document.getElementById("scale");
                const row = c.getContext("2d").getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
                const samples = [];
                for (let k = 0; k <= 64; k++) {
                    const i = 4 * Math.round(k / 64 * (c.width - 1));
                    samples.push(row[i], row[i + 1], row[i + 2]);
                }
                return samples;
            });
            expectProfile(`scale-${overlay}.json`, profile, 1);  // Chromium builds round the gradient by up to 1 level
        });
    }
});

/**
 * Compares numbers with their snapshot, within a tolerance. Follows toMatchSnapshot: a missing snapshot is
 * written and fails, "--update-snapshots=changed" writes only a snapshot outside the tolerance, and
 * "--update-snapshots" (all) writes every snapshot.
 */
function expectProfile(name, actual, tolerance) {
    const file = test.info().snapshotPath(name);
    const update = test.info().config.updateSnapshots;
    const expected = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    const difference = expected && expected.length === actual.length ?
        Math.max(...actual.map((x, i) => Math.abs(x - expected[i]))) : Infinity;
    if (!expected || update === "all" || (update === "changed" && difference > tolerance)) {
        fs.writeFileSync(file, JSON.stringify(actual) + "\n");
        expect(expected || update === "all" || update === "changed", `snapshot ${name} was missing`).toBeTruthy();
        return;
    }
    expect(difference, `largest difference from ${name}`).toBeLessThanOrEqual(tolerance);
}

test.describe("location readouts", () => {
    for (const bin of BINS) {
        const kpc = bin.replace("kpc", "");
        for (const overlay of ["density", "metallicity", "age"]) {
            test(`${overlay} ${kpc} kpc readouts match their snapshot`, async ({ page }) => {
                await openMap(page, hashFor(bin, overlay));
                const readouts = [];
                for (const [x, y] of PROBES) {
                    readouts.push([x, y, await readoutAt(page, x, y)]);
                }
                expect(JSON.stringify(readouts, null, 1)).toMatchSnapshot(`readouts-${overlay}-${kpc}.json`);
            });
        }
    }

    test("closing the readout clears it", async ({ page }) => {
        await openMap(page, hashFor("5-8kpc", "density"));
        await readoutAt(page, ...PROBES[1]);
        await page.click("#location-close");
        await expect(page.locator("#location-coord")).toHaveText("");
        await expect(page.locator(".location-mark")).toHaveCount(0);
    });
});

test.describe("URL hash", () => {
    test("the default view keeps an empty hash", async ({ page }) => {
        await openMap(page, "");
        expect(await hashOf(page)).toBe("");
    });

    for (const hash of [
        hashFor("0-2kpc", "density", "orthographic=12.50,-30.00,450"),
        hashFor("20-50kpc", "none", "winkel3") + "/grid",
        hashFor("13-25kpc", "velocity", "stereographic")
    ]) {
        test(`loading ${hash} keeps the hash`, async ({ page }) => {
            await openMap(page, hash);
            expect(await hashOf(page)).toBe(hash);
        });
    }

    test("menu buttons write the expected hashes", async ({ page }) => {
        await openMap(page, hashFor("5-8kpc", "velocity"));
        await page.click("#show-menu");
        const selectors = BINS.map(button.bin).concat(OVERLAYS.map(button.overlay), PROJECTIONS.map(button.projection),
            [button.grid, button.grid]);
        const hashes = [];
        for (const selector of selectors) {
            await page.click(selector);
            hashes.push([selector, await hashOf(page)]);
        }
        expect(JSON.stringify(hashes, null, 1)).toMatchSnapshot("menu-hashes.json");
    });

    test("the active buttons are highlighted", async ({ page }) => {
        await openMap(page, hashFor("2-4kpc", "metallicity", "winkel3"));
        await expect(page.locator(".highlighted")).toHaveCount(3);
        for (const selector of [button.bin("2-4kpc"), button.overlay("metallicity"), button.projection("winkel3")]) {
            await expect(page.locator(selector)).toHaveClass(/highlighted/);
        }
    });

    test("an edited hash redraws the map after a click on the active button", async ({ page }) => {
        await openMap(page, hashFor("5-8kpc", "density"));
        await page.click("#show-menu");
        await page.click(button.overlay("density"));
        const draws = await overlayDraws(page);
        await page.evaluate(h => { window.location.hash = h; }, hashFor("5-8kpc", "age"));
        await waitForOverlayDraw(page, draws);
        await expect(page.locator(button.overlay("age"))).toHaveClass(/highlighted/);
    });

    test("an edited hash redraws the map", async ({ page }) => {
        await openMap(page, hashFor("5-8kpc", "density"));
        const draws = await overlayDraws(page);
        await page.evaluate(h => { window.location.hash = h; }, hashFor("5-8kpc", "age"));
        await waitForOverlayDraw(page, draws);
        await expect(page).toHaveScreenshot("age-5-8-kpc.png");
    });
});

test("dragging the map changes the orientation in the hash", async ({ page }) => {
    await openMap(page, hashFor("5-8kpc", "density", "orthographic"));
    await page.mouse.move(480, 300);
    await page.mouse.down();
    await page.mouse.move(530, 320, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => hashOf(page)).toContain("orthographic=");
    expect(await hashOf(page)).toMatchSnapshot("dragged-hash.txt");
});

test("wheel, double-click and drag write the expected orientations", async ({ page }) => {
    await openMap(page, hashFor("5-8kpc", "density", "orthographic"));
    const hashes = [await hashOf(page)];
    // A move ends 1 s after its last event (MOVE_END_WAIT in main.js), when the hash is written.
    const record = async () => {
        const previous = hashes[hashes.length - 1];
        await expect.poll(() => hashOf(page)).not.toBe(previous);
        hashes.push(await hashOf(page));
    };
    await page.mouse.move(480, 300);
    await page.mouse.wheel(0, -300);
    await record();
    await page.mouse.wheel(0, 500);
    await record();
    await page.mouse.dblclick(500, 320);
    await record();
    await page.mouse.move(480, 300);
    await page.mouse.down();
    await page.mouse.move(380, 250, { steps: 8 });
    await page.mouse.up();
    await record();
    expect(JSON.stringify(hashes.slice(1), null, 1)).toMatchSnapshot("move-hashes.json");
});

test("particle brightness saturates at the 95th percentile of the grid's speeds", async ({ page }) => {
    await openMap(page, hashFor("5-8kpc", "velocity"));
    const maxIntensity = await page.evaluate(async () => {
        const {productsFor} = await import("./js/products.js");
        const [velocity] = productsFor({bin: "5-8kpc", overlay: "velocity"});
        return (await velocity.load(new AbortController().signal)).particles.maxIntensity;
    });
    expect(maxIntensity).toBeCloseTo(172.6, 0);
});

test.describe("overlay switching", () => {
    const overlayDigest = page => page.evaluate(async () => {
        const c = document.getElementById("overlay");
        const digest = await crypto.subtle.digest("SHA-256", c.getContext("2d").getImageData(0, 0, c.width, c.height).data);
        return Array.from(new Uint8Array(digest)).join(",");
    });

    test("switching to an overlay and straight back shows the first overlay", async ({ page }) => {
        await openMap(page, hashFor("5-8kpc", "velocity"));
        const expected = await overlayDigest(page);
        // Delay the density file, so that its build is still running after the switch back.
        await page.route("**/density.json", async route => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            await route.continue();
        });
        const densitySettled = new Promise(resolve => {
            page.on("requestfinished", request => request.url().endsWith("density.json") && resolve());
            page.on("requestfailed", request => request.url().endsWith("density.json") && resolve());
        });
        await page.click("#show-menu");
        await page.click(button.overlay("density"));
        await page.click(button.overlay("velocity"));
        await densitySettled;
        await expect.poll(() => overlayDigest(page)).toBe(expected);
    });

    test("no overlay shows no colour bar", async ({ page }) => {
        await openMap(page, hashFor("5-8kpc", "none"));
        const painted = await page.evaluate(() => {
            const c = document.getElementById("scale");
            return c.getContext("2d").getImageData(0, 0, c.width, c.height).data.some(x => x !== 0);
        });
        expect(painted).toBe(false);
    });
});

test("resizing the window redraws the map at the new size", async ({ page }) => {
    await openMap(page, hashFor("5-8kpc", "density"));
    const draws = await overlayDraws(page);
    await page.setViewportSize({ width: 800, height: 500 });
    await waitForOverlayDraw(page, draws);
    await expect(page).toHaveScreenshot("density-5-8-kpc-800x500.png");
});

test("the last pixel column of an odd-width view has a readout", async ({ page }) => {
    await page.setViewportSize({ width: 961, height: 601 });
    await openMap(page, hashFor("5-8kpc", "density", "equirectangular=-130.00,40.00,2000"));
    const readout = await readoutAt(page, 960, 300);
    expect(readout.coord).not.toBe("");
});
