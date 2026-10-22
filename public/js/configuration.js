/**
 * configuration - the page's settings, kept in sync with the URL hash fragment.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import {Emitter} from "./events.js";

const DEFAULT_CONFIG = "current/wind/surface/level/atlantis";

/**
 * Parses a URL hash fragment:
 *
 * example: "2013/11/14/0900Z/wind/isobaric/1000hPa/orthographic=26.50,-153.00,1430/overlay=off"
 * output: {date: "2013/11/14", hour: "0900", param: "wind", surface: "isobaric", level: "1000hPa",
 *          projection: "orthographic", orientation: "26.50,-153.00,1430", overlayType: "off"}
 *
 * grammar:
 *     hash   := ( "current" | yyyy / mm / dd / hhhh "Z" ) / param / surface / level [ / option [ / option ... ] ]
 *     option := type [ "=" number [ "," number [ ... ] ] ]
 *
 * @param hash the hash fragment.
 * @param projectionNames the set of allowed projections.
 * @param overlayTypes the set of allowed overlays.
 * @returns {Object} the result of the parse, or {} when the hash does not match the grammar.
 */
function parse(hash, projectionNames, overlayTypes) {
    //               1        2        3          4          5            6      7      8    9
    const tokens = /^(current|(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{3,4})Z)\/(\w+)\/(\w+)\/(\w+)(\/.+)?/.exec(hash);
    if (!tokens) {
        return {};
    }
    const result = {
        date: tokens[1] === "current" ? "current" : [tokens[2], tokens[3].padStart(2, "0"), tokens[4].padStart(2, "0")].join("/"),
        hour: tokens[5] === undefined ? "" : tokens[5].padStart(4, "0"),
        param: tokens[6],
        surface: tokens[7],
        level: tokens[8],
        projection: "orthographic",
        orientation: "",
        overlayType: "default",
        showGridPoints: false
    };
    (tokens[9] || "").split("/").forEach(segment => {
        let option;
        if ((option = /^(\w+)(=([\d\-.,]*))?$/.exec(segment))) {
            if (projectionNames.has(option[1])) {
                result.projection = option[1];
                result.orientation = option[3] || "";  // comma delimited string of numbers, or ""
            }
        }
        else if ((option = /^overlay=(\w+)$/.exec(segment))) {
            if (overlayTypes.has(option[1]) || option[1] === "default") {
                result.overlayType = option[1];
            }
        }
        else if ((option = /^grid=(\w+)$/.exec(segment))) {
            if (option[1] === "on") {
                result.showGridPoints = true;
            }
        }
    });
    return result;
}

/**
 * Holds the page's configuration as a set of attributes: layer, projection, orientation, etc. A change fires
 * "change:<attribute>" with the new value for each changed attribute, then one "change" with the array of
 * changed attribute names. For example, configuration.save({projection: "orthographic"}) fires an event which
 * causes the globe to be re-rendered with an orthographic projection.
 *
 * All attributes are kept in a human readable form in the page's hash fragment, and vice versa. This allows
 * deep linking and back-button navigation.
 */
export class Configuration extends Emitter {
    #projectionNames;
    #overlayTypes;
    #ignoreNextHashChange = false;

    /**
     * @param projectionNames the set of allowed projections.
     * @param overlayTypes the set of allowed overlays.
     */
    constructor(projectionNames, overlayTypes) {
        super();
        this.attributes = {};
        this.#projectionNames = projectionNames;
        this.#overlayTypes = overlayTypes;
    }

    get(key) {
        return this.attributes[key];
    }

    /**
     * Sets attributes and fires change events for those whose value changed.
     */
    set(attrs) {
        const changed = Object.keys(attrs).filter(key => this.attributes[key] !== attrs[key]);
        changed.forEach(key => { this.attributes[key] = attrs[key]; });
        changed.forEach(key => this.trigger("change:" + key, this.attributes[key]));
        if (changed.length > 0) {
            this.trigger("change", changed);
        }
        return this;
    }

    /**
     * Sets attributes, then writes the configuration to the hash fragment.
     */
    save(attrs) {
        this.set(attrs);
        // Setting the hash fires a hashchange event in a later event turn. Ignore it.
        this.#ignoreNextHashChange = true;
        window.location.hash = this.toHash();
        return this;
    }

    /**
     * Reads the configuration from the hash fragment.
     */
    fetch() {
        return this.set(parse(window.location.hash.substr(1) || DEFAULT_CONFIG, this.#projectionNames, this.#overlayTypes));
    }

    /**
     * Reads the configuration from the hash fragment after a "hashchange" event, unless save() caused it.
     */
    onHashChange() {
        if (this.#ignoreNextHashChange) {
            this.#ignoreNextHashChange = false;
            return this;
        }
        return this.fetch();
    }

    /**
     * @returns {String} this configuration converted to a hash fragment.
     */
    toHash() {
        const attr = this.attributes;
        const dir = attr.date === "current" ? "current" : attr.date + "/" + attr.hour + "Z";
        const proj = [attr.projection, attr.orientation].filter(Boolean).join("=");
        const ol = attr.overlayType === "default" ? "" : "overlay=" + attr.overlayType;
        const grid = attr.showGridPoints ? "grid=on" : "";
        return [dir, attr.param, attr.surface, attr.level, ol, proj, grid].filter(Boolean).join("/");
    }
}
