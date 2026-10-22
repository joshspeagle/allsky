import assert from "node:assert/strict";
import {test} from "node:test";
import {floorMod, formatVector, quantile, segmentedColorScale, streamStep} from "../../public/js/util.js";

test("floorMod is never negative and never equals the modulus", () => {
    assert.equal(floorMod(-30, 360), 330);
    assert.equal(floorMod(725, 360), 5);
    assert.equal(floorMod(-1e-16, 10), 0);
});

test("segmentedColorScale clamps outside its segments and floors inside them", () => {
    const scale = segmentedColorScale([[0, [0, 0, 0]], [10, [100, 200, 255]]]);
    assert.deepEqual(scale(-5, 7), [0, 0, 0, 7]);
    assert.deepEqual(scale(15, 7), [100, 200, 255, 7]);
    assert.deepEqual(scale(5, 7), [50, 100, 127, 7]);
});

test("formatVector gives the direction of motion from north toward increasing longitude", () => {
    const units = {precision: 1};
    assert.equal(formatVector([0, 10, 10], units), "0° @ 10.0");
    assert.equal(formatVector([10, 0, 10], units), "90° @ 10.0");
    assert.equal(formatVector([0, -10, 10], units), "180° @ 10.0");
    assert.equal(formatVector([-10, 0, 10], units), "270° @ 10.0");
    assert.equal(formatVector([-1, 100, 100], units), "0° @ 100.0");  // 359.4 degrees rounds to 0, not 360
    assert.equal(formatVector([0, 0, 0], units), "0.0");
});

test("streamStep keeps the direction of the velocity and compresses its length", () => {
    for (const [u, v] of [[3, 4], [-10, 1], [0.5, -20], [100, 100]]) {
        const [dx, dy] = streamStep(u, v);
        assert.ok(Math.abs(Math.atan2(dy, dx) - Math.atan2(v, u)) < 1e-12);
        assert.ok(Math.abs(Math.hypot(dx, dy) - 0.4 * Math.pow(Math.hypot(u, v), 0.7)) < 1e-12);
    }
    assert.deepEqual(streamStep(0, 0), [0, 0]);
});

test("quantile picks the sorted element at floor(q * (n - 1))", () => {
    const values = [5, 1, 4, 2, 3, 10, 9, 8, 7, 6];
    assert.equal(quantile(values, 0), 1);
    assert.equal(quantile(values, 0.95), 9);
    assert.equal(quantile(values, 1), 10);
});
