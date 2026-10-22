import assert from "node:assert/strict";
import {test} from "node:test";
import {floorMod, formatVector, segmentedColorScale} from "../../public/js/util.js";

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

test("formatVector rounds the angle to 5 degrees", () => {
    const units = {precision: 1};
    assert.equal(formatVector([0, 10, 10], units), "180° @ 10.0");
});
