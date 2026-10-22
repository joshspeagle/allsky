"use strict";

// Regression tests: they record what the map shows today, so that refactoring can be checked against it.
// Update the snapshots (npx playwright test --update-snapshots) only for an output change the lead approved.

const fs = require("fs");
const { test, expect, openMap, overlayDraws, waitForOverlayDraw, readoutAt, hashOf } = require("./helpers");

// The names the page uses for each distance bin, overlay and projection: the hash segment and the menu button id.
const PREFIX = "current/wind";
const BINS = {
    "0-2": { hash: "isobaric/250hPa", id: "isobaric-250hPa" },
    "1-3": { hash: "isobaric/1000hPa", id: "isobaric-1000hPa" },
    "2-4": { hash: "isobaric/850hPa", id: "isobaric-850hPa" },
    "3-6": { hash: "isobaric/700hPa", id: "isobaric-700hPa" },
    "5-8": { hash: "isobaric/500hPa", id: "isobaric-500hPa" },
    "7-11": { hash: "surface/level", id: "surface-level" },
    "10-15": { hash: "isobaric/70hPa", id: "isobaric-70hPa" },
    "13-25": { hash: "isobaric/20hPa", id: "isobaric-20hPa" },
    "20-50": { hash: "isobaric/10hPa", id: "isobaric-10hPa" }
};
const OVERLAYS = {
    none: { hash: "overlay=off", id: "overlay-off" },
    velocity: { hash: null, id: "overlay-wind" },
    density: { hash: "overlay=temp", id: "overlay-temp" },
    metallicity: { hash: "overlay=relative_humidity", id: "overlay-relative_humidity" },
    age: { hash: "overlay=air_density", id: "overlay-air_density" }
};
const PROJECTIONS = [
    "atlantis", "azimuthal_equidistant", "conic_equidistant", "equirectangular",
    "orthographic", "stereographic", "waterman", "winkel3"
];
const DEFAULT_PROJECTION = "atlantis";
const GRID = { hash: "grid=on", id: "option-show-grid" };

function hashFor(bin, overlay, projection) {
    return [PREFIX, BINS[bin].hash, OVERLAYS[overlay].hash, projection || DEFAULT_PROJECTION]
        .filter(Boolean).join("/");
}

// Pixels in the 960x600 view that land on observed sky, on masked sky and off the sphere, in the default view.
const PROBES = [[480, 140], [300, 200], [700, 230], [480, 300], [380, 420], [600, 470], [20, 20]];

test.describe("map pixels", () => {
    const cases = [
        ["default view", ""],
        ["velocity 0-2 kpc", hashFor("0-2", "velocity")],
        ["no overlay", hashFor("5-8", "none")],
        ["grid points", hashFor("5-8", "density") + "/" + GRID.hash],
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
            await openMap(page, hash);
            await expect(page).toHaveScreenshot(name.replace(/ /g, "-") + ".png");
        });
    }
});

test.describe("colour bars", () => {
    // The bar's width depends on whether the web font had loaded at start-up, so compare its colours at fixed
    // fractions of its width, with a tolerance of one pixel's change in colour.
    for (const overlay of ["velocity", "density", "metallicity", "age"]) {
        test(`${overlay} colour bar matches its snapshot`, async ({ page }) => {
            await openMap(page, hashFor("5-8", overlay));
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
            const expected = golden(`scale-${overlay}.json`, profile);
            expect(profile.length).toBe(expected.length);
            expect(Math.max(...profile.map((x, i) => Math.abs(x - expected[i])))).toBeLessThanOrEqual(6);
        });
    }
});

/**
 * Returns the stored value of a snapshot that is compared with a tolerance. Writes the actual value when
 * snapshots are being updated, and fails when the snapshot is missing.
 */
function golden(name, actual) {
    const file = test.info().snapshotPath(name);
    const update = test.info().config.updateSnapshots;
    if (update === "all" || update === "changed" || (update === "missing" && !fs.existsSync(file))) {
        fs.writeFileSync(file, JSON.stringify(actual) + "\n");
    }
    expect(fs.existsSync(file), `snapshot ${name} exists`).toBe(true);
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

test.describe("location readouts", () => {
    for (const bin of Object.keys(BINS)) {
        for (const overlay of ["density", "metallicity", "age"]) {
            test(`${overlay} ${bin} kpc readouts match their snapshot`, async ({ page }) => {
                await openMap(page, hashFor(bin, overlay));
                const readouts = [];
                for (const [x, y] of PROBES) {
                    readouts.push([x, y, await readoutAt(page, x, y)]);
                }
                expect(JSON.stringify(readouts, null, 1)).toMatchSnapshot(`readouts-${overlay}-${bin}.json`);
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
        hashFor("20-50", "none", "winkel3") + "/" + GRID.hash,
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
        const ids = Object.values(BINS).concat(Object.values(OVERLAYS)).map(b => b.id)
            .concat(PROJECTIONS, [GRID.id, GRID.id]);
        const hashes = [];
        for (const id of ids) {
            await page.click("#" + id);
            hashes.push([id, await hashOf(page)]);
        }
        expect(JSON.stringify(hashes, null, 1)).toMatchSnapshot("menu-hashes.json");
    });

    test("the active buttons are highlighted", async ({ page }) => {
        await openMap(page, hashFor("2-4", "metallicity", "winkel3"));
        const highlighted = await page.$$eval(".highlighted", els => els.map(e => e.id).sort());
        expect(highlighted).toEqual([BINS["2-4"].id, OVERLAYS.metallicity.id, "winkel3"].sort());
    });

    test("an edited hash redraws the map", async ({ page }) => {
        await openMap(page, hashFor("5-8", "density"));
        const draws = await overlayDraws(page);
        await page.evaluate(h => { window.location.hash = h; }, hashFor("5-8", "age"));
        await waitForOverlayDraw(page, draws);
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
