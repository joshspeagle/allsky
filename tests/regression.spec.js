"use strict";

// Regression tests: they record what the map shows today, so that refactoring can be checked against it.
// Update the snapshots (npx playwright test --update-snapshots) only for an output change the lead approved.

const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { openMap, waitForStableOverlay, hideNondeterministicLayers, readoutAt, hashOf } = require("./helpers");

// Menu button ids and hash segments, by distance bin.
const BINS = {
    "0-2": "isobaric/250hPa",
    "1-3": "isobaric/1000hPa",
    "2-4": "isobaric/850hPa",
    "3-6": "isobaric/700hPa",
    "5-8": "isobaric/500hPa",
    "7-11": "surface/level",
    "10-15": "isobaric/70hPa",
    "13-25": "isobaric/20hPa",
    "20-50": "isobaric/10hPa"
};
const OVERLAYS = { velocity: "default", density: "temp", metallicity: "relative_humidity", age: "air_density" };
const PROJECTIONS = [
    "atlantis", "azimuthal_equidistant", "conic_equidistant", "equirectangular",
    "orthographic", "stereographic", "waterman", "winkel3"
];
const DEFAULT_PROJECTION = "atlantis";

function hashFor(bin, overlay, projection) {
    const ol = OVERLAYS[overlay] === "default" ? [] : ["overlay=" + (OVERLAYS[overlay] || overlay)];
    return ["current/wind", BINS[bin]].concat(ol, [projection || DEFAULT_PROJECTION]).join("/");
}

/**
 * Returns the golden value stored under the given snapshot name. Writes it first when it is missing or when
 * snapshots are being updated.
 */
function readOrWriteGolden(name, actual) {
    const file = test.info().snapshotPath(name);
    if (test.info().config.updateSnapshots === "all" || !fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(actual) + "\n");
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function expectWithin(actual, expected, tolerance) {
    expect(actual.length).toBe(expected.length);
    actual.flat().forEach((x, i) => expect(Math.abs(x - expected.flat()[i])).toBeLessThanOrEqual(tolerance));
}

// Pixels in the 960x600 view that land on observed sky, on masked sky and off the sphere, in the default view.
const PROBES = [[480, 140], [300, 200], [700, 230], [480, 300], [380, 420], [600, 470], [20, 20]];

test.describe("map pixels", () => {
    const cases = [
        ["default view", ""],
        ["velocity 7-11 kpc", hashFor("7-11", "velocity")],
        ["no overlay", hashFor("5-8", "off")],
        ["grid points", hashFor("5-8", "density") + "/grid=on"],
        ["zoomed orthographic", hashFor("3-6", "age", "orthographic=40.00,-20.00,600")]
    ];
    for (const overlay of ["density", "metallicity", "age"]) {
        cases.push([overlay + " 5-8 kpc", hashFor("5-8", overlay)]);
    }
    for (const projection of PROJECTIONS) {
        cases.push([projection + " projection", hashFor("0-2", "density", projection)]);
    }

    for (const [name, hash] of cases) {
        test(`${name} matches its snapshot`, async ({ page }) => {
            const errors = await openMap(page, hash);
            await hideNondeterministicLayers(page);
            await expect(page).toHaveScreenshot(name.replace(/ /g, "-") + ".png");
            expect(errors).toEqual([]);
        });
    }
});

test.describe("colour bars", () => {
    // The bar's width depends on whether the web font had loaded at start-up, so compare its colours at fixed
    // fractions of its width, with a tolerance of one pixel's change in colour.
    for (const overlay of Object.keys(OVERLAYS)) {
        test(`${overlay} colour bar matches its snapshot`, async ({ page }) => {
            await openMap(page, hashFor("5-8", overlay));
            const profile = await page.evaluate(() => {
                const c = document.getElementById("scale");
                const row = c.getContext("2d").getImageData(0, Math.floor(c.height / 2), c.width, 1).data;
                const samples = [];
                for (let k = 0; k <= 64; k++) {
                    const i = 4 * Math.round(k / 64 * (c.width - 1));
                    samples.push([row[i], row[i + 1], row[i + 2]]);
                }
                return samples;
            });
            expectWithin(profile, readOrWriteGolden(`scale-${overlay}.json`, profile), 6);
        });
    }
});

test.describe("location readouts", () => {
    for (const bin of Object.keys(BINS)) {
        for (const overlay of ["density", "metallicity", "age"]) {
            test(`${overlay} ${bin} kpc readouts match their snapshot`, async ({ page }) => {
                const errors = await openMap(page, hashFor(bin, overlay));
                const readouts = [];
                for (const [x, y] of PROBES) {
                    readouts.push([x, y, await readoutAt(page, x, y)]);
                }
                expect(JSON.stringify(readouts, null, 1)).toMatchSnapshot(`readouts-${overlay}-${bin}.json`);
                expect(errors).toEqual([]);
            });
        }
    }

    test("closing the readout clears it", async ({ page }) => {
        await openMap(page, hashFor("5-8", "density"));
        await readoutAt(page, ...PROBES[0]);
        await page.click("#location-close");
        await expect(page.locator("#location-coord")).toHaveText("");
        await expect(page.locator(".location-mark")).toHaveCount(0);
    });
});

test.describe("URL hash", () => {
    test("the default view has the default hash", async ({ page }) => {
        await openMap(page, "");
        expect(await hashOf(page)).toBe("");
    });

    for (const hash of [
        hashFor("0-2", "density", "orthographic=12.50,-30.00,450"),
        hashFor("20-50", "off", "winkel3") + "/grid=on",
        hashFor("13-25", "velocity", "stereographic")
    ]) {
        test(`loading ${hash} keeps the hash`, async ({ page }) => {
            await openMap(page, hash);
            expect(await hashOf(page)).toBe(hash);
        });
    }

    test("menu buttons write the expected hashes", async ({ page }) => {
        await openMap(page, hashFor("5-8", "velocity"));
        await page.click("#show-menu");
        const ids = Object.values(BINS).map(b => "#" + b.replace("/", "-"))
            .concat(["#overlay-off", "#overlay-wind", "#overlay-temp", "#overlay-relative_humidity",
                "#overlay-air_density"])
            .concat(PROJECTIONS.map(p => "#" + p), ["#option-show-grid", "#option-show-grid"]);
        const hashes = [];
        for (const id of ids) {
            await page.click(id);
            hashes.push([id, await hashOf(page)]);
        }
        expect(JSON.stringify(hashes, null, 1)).toMatchSnapshot("menu-hashes.json");
    });

    test("the active buttons are highlighted", async ({ page }) => {
        await openMap(page, hashFor("2-4", "metallicity", "winkel3"));
        const highlighted = await page.$$eval(".highlighted", els => els.map(e => e.id).sort());
        expect(highlighted).toEqual(["isobaric-850hPa", "overlay-relative_humidity", "winkel3"]);
    });

    test("an edited hash redraws the map", async ({ page }) => {
        await openMap(page, hashFor("5-8", "density"));
        await page.evaluate(h => { window.location.hash = h; }, hashFor("5-8", "age"));
        await page.waitForFunction(() => document.querySelector("#overlay-air_density.highlighted"));
        await waitForStableOverlay(page);
        await hideNondeterministicLayers(page);
        await expect(page).toHaveScreenshot("age-5-8-kpc.png");
    });
});

test("dragging the map changes the orientation in the hash", async ({ page }) => {
    await openMap(page, hashFor("5-8", "density", "orthographic"));
    await page.mouse.move(480, 300);
    await page.mouse.down();
    await page.mouse.move(530, 320, { steps: 5 });
    await page.mouse.up();
    await expect.poll(() => hashOf(page)).toMatch(/orthographic=-?\d+\.\d\d,-?\d+\.\d\d,\d+$/);
});
