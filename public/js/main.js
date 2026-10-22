/**
 * main - the page wiring, field interpolation, particle animation and overlay of allsky.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import {Agent} from "./agent.js";
import {Configuration} from "./configuration.js";
import {Emitter} from "./events.js";
import {SCALE_EXTENT, newGlobe, projectionNames} from "./globes.js";
import {bins, overlays, productsFor} from "./products.js";
import * as µ from "./util.js";

const d3 = window.d3;
const log = µ.log;

const MAX_TASK_TIME = 100;                  // amount of time before a task yields control (millis)
const MIN_SLEEP_TIME = 25;                  // amount of time a task waits before resuming (millis)
const MIN_MOVE = 4;                         // slack before a drag operation beings (pixels)
const MOVE_END_WAIT = 1000;                 // time to wait for a move operation to be considered done (millis)
const REDRAW_WAIT = 5;                      // time to wait between redraws of the map during a move (millis)

const OVERLAY_ALPHA = Math.floor(0.75 * 255);  // overlay transparency (on scale [0, 255])
const INTENSITY_SCALE_STEP = 10;            // step size of particle intensity color scale
const MAX_PARTICLE_AGE = 100;               // max number of frames a particle is drawn before regeneration
const PARTICLE_LINE_WIDTH = 1.0;            // line width of a drawn particle
const PARTICLE_MULTIPLIER = 7;              // particle count scalar (completely arbitrary--this values looks nice)
const PARTICLE_REDUCTION = 0.75;            // reduce particle count to this much of normal for mobile devices
const FRAME_RATE = 40;                      // desired milliseconds per frame

const OUTSIDE_VECTOR = [NaN, NaN, null];    // singleton for undefined location outside the vector field [u, v, mag]
const HOLE_VECTOR = [NaN, NaN, null];       // singleton that signifies a hole in the vector field
const TRANSPARENT_BLACK = [0, 0, 0, 0];     // singleton 0 rgba
const REMAINING = "▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫▫";   // glyphs for remaining progress bar
const COMPLETED = "▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪";   // glyphs for completed progress bar

let view = µ.view();

/**
 * An object to display various types of messages to the user.
 */
const report = (() => {
    const s = d3.select("#status"), p = d3.select("#progress"), total = REMAINING.length;
    return {
        status(msg) {
            return s.classed("bad") ? s : s.text(msg);  // errors are sticky until reset
        },
        error(err) {
            let msg = err.status ? err.status + " " + err.message : err;
            switch (err.status) {
                case -1: msg = "Server Down"; break;
                case 404: msg = "No Data"; break;
            }
            log.error(err);
            return s.classed("bad", true).text(msg);
        },
        reset() {
            return s.classed("bad", false).text("");
        },
        progress(amount) {  // amount of progress to report in the range [0, 1]
            if (0 <= amount && amount < 1) {
                const i = Math.ceil(amount * total);
                const bar = COMPLETED.substr(0, i) + REMAINING.substr(0, total - i);
                return p.classed("invisible", false).text(bar);
            }
            return p.classed("invisible", true).text("");  // progress complete
        }
    };
})();

function newAgent() {
    const agent = new Agent();
    agent.on({reject: report.error, fail: report.error});
    return agent;
}

// Construct the page's main internal components:

const configuration = new Configuration({bins, overlays, projections: projectionNames});  // the page's settings
const inputController = buildInputController();                 // interprets drag/zoom operations
const globeAgent = newAgent();     // the model of the globe
const gridAgent = newAgent();      // the data grids of the current layer
const rendererAgent = newAgent();  // the globe SVG renderer
const fieldAgent = newAgent();     // the interpolated velocity field
const animatorAgent = newAgent();  // the particle animator
const overlayAgent = newAgent();   // color overlay over the animation

/**
 * The input controller is an object that translates move operations (drag and/or zoom) into mutations of the
 * current globe's projection, and emits events so other page components can react to these move operations.
 *
 * D3's zoom behavior is used to bind to the document's drag/zoom events, and the input controller interprets
 * D3's events as move operations on the globe. This method is complicated due to the complex event behavior
 * that occurs during drag and zoom.
 *
 * D3 move operations usually occur as "start" -> ("zoom")* -> "end" event chain. During "zoom" events the scale
 * and mouse may change, implying a zoom or drag operation accordingly. These operations are quite noisy. What
 * should otherwise be one smooth continuous zoom is usually comprised of several "start" -> "zoom" -> "end" event
 * chains. A debouncer is used to eliminate the noise by waiting a short period of time to ensure the user has
 * finished the move operation.
 *
 * The "zoom" events may not occur; a simple click operation occurs as: "start" -> "end". There is additional
 * logic for other corner cases, such as spurious drags which move the globe just a few pixels (most likely
 * unintentional), and the tendency for some touch devices to issue events out of order: "zoom" -> "start" ->
 * "end". Events with no source event come from setting the zoom scale in code, and are ignored.
 *
 * This object emits clean "moveStart" -> ("move")* -> "moveEnd" events for move operations, and "click" events
 * for normal clicks. Spurious moves emit no events.
 */
/**
 * @returns {Array} the position [x, y] of an event's pointer relative to the node. For a touch event, it is the
 *          position of the first changed touch, which a touchend still has.
 */
function pointerOf(event, node) {
    return d3.pointer(event.changedTouches ? event.changedTouches[0] : event, node);
}

function buildInputController() {
    let globe, op = null;
    const display = d3.select("#display");

    /**
     * @returns {Object} an object to represent the state for one move operation.
     */
    function newOp(startMouse, startScale) {
        return {
            type: "click",  // initially assumed to be a click operation
            startMouse,
            startScale,
            manipulator: globe.manipulator(startMouse, startScale)
        };
    }

    // The filter and the wheel step are d3 v3's: every button drags, and a wheel step does not depend on ctrlKey.
    const zoom = d3.zoom()
        .filter(() => true)
        .wheelDelta(event => -event.deltaY * (event.deltaMode ? 120 : 1) * 0.002)
        .on("start", function(event) {
            if (event.sourceEvent && globe) {
                op = op || newOp(pointerOf(event.sourceEvent, this), event.transform.k);  // a new operation begins
            }
        })
        .on("zoom", function(event) {
            if (!event.sourceEvent || !globe) return;
            const currentMouse = pointerOf(event.sourceEvent, this), currentScale = event.transform.k;
            op = op || newOp(currentMouse, 1);  // Fix bug on some browsers where start fires out of order.
            if (op.type === "click" || op.type === "spurious") {
                const distanceMoved = µ.distance(currentMouse, op.startMouse);
                if (currentScale === op.startScale && distanceMoved < MIN_MOVE) {
                    // to reduce annoyance, ignore op if mouse has barely moved and no zoom is occurring
                    op.type = distanceMoved > 0 ? "click" : "spurious";
                    return;
                }
                dispatch.trigger("moveStart");
                op.type = "drag";
            }
            if (currentScale !== op.startScale) {
                op.type = "zoom";  // whenever a scale change is detected, (stickily) switch to a zoom operation
            }

            // when zooming, ignore whatever the mouse is doing--really cleans up behavior on touch devices
            op.manipulator.move(op.type === "zoom" ? null : currentMouse, currentScale);
            dispatch.trigger("move");
        })
        .on("end", function(event) {
            if (!event.sourceEvent || !op) return;
            op.manipulator.end();
            if (op.type === "click") {
                dispatch.trigger("click", op.startMouse, globe.projection.invert(op.startMouse) || []);
            }
            else if (op.type !== "spurious") {
                signalEnd();
            }
            op = null;  // the drag/zoom/click operation is over
        });

    const signalEnd = µ.debounce(() => {
        if (!op || op.type !== "drag" && op.type !== "zoom") {
            configuration.save({orientation: globe.orientation()});
            dispatch.trigger("moveEnd");
        }
    }, MOVE_END_WAIT);  // wait for a bit to decide if user has stopped moving the globe

    display.call(zoom).on("dblclick.zoom", function(event) {
        // Zoom to the next power of two (the previous with shift), as d3 v3 did.
        const k = Math.log2(d3.zoomTransform(this).k);
        zoom.scaleTo(display, 2 ** (event.shiftKey ? Math.ceil(k) - 1 : Math.floor(k) + 1), pointerOf(event, this), event);
    });

    // Sets the globe to the orientation of the configuration. After a move this rounds the orientation to the
    // precision of the hash, so the view always matches its URL.
    function reorient() {
        if (!globe) return;
        dispatch.trigger("moveStart");
        globe.orientation(configuration.get("orientation"), view);
        display.call(zoom.scaleTo, globe.projection.scale());
        dispatch.trigger("moveEnd");
    }

    const dispatch = Object.assign(new Emitter(), {
        globe(g) {
            globe = g;
            zoom.scaleExtent(SCALE_EXTENT);
            reorient();
        }
    });
    configuration.on("change:orientation", reorient);
    return dispatch;
}

function buildGlobe(signal, projectionName) {
    if (!projectionNames.has(projectionName)) {
        throw "Unknown projection: " + projectionName;
    }
    return newGlobe(projectionName, view);
}

function buildGrids(signal) {
    report.status("Downloading...");
    const layers = productsFor(configuration.attributes);
    log.time("build grids");
    // Keep the loaded vector grid when only the overlay changes.
    const previous = (gridAgent.value() || {}).primaryGrid;
    const load = product => previous && product.path === previous.path ? previous : product.load(signal);
    return Promise.all(layers.map(load)).then(products => {
        return {primaryGrid: products[0], overlayGrid: products[1] || products[0]};
    }).finally(() => {
        log.timeEnd("build grids");
    });
}

let stopRendererListening = () => {};  // removes the input controller listeners of the current renderer

function buildRenderer(signal, globe) {
    report.status("Rendering Globe...");
    log.time("rendering map");

    stopRendererListening();

    // First clear map and foreground svg contents.
    d3.select("#map").node().replaceChildren();
    d3.select("#foreground").node().replaceChildren();
    // Create new map svg elements.
    globe.defineMap(d3.select("#map"), d3.select("#foreground"));

    const path = d3.geoPath(globe.projection).pointRadius(7);
    d3.selectAll("path").attr("d", path);  // do an initial draw -- fixes issue with safari

    function drawLocationMark(point, coord) {
        // show the location on the map if defined
        if (fieldAgent.value() && !fieldAgent.value().isInsideBoundary(point[0], point[1])) {
            // Sometimes this is invoked on an old, released field, because the new one has not been built yet,
            // causing the mark to not get drawn.
            return;  // outside the field boundary, so ignore.
        }
        if (coord && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
            let mark = d3.select(".location-mark");
            if (!mark.node()) {
                mark = d3.select("#foreground").append("path").attr("class", "location-mark");
            }
            mark.datum({type: "Point", coordinates: coord}).attr("d", path);
        }
    }

    // Draw the location mark if one is currently visible.
    if (activeLocation.point && activeLocation.coord) {
        drawLocationMark(activeLocation.point, activeLocation.coord);
    }

    // Throttled draw method helps with slow devices that would get overwhelmed by too many redraw events.
    const drawThrottled = µ.throttle(() => {
        d3.selectAll("path").attr("d", path);
        rendererAgent.trigger("redraw");
    }, REDRAW_WAIT);

    // Attach to map rendering events on input controller.
    stopRendererListening = inputController.on({
        moveStart() {
            rendererAgent.trigger("start");
        },
        move() {
            drawThrottled();
        },
        moveEnd() {
            d3.selectAll("path").attr("d", path);
            rendererAgent.trigger("render");
        },
        click: drawLocationMark
    });

    // Finally, inject the globe model into the input controller. Do it on the next event turn to ensure
    // renderer is fully set up before events start flowing.
    setTimeout(() => inputController.globe(globe), 0);

    log.timeEnd("rendering map");
    return globe;
}

function createMask(globe) {
    if (!globe) return null;

    log.time("render mask");

    // Create a detached canvas, ask the model to define the mask polygon, then fill with an opaque color.
    const width = view.width, height = view.height;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = globe.defineMask(canvas.getContext("2d", {willReadFrequently: true}));
    context.fillStyle = "rgba(255, 0, 0, 1)";
    context.fill();

    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;  // layout: [r, g, b, a, r, g, b, a, ...]
    log.timeEnd("render mask");
    return {
        imageData,
        isVisible(x, y) {
            const i = (y * width + x) * 4;
            return data[i + 3] > 0;  // non-zero alpha means pixel is visible
        },
        set(x, y, rgba) {
            const i = (y * width + x) * 4;
            data[i] = rgba[0];
            data[i + 1] = rgba[1];
            data[i + 2] = rgba[2];
            data[i + 3] = rgba[3];
            return this;
        }
    };
}

function createField(columns, bounds, mask) {

    /**
     * @returns {Array} the velocity vector [u, v, magnitude] at the point (x, y), or [NaN, NaN, null] if the field
     *          is undefined at that point.
     */
    function field(x, y) {
        const column = columns[Math.round(x)];
        return column && column[Math.round(y)] || OUTSIDE_VECTOR;
    }

    /**
     * @returns {boolean} true if the field is valid at the point (x, y)
     */
    field.isDefined = (x, y) => field(x, y)[2] !== null;

    /**
     * @returns {boolean} true if the point (x, y) lies inside the outer boundary of the vector field, even if
     *          the vector field has a hole (is undefined) at that point, such as at an unobserved region
     *          of the sky.
     */
    field.isInsideBoundary = (x, y) => field(x, y) !== OUTSIDE_VECTOR;

    // Frees the massive "columns" array for GC, in case the field outlives its animation.
    field.release = () => {
        columns = [];
    };

    // Moves the object o to a random point of the field, trying up to 30 points to find one that is defined.
    field.randomize = o => {
        let x, y;
        let safetyNet = 0;
        do {
            x = µ.randomInt(bounds.x, bounds.xMax);
            y = µ.randomInt(bounds.y, bounds.yMax);
        } while (!field.isDefined(x, y) && safetyNet++ < 30);
        o.x = x;
        o.y = y;
        return o;
    };

    field.overlay = mask.imageData;

    return field;
}

/**
 * Calculate distortion of the velocity vector caused by the shape of the projection at point (x, y). The
 * vector is modified in place and returned by this function.
 */
function distort(projection, λ, φ, x, y, scale, vector) {
    const u = vector[0] * scale;
    const v = vector[1] * scale;
    const d = µ.distortion(projection, λ, φ, x, y);

    // Scale distortion vectors by u and v, then add.
    vector[0] = d[0] * u + d[2] * v;
    vector[1] = d[1] * u + d[3] * v;
    return vector;
}

function interpolateField(signal, globe, grids) {
    if (!globe || !grids) return null;

    const mask = createMask(globe);
    const primaryGrid = grids.primaryGrid;
    const overlayGrid = grids.overlayGrid;

    log.time("interpolating field");

    const projection = globe.projection;
    const bounds = globe.bounds(view);
    // How fast particles move on the screen (arbitrary value chosen for aesthetics).
    const velocityScale = bounds.height * primaryGrid.particles.velocityScale;

    const columns = [];
    const point = [];
    let x = bounds.x;
    const interpolate = primaryGrid.interpolate;
    const overlayInterpolate = overlayGrid.interpolate;
    const hasDistinctOverlay = primaryGrid !== overlayGrid;
    const scale = overlayGrid.scale;

    function interpolateColumn(x) {
        const column = [];
        for (let y = bounds.y; y <= bounds.yMax; y += 2) {
            if (mask.isVisible(x, y)) {
                point[0] = x; point[1] = y;
                const coord = projection.invert(point);
                let color = TRANSPARENT_BLACK;
                let vector = null;
                if (coord) {
                    const λ = coord[0], φ = coord[1];
                    if (Number.isFinite(λ)) {
                        vector = interpolate(λ, φ);
                        let scalar = null;
                        if (vector) {
                            vector = distort(projection, λ, φ, x, y, velocityScale, vector);
                            scalar = vector[2];
                        }
                        if (hasDistinctOverlay) {
                            scalar = overlayInterpolate(λ, φ);
                        }
                        if (µ.isValue(scalar)) {
                            color = scale.gradient(scalar, OVERLAY_ALPHA);
                        }
                    }
                }
                column[y + 1] = column[y] = vector || HOLE_VECTOR;
                mask.set(x, y, color).set(x + 1, y, color).set(x, y + 1, color).set(x + 1, y + 1, color);
            }
        }
        columns[x + 1] = columns[x] = column;
    }

    report.status("");

    return new Promise((resolve, reject) => {
        (function batchInterpolate() {
            try {
                if (!signal.aborted) {
                    const start = Date.now();
                    while (x < bounds.xMax) {
                        interpolateColumn(x);
                        x += 2;
                        if ((Date.now() - start) > MAX_TASK_TIME) {
                            // Interpolation is taking too long. Schedule the next batch for later and yield.
                            report.progress((x - bounds.x) / (bounds.xMax - bounds.x));
                            setTimeout(batchInterpolate, MIN_SLEEP_TIME);
                            return;
                        }
                    }
                }
                resolve(createField(columns, bounds, mask));
            }
            catch (e) {
                reject(e);
            }
            report.progress(1);  // 100% complete
            log.timeEnd("interpolating field");
        })();
    });
}

function animate(signal, globe, field, grids) {
    if (!globe || !field || !grids) return;

    const bounds = globe.bounds(view);
    // maxIntensity is the velocity at which particle color intensity is maximum
    const colorStyles = µ.particleColorScale(INTENSITY_SCALE_STEP, grids.primaryGrid.particles.maxIntensity);
    const buckets = colorStyles.map(() => []);
    let particleCount = Math.round(bounds.width * PARTICLE_MULTIPLIER);
    if (µ.isMobile()) {
        particleCount *= PARTICLE_REDUCTION;
    }
    const fadeFillStyle = µ.isFF() ? "rgba(0, 0, 0, 0.95)" : "rgba(0, 0, 0, 0.97)";  // FF Mac alpha behaves oddly

    log.debug("particle count: " + particleCount);
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(field.randomize({age: µ.randomInt(0, MAX_PARTICLE_AGE)}));
    }

    function evolve() {
        buckets.forEach(bucket => { bucket.length = 0; });
        particles.forEach(particle => {
            if (particle.age > MAX_PARTICLE_AGE) {
                field.randomize(particle).age = 0;
            }
            const x = particle.x;
            const y = particle.y;
            const v = field(x, y);  // vector at current position
            const m = v[2];
            if (m === null) {
                particle.age = MAX_PARTICLE_AGE;  // particle has escaped the grid, never to return...
            }
            else {
                const xt = x + 0.4 * Math.sign(v[0]) * Math.pow(Math.abs(v[0]), 0.7);
                const yt = y + 0.4 * Math.sign(v[1]) * Math.pow(Math.abs(v[1]), 0.7);
                if (field.isDefined(xt, yt)) {
                    // Path from (x,y) to (xt,yt) is visible, so add this particle to the appropriate draw bucket.
                    particle.xt = xt;
                    particle.yt = yt;
                    buckets[colorStyles.indexFor(m)].push(particle);
                }
                else {
                    // Particle isn't visible, but it still moves through the field.
                    particle.x = xt;
                    particle.y = yt;
                }
            }
            particle.age += 1;
        });
    }

    const g = d3.select("#animation").node().getContext("2d");
    g.lineWidth = PARTICLE_LINE_WIDTH;
    g.fillStyle = fadeFillStyle;

    function draw() {
        // Fade existing particle trails.
        const prev = g.globalCompositeOperation;
        g.globalCompositeOperation = "destination-in";
        g.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
        g.globalCompositeOperation = prev;

        // Draw new particle trails.
        buckets.forEach((bucket, i) => {
            if (bucket.length > 0) {
                g.beginPath();
                g.strokeStyle = colorStyles[i];
                bucket.forEach(particle => {
                    g.moveTo(particle.x, particle.y);
                    g.lineTo(particle.xt, particle.yt);
                    particle.x = particle.xt;
                    particle.y = particle.yt;
                });
                g.stroke();
            }
        });
    }

    (function frame() {
        try {
            if (signal.aborted) {
                field.release();
                return;
            }
            evolve();
            draw();
            setTimeout(frame, FRAME_RATE);
        }
        catch (e) {
            report.error(e);
        }
    })();
}

function drawGridPoints(ctx, grid, globe) {
    if (!grid || !globe || !configuration.get("showGrid")) return;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    // Use the clipping behavior of a projection stream to quickly draw visible points.
    const stream = globe.projection.stream({
        point(x, y) {
            ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        },
        lineStart() {},
        lineEnd() {},
        polygonStart() {},
        polygonEnd() {},
        sphere() {}
    });
    grid.forEachPoint((λ, φ, d) => {
        if (µ.isValue(d)) {
            stream.point(λ, φ);
        }
    });
}

function drawOverlay(signal, field, overlay) {
    if (!field) return;

    const ctx = d3.select("#overlay").node().getContext("2d"), grid = (gridAgent.value() || {}).overlayGrid;

    µ.clearCanvas(d3.select("#overlay").node());
    µ.clearCanvas(d3.select("#scale").node());
    if (overlay) {
        if (overlay !== "none") {
            ctx.putImageData(field.overlay, 0, 0);
        }
        drawGridPoints(ctx, grid, globeAgent.value());
    }

    if (grid) {
        // Draw color bar for reference.
        const colorBar = d3.select("#scale"), scale = grid.scale, bounds = scale.bounds;
        const c = colorBar.node(), g = c.getContext("2d"), n = c.width - 1;
        for (let i = 0; i <= n; i++) {
            const rgb = scale.gradient(µ.spread(i / n, bounds[0], bounds[1]), 1);
            g.fillStyle = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
            g.fillRect(i, 0, 1, c.height);
        }

        // Show tooltip on hover.
        colorBar.on("mousemove", function(event) {
            const x = d3.pointer(event, this)[0];
            const pct = µ.clamp((Math.round(x) - 2) / (n - 2), 0, 1);
            const value = µ.spread(pct, bounds[0], bounds[1]);
            colorBar.attr("title", µ.formatScalar(value, grid.units) + " " + grid.units.label);
        });
    }
}

/**
 * Displays a readout at a location: its text in the element with the given id, and the units in id + "-units".
 */
function showReadout(id, text, units) {
    d3.select("#" + id).text(text);
    d3.select("#" + id + "-units").text(units.label);
}

// Stores the point and coordinate of the currently visible location. This is used to update the location
// details when the field changes.
let activeLocation = {};

/**
 * Display a local data callout at the given [x, y] point and its corresponding [lon, lat] coordinates.
 * The location may not be valid, in which case no callout is displayed. Display location data for both
 * the primary grid and overlay grid, performing interpolation when necessary.
 */
function showLocationDetails(point = [], coord = []) {
    const grids = gridAgent.value(), field = fieldAgent.value(), λ = coord[0], φ = coord[1];
    if (!field || !field.isInsideBoundary(point[0], point[1])) {
        return;
    }

    clearLocationDetails(false);  // clean the slate
    activeLocation = {point, coord};  // remember where the current location is

    if (Number.isFinite(λ) && Number.isFinite(φ)) {
        d3.select("#location-coord").text(µ.formatCoordinates(λ, φ));
        d3.select("#location-close").classed("invisible", false);
    }

    if (field.isDefined(point[0], point[1]) && grids) {
        const vector = grids.primaryGrid.interpolate(λ, φ);
        if (µ.isValue(vector)) {
            showReadout("location-velocity", µ.formatVector(vector, grids.primaryGrid.units), grids.primaryGrid.units);
        }
        if (grids.overlayGrid !== grids.primaryGrid) {
            const value = grids.overlayGrid.interpolate(λ, φ);
            if (µ.isValue(value)) {
                showReadout("location-value", µ.formatScalar(value, grids.overlayGrid.units), grids.overlayGrid.units);
            }
        }
    }
}

function updateLocationDetails() {
    showLocationDetails(activeLocation.point, activeLocation.coord);
}

function clearLocationDetails(clearEverything) {
    d3.select("#location-coord").text("");
    d3.select("#location-close").classed("invisible", true);
    d3.select("#location-velocity").text("");
    d3.select("#location-velocity-units").text("");
    d3.select("#location-value").text("");
    d3.select("#location-value-units").text("");
    if (clearEverything) {
        activeLocation = {};
        d3.select(".location-mark").remove();
    }
}

function stopCurrentAnimation(alsoClearCanvas) {
    animatorAgent.cancel();
    if (alsoClearCanvas) {
        µ.clearCanvas(d3.select("#animation").node());
    }
}

/**
 * Registers a click event handler for the DOM element, which modifies the configuration to have
 * the attributes represented by newAttr. An event listener is also registered for configuration change events,
 * so when a change occurs the button becomes highlighted (i.e., class ".highlighted" is assigned or removed) if
 * the configuration matches the attributes for this button. The set of attributes used for the matching is taken
 * from newAttr, unless a custom set of keys is provided.
 */
function bindButtonToConfiguration(element, newAttr, keys = Object.keys(newAttr)) {
    d3.select(element).on("click", () => configuration.save(newAttr));
    configuration.on("change", () => {
        d3.select(element).classed("highlighted", keys.every(key => configuration.get(key) === newAttr[key]));
    });
}

/**
 * Registers all event handlers to bind components and page elements together.
 */
function init() {
    report.status("Initializing...");

    d3.selectAll(".fill-screen").attr("width", view.width).attr("height", view.height);
    // Adjust size of the scale canvas to fill the width of the menu to the right of the label.
    const label = d3.select("#scale-label").node();
    d3.select("#scale")
        .attr("width", (d3.select("#menu").node().offsetWidth - label.offsetWidth) * 0.97)
        .attr("height", label.offsetHeight / 2);

    d3.select("#show-menu").on("click", () => {
        if (µ.isEmbeddedInIFrame()) {
            window.open(window.location.href, "_blank");
        }
        else {
            d3.select("#menu").classed("invisible", !d3.select("#menu").classed("invisible"));
        }
    });

    // Tweak document to distinguish CSS styling between touch and non-touch environments.
    if ("ontouchstart" in document.documentElement) {
        d3.select(document).on("touchstart", () => {});  // this enables the :active pseudoclass
    }
    else {
        d3.select(document.documentElement).classed("no-touch", true);  // to filter styles problematic for touch
    }

    // Bind configuration to URL bar changes.
    d3.select(window).on("hashchange", () => {
        log.debug("hashchange");
        configuration.onHashChange();
    });

    configuration.on("change", report.reset);

    configuration.on("change:projection", projection => {
        globeAgent.submit(buildGlobe, projection);
    });

    configuration.on("change", changed => {
        // Build new grids for a new bin, or for an overlay that the current grids do not hold.
        const overlay = configuration.get("overlay"), overlayGrid = (gridAgent.value() || {}).overlayGrid;
        if (changed.includes("bin") ||
            changed.includes("overlay") && overlay !== "none" && (!overlayGrid || overlayGrid.type !== overlay)) {
            gridAgent.submit(buildGrids);
        }
    });

    globeAgent.on("update", globe => {
        rendererAgent.submit(buildRenderer, globe);
    });

    function startInterpolation() {
        fieldAgent.submit(interpolateField, globeAgent.value(), gridAgent.value());
    }
    function cancelInterpolation() {
        fieldAgent.cancel();
    }
    gridAgent.on("update", startInterpolation);
    rendererAgent.on("render", startInterpolation);
    rendererAgent.on("start", cancelInterpolation);
    rendererAgent.on("redraw", cancelInterpolation);

    fieldAgent.on("update", field => {
        animatorAgent.submit(animate, globeAgent.value(), field, gridAgent.value());
    });
    rendererAgent.on("start", () => stopCurrentAnimation(true));
    gridAgent.on("submit", () => stopCurrentAnimation(false));
    fieldAgent.on("submit", () => stopCurrentAnimation(false));

    fieldAgent.on("update", () => {
        overlayAgent.submit((signal, field, overlay) => {
            drawOverlay(signal, field, overlay);
            // Count the overlays drawn for newly interpolated fields. The tests wait on this; keep it.
            if (field) {
                const root = document.documentElement.dataset;
                root.fieldOverlays = +(root.fieldOverlays || 0) + 1;
            }
        }, fieldAgent.value(), configuration.get("overlay"));
    });
    rendererAgent.on("start", () => {
        overlayAgent.submit(drawOverlay, fieldAgent.value(), null);
    });
    configuration.on("change", changed => {
        // if only overlay relevant flags have changed...
        if (changed.includes("overlay") || changed.includes("showGrid")) {
            overlayAgent.submit(drawOverlay, fieldAgent.value(), configuration.get("overlay"));
        }
    });

    // Add event handlers for showing, updating, and removing location details.
    inputController.on("click", showLocationDetails);
    fieldAgent.on("update", updateLocationDetails);
    d3.select("#location-close").on("click", () => clearLocationDetails(true));

    d3.select("#show-grid").on("click", () => {
        configuration.save({showGrid: !configuration.get("showGrid")});
    });
    configuration.on("change:showGrid", showGrid => {
        d3.select("#show-grid").classed("highlighted", showGrid);
    });

    // Add handlers for the buttons of the distance bins, overlays and projections, from their data attributes.
    d3.selectAll("[data-bin]").each(function() {
        bindButtonToConfiguration(this, {bin: this.dataset.bin});
    });
    d3.selectAll("[data-overlay]").each(function() {
        bindButtonToConfiguration(this, {overlay: this.dataset.overlay});
    });
    d3.selectAll("[data-projection]").each(function() {
        bindButtonToConfiguration(this, {projection: this.dataset.projection, orientation: ""}, ["projection"]);
    });

    // When touch device changes between portrait and landscape, rebuild globe using the new view size.
    d3.select(window).on("orientationchange", () => {
        view = µ.view();
        globeAgent.submit(buildGlobe, configuration.get("projection"));
    });
}

// Once everything is set up, load the configuration from the hash fragment, which starts the change events.
Promise.resolve().then(init).then(() => configuration.fetch()).catch(report.error);
