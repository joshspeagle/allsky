/**
 * util - math, formatting, color scales, timing and loading helpers.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

const τ = 2 * Math.PI;
const H = 0.0000360;  // step for finite differences, in degrees

/**
 * @returns {Boolean} true if the specified value is not null and not undefined.
 */
export function isValue(x) {
    return x !== null && x !== undefined;
}

/**
 * @returns {Number} the remainder of floored division, which is never negative for positive n. Useful for
 *          consistent modulo of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
 */
export function floorMod(a, n) {
    const f = a - n * Math.floor(a / n);
    // When a is extremely close to a multiple of n, f can round to n, outside [0, n). Example: a = -1e-16, n = 10.
    return f === n ? 0 : f;
}

/**
 * @returns {Number} distance between two points having the form [x, y].
 */
export function distance(a, b) {
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * @returns {Number} the value x clamped to the range [low, high].
 */
export function clamp(x, low, high) {
    return Math.max(low, Math.min(x, high));
}

/**
 * @returns {number} the fraction of the bounds [low, high] covered by the value x, after clamping x to the
 *          bounds. For example, given bounds=[10, 20], this method returns 1 for x>=20, 0.5 for x=15 and 0
 *          for x<=10.
 */
function proportion(x, low, high) {
    return (clamp(x, low, high) - low) / (high - low);
}

/**
 * @returns {number} the value p within the range [0, 1], scaled to the range [low, high].
 */
export function spread(p, low, high) {
    return p * (high - low) + low;
}

/**
 * @returns {Number} a random integer in [low, high], inclusive.
 */
export function randomInt(low, high) {
    return low + Math.floor(Math.random() * (high - low + 1));
}

/**
 * @returns {Boolean} true if agent is probably firefox. Don't really care if this is accurate.
 */
export function isFF() {
    return (/firefox/i).test(navigator.userAgent);
}

/**
 * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
 */
export function isMobile() {
    return (/android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i).test(navigator.userAgent);
}

export function isEmbeddedInIFrame() {
    return window !== window.top;
}

/**
 * Returns a function that calls f once, wait milliseconds after the last of a series of calls, with the arguments
 * of that last call.
 */
export function debounce(f, wait) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => f(...args), wait);
    };
}

/**
 * Returns a function that calls f at most once every wait milliseconds, at the end of each interval.
 */
export function throttle(f, wait) {
    let timer = null;
    return () => {
        if (timer === null) {
            timer = setTimeout(() => {
                timer = null;
                f();
            }, wait);
        }
    };
}

function format(o) {
    return o && o.stack ? o + "\n" + o.stack : o;
}

/**
 * Writes messages to the console.
 */
export const log = {
    debug: s => console.log(format(s)),
    error: e => console.error(format(e)),
    time: s => console.time(s),
    timeEnd: s => console.timeEnd(s)
};

/**
 * @returns {{width: Number, height: Number}} the size of the browser's current view.
 */
export function view() {
    const d = document.documentElement;
    return {width: window.innerWidth || d.clientWidth, height: window.innerHeight || d.clientHeight};
}

/**
 * Clears the specified Canvas element and returns it.
 */
export function clearCanvas(canvas) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return canvas;
}

function colorInterpolator(start, end) {
    const r = start[0], g = start[1], b = start[2];
    const Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
    return (i, a) => [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
}

/**
 * @returns {Number} the value below which the fraction q of the values lie: the element at index
 *          floor(q * (n - 1)) of the sorted values.
 */
export function quantile(values, q) {
    const sorted = Float64Array.from(values).sort();
    return sorted[Math.floor(q * (sorted.length - 1))];
}

/**
 * Returns the screen step [dx, dy] of a particle for one frame, from the velocity vector [u, v] in pixels per
 * frame. The step keeps the vector's direction, and its length is 0.4 * |v|^0.7, which compresses the wide range
 * of speeds so that both slow and fast streams stay visible.
 */
export function streamStep(u, v) {
    const length = Math.hypot(u, v);
    if (length === 0) {
        return [0, 0];
    }
    const f = 0.4 * Math.pow(length, -0.3);
    return [f * u, f * v];
}

/**
 * @returns {Array} of particle colors, and a method, indexFor, that maps a speed to an index on the color scale.
 */
export function particleColorScale(step, maxSpeed) {
    const result = [];
    for (let j = 85; j <= 255; j += step) {
        result.push(`rgba(${j}, ${j}, ${j}, 1)`);
    }
    result.indexFor = m => Math.floor(Math.min(m, maxSpeed) / maxSpeed * (result.length - 1));
    return result;
}

/**
 * Creates a color scale composed of the specified segments. Segments is an array of two-element arrays of the
 * form [value, color], where value is the point along the scale and color is the [r, g, b] color at that point.
 * For example, the following creates a scale that smoothly transitions from red to green to blue along the
 * points 0.5, 1.0, and 3.5:
 *
 *     [ [ 0.5, [255, 0, 0] ],
 *       [ 1.0, [0, 255, 0] ],
 *       [ 3.5, [0, 0, 255] ] ]
 *
 * @param segments array of color segments
 * @returns {Function} a function(point, alpha) that returns the color [r, g, b, alpha] for the given point.
 */
export function segmentedColorScale(segments) {
    const points = [], interpolators = [], ranges = [];
    for (let i = 0; i < segments.length - 1; i++) {
        points.push(segments[i + 1][0]);
        interpolators.push(colorInterpolator(segments[i][1], segments[i + 1][1]));
        ranges.push([segments[i][0], segments[i + 1][0]]);
    }

    return (point, alpha) => {
        let i;
        for (i = 0; i < points.length - 1; i++) {
            if (point <= points[i]) {
                break;
            }
        }
        const range = ranges[i];
        return interpolators[i](proportion(point, range[0], range[1]), alpha);
    };
}

/**
 * Returns a human readable string for the provided coordinates.
 */
export function formatCoordinates(λ, φ) {
    return λ.toFixed(2) + "° ℓ" + ", " + φ.toFixed(2) + "° b";
}

/**
 * Returns a human readable string for the provided scalar, with the precision of the given units.
 */
export function formatScalar(value, units) {
    return value.toFixed(units.precision);
}

/**
 * Returns a human readable string for the provided rectangular vector in the given units.
 */
export function formatVector(vector, units) {
    const d = Math.atan2(-vector[0], -vector[1]) / τ * 360;  // the direction the vector comes from, in degrees
    const wd = Math.round((d + 360) % 360 / 5) * 5;  // shift [-180, 180] to [0, 360], and round to nearest 5.
    return wd.toFixed(0) + "° @ " + formatScalar(vector[2], units);
}

/**
 * Returns a promise for a JSON resource (URL), which the abort signal can cancel. If the load fails, the promise
 * rejects with an object describing the reason: {status: http-status-code, message: http-status-text, resource:},
 * with status -1 when the server cannot be reached.
 */
export async function loadJson(resource, signal) {
    let response;
    try {
        response = await fetch(resource, {signal});
    }
    catch (e) {
        throw signal && signal.aborted ? e : {status: -1, message: "Cannot load resource: " + resource, resource};
    }
    if (!response.ok) {
        throw {status: response.status, message: response.statusText, resource};
    }
    return response.json();
}

/**
 * Returns the distortion introduced by the specified projection at the given point.
 *
 * This method uses finite difference estimates to calculate warping by adding a very small amount (h) to
 * both the longitude and latitude to create two lines. These lines are then projected to pixel space, where
 * they become diagonals of triangles that represent how much the projection warps longitude and latitude at
 * that location.
 *
 * <pre>
 *        (λ, φ+h)                  (xλ, yλ)
 *           .                         .
 *           |               ==>        \
 *           |                           \   __. (xφ, yφ)
 *    (λ, φ) .____. (λ+h, φ)       (x, y) .--
 * </pre>
 *
 * See:
 *     Map Projections: A Working Manual, Snyder, John P: pubs.er.usgs.gov/publication/pp1395
 *     gis.stackexchange.com/questions/5068/how-to-create-an-accurate-tissot-indicatrix
 *     www.jasondavies.com/maps/tissot
 *
 * @returns {Array} array of scaled derivatives [dx/dλ, dy/dλ, dx/dφ, dy/dφ]
 */
export function distortion(projection, λ, φ, x, y) {
    const hλ = λ < 0 ? H : -H;
    const hφ = φ < 0 ? H : -H;
    const pλ = projection([λ + hλ, φ]);
    const pφ = projection([λ, φ + hφ]);

    // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1° λ
    // changes depending on φ. Without this, there is a pinching effect at the poles.
    const k = Math.cos(φ / 360 * τ);

    return [
        (pλ[0] - x) / hλ / k,
        (pλ[1] - y) / hλ / k,
        (pφ[0] - x) / hφ,
        (pφ[1] - y) / hφ
    ];
}
