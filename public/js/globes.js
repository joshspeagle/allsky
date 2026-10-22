/**
 * globes - the map projections of the sky, each with its own onscreen behavior.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import {clamp, isValue} from "./util.js";

const d3 = window.d3;

// The default rotation of the globe, which turns the PanSTARRS footprint away from the center.
const DEFAULT_ROTATION = [230, 0];
const SPHERE = {type: "Sphere"};

function ensureNumber(num, fallback) {
    return Number.isFinite(num) || num === Infinity || num === -Infinity ? num : fallback;
}

/**
 * @param bounds the projection bounds: [[x0, y0], [x1, y1]]
 * @param view the view bounds {width:, height:}
 * @returns {Object} the projection bounds clamped to the specified view.
 */
function clampedBounds(bounds, view) {
    const upperLeft = bounds[0];
    const lowerRight = bounds[1];
    const x = Math.max(Math.floor(ensureNumber(upperLeft[0], 0)), 0);
    const y = Math.max(Math.floor(ensureNumber(upperLeft[1], 0)), 0);
    const xMax = Math.min(Math.ceil(ensureNumber(lowerRight[0], view.width)), view.width - 1);
    const yMax = Math.min(Math.ceil(ensureNumber(lowerRight[1], view.height)), view.height - 1);
    return {x, y, xMax, yMax, width: xMax - x + 1, height: yMax - y + 1};
}

/**
 * A globe with standard behavior. Each kind of globe gives its projection with newProjection(view), and may
 * override center(view) and the options of defineMap.
 */
class Globe {
    /**
     * @param newProjection function(view) that returns a new D3 projection of this globe for a view of the
     *        given size {width:, height:}.
     * @param view the size of the view as {width:, height:}.
     * @param options {center, fill, clipGraticule}: an override of center(view), the fill of the sphere
     *        ("gradient" for a shaded sphere), and whether to clip the graticule to the sphere (and omit the
     *        hemisphere lines).
     */
    constructor(newProjection, view, options = {}) {
        this.newProjection = newProjection;
        this.options = options;
        this.projection = newProjection(view);
    }

    /**
     * @param view the size of the view as {width:, height:}.
     * @returns {{x: Number, y: Number, xMax: Number, yMax: Number, width: Number, height: Number}}
     *          the bounds of the current projection clamped to the specified view.
     */
    bounds(view) {
        return clampedBounds(d3.geoPath(this.projection).bounds(SPHERE), view);
    }

    /**
     * @param view the size of the view as {width:, height:}.
     * @returns {Number} the projection scale at which the entire globe fits within the specified view.
     */
    fit(view) {
        const defaultProjection = this.newProjection(view);
        const bounds = d3.geoPath(defaultProjection).bounds(SPHERE);
        const hScale = (bounds[1][0] - bounds[0][0]) / defaultProjection.scale();
        const vScale = (bounds[1][1] - bounds[0][1]) / defaultProjection.scale();
        return Math.min(view.width / hScale, view.height / vScale) * 0.9;
    }

    /**
     * @param view the size of the view as {width:, height:}.
     * @returns {Array} the projection transform at which the globe is centered within the specified view.
     */
    center(view) {
        return this.options.center ? this.options.center(view) : [view.width / 2, view.height / 2];
    }

    /**
     * @returns {Array} the range at which this globe can be zoomed.
     */
    scaleExtent() {
        return [25, 3000];
    }

    /**
     * Returns the current orientation of this globe as a string. If the arguments are specified,
     * mutates this globe to match the specified orientation string, usually in the form "lat,lon,scale".
     *
     * @param [o] the orientation string
     * @param [view] the size of the view as {width:, height:}.
     */
    orientation(o, view) {
        const projection = this.projection, rotate = projection.rotate();
        if (isValue(o)) {
            const parts = o.split(","), λ = +parts[0], φ = +parts[1], scale = +parts[2];
            const extent = this.scaleExtent();
            projection.rotate(Number.isFinite(λ) && Number.isFinite(φ) ?
                [-λ, -φ, rotate[2]] :
                this.newProjection(view).rotate());
            projection.scale(Number.isFinite(scale) ? clamp(scale, extent[0], extent[1]) : this.fit(view));
            projection.translate(this.center(view));
            return this;
        }
        return [(-rotate[0]).toFixed(2), (-rotate[1]).toFixed(2), Math.round(projection.scale())].join(",");
    }

    /**
     * Returns an object that mutates this globe's current projection during a drag/zoom operation.
     * Each drag/zoom event invokes the move() method, and when the move is complete, the end() method
     * is invoked.
     *
     * @param startMouse starting mouse position.
     * @param startScale starting scale.
     */
    manipulator(startMouse, startScale) {
        const projection = this.projection;
        const sensitivity = 60 / startScale;  // seems to provide a good drag scaling factor
        const rotation = [projection.rotate()[0] / sensitivity, -projection.rotate()[1] / sensitivity];
        const original = projection.precision();
        projection.precision(original * 10);
        return {
            move(mouse, scale) {
                if (mouse) {
                    const xd = mouse[0] - startMouse[0] + rotation[0];
                    const yd = mouse[1] - startMouse[1] + rotation[1];
                    projection.rotate([xd * sensitivity, -yd * sensitivity, projection.rotate()[2]]);
                }
                projection.scale(scale);
            },
            end() {
                projection.precision(original);
            }
        };
    }

    /**
     * Draws a polygon on the specified context of this globe's boundary.
     * @param context a Canvas element's 2d context.
     * @returns the context
     */
    defineMask(context) {
        d3.geoPath(this.projection, context)(SPHERE);
        return context;
    }

    /**
     * Appends the SVG elements that render this globe.
     * @param mapSvg the primary map SVG container.
     * @param foregroundSvg the foreground SVG container.
     */
    defineMap(mapSvg, foregroundSvg) {
        const path = d3.geoPath(this.projection);
        const defs = mapSvg.append("defs");
        if (this.options.fill === "gradient") {
            const gradientFill = defs.append("radialGradient")
                .attr("id", "orthographic-fill")
                .attr("gradientUnits", "objectBoundingBox")
                .attr("cx", "50%").attr("cy", "49%").attr("r", "50%");
            gradientFill.append("stop").attr("stop-color", "#303030").attr("offset", "69%");
            gradientFill.append("stop").attr("stop-color", "#202020").attr("offset", "91%");
            gradientFill.append("stop").attr("stop-color", "#000005").attr("offset", "96%");
        }
        defs.append("path")
            .attr("id", "sphere")
            .datum(SPHERE)
            .attr("d", path);
        if (this.options.clipGraticule) {
            defs.append("clipPath")
                .attr("id", "clip")
                .append("use")
                .attr("href", "#sphere");
        }
        const background = mapSvg.append("use").attr("href", "#sphere");
        if (this.options.fill === "gradient") {
            background.attr("fill", "url(#orthographic-fill)");
        }
        else {
            background.attr("class", "background-sphere");
        }
        const graticule = mapSvg.append("path")
            .attr("class", "graticule")
            .datum(d3.geoGraticule())
            .attr("d", path);
        if (this.options.clipGraticule) {
            graticule.attr("clip-path", "url(#clip)");
        }
        else {
            mapSvg.append("path")
                .attr("class", "hemisphere")
                .datum(d3.geoGraticule().stepMinor([0, 90]).stepMajor([0, 90]))
                .attr("d", path);
        }
        foregroundSvg.append("use")
            .attr("href", "#sphere")
            .attr("class", "foreground-sphere");
    }
}

/**
 * The globe builders, by projection name. Each takes the size of the view as {width:, height:}.
 */
export const globes = new Map([
    ["atlantis", view => new Globe(() => d3.geoMollweide().rotate(DEFAULT_ROTATION).precision(0.1), view)],
    ["azimuthal_equidistant", view => new Globe(() =>
        d3.geoAzimuthalEquidistant().precision(0.1).rotate([0, -90]).clipAngle(180 - 0.001), view)],
    ["conic_equidistant", view => new Globe(() =>
        d3.geoConicEquidistant().center([0, 0]).rotate(DEFAULT_ROTATION).precision(0.1), view,
        {center: v => [v.width / 2, v.height / 2 + v.height * 0.065]})],
    ["equirectangular", view => new Globe(() => d3.geoEquirectangular().rotate(DEFAULT_ROTATION).precision(0.1), view)],
    ["orthographic", view => new Globe(() =>
        d3.geoOrthographic().rotate(DEFAULT_ROTATION).precision(0.1).clipAngle(90), view, {fill: "gradient"})],
    // The sphere's bounds are clipped to the view, so fit() depends on the default scale: keep d3 v3's 150.
    ["stereographic", view => new Globe(v =>
        d3.geoStereographic()
            .scale(150)
            .rotate([-43, -20])
            .precision(1.0)
            .clipAngle(180 - 0.0001)
            .clipExtent([[0, 0], [v.width, v.height]]), view)],
    ["waterman", view => new Globe(() => d3.geoPolyhedralWaterman().rotate([20, 0]).precision(0.1), view,
        {clipGraticule: true})],
    ["winkel3", view => new Globe(() => d3.geoWinkel3().precision(0.1), view)]
]);
