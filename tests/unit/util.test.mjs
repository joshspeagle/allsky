import assert from "node:assert/strict";
import {test} from "node:test";
import {formatVector, streamStep} from "../../public/js/util.js";

test("formatVector gives the direction of motion from north toward increasing longitude", () => {
    const units = {precision: 1};
    assert.equal(formatVector([0, 10, 10], units), "0° @ 10.0");
    assert.equal(formatVector([10, 0, 10], units), "90° @ 10.0");
    assert.equal(formatVector([0, -10, 10], units), "180° @ 10.0");
    assert.equal(formatVector([-10, 0, 10], units), "270° @ 10.0");
    assert.equal(formatVector([-1, 100, 100], units), "0° @ 100.0");  // 359.4 degrees rounds to 0, not 360
    assert.equal(formatVector([0, 0, 0], units), "0.0");
});

test("streamStep keeps the direction of the velocity and compresses its length to 0.4 |v|^0.7", () => {
    const [dx, dy] = streamStep(30, 40);  // |v| = 50, so the step is 0.4 * 50^0.7 = 6.185 long
    assert.ok(Math.abs(dx - 0.6 * 6.185) < 1e-3 && Math.abs(dy - 0.8 * 6.185) < 1e-3);
    assert.deepEqual(streamStep(0, 0), [0, 0]);
});
