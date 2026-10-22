/**
 * configuration - the page's settings, kept in sync with the URL hash fragment.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import {Emitter} from "./events.js";

const DEFAULTS = {bin: "7-11kpc", overlay: "velocity", projection: "mollweide", orientation: "", showGrid: false};

/**
 * Parses a URL hash fragment into the configuration's attributes. The hash is a list of segments separated by
 * "/", in any order:
 *
 *     a distance bin            7-11kpc
 *     an overlay                velocity, density, metallicity, age or none
 *     a projection              mollweide, or mollweide=λ,φ,scale for an orientation
 *     the grid points           grid
 *
 * Example: "0-2kpc/density/orthographic=26.50,-153.00,1430/grid". A missing or unknown segment takes its
 * default value (7-11kpc/velocity/mollweide).
 *
 * @param hash the hash fragment.
 * @param names the allowed values: {bins, overlays, projections}, each a Set.
 * @returns {Object} the attributes.
 */
function parse(hash, names) {
    const result = {...DEFAULTS};
    hash.split("/").forEach(segment => {
        const [name, orientation] = segment.split("=");
        if (names.bins.has(segment)) {
            result.bin = segment;
        }
        else if (names.overlays.has(segment)) {
            result.overlay = segment;
        }
        else if (names.projections.has(name) && /^[\d\-.,]*$/.test(orientation || "")) {
            result.projection = name;
            result.orientation = orientation || "";  // comma delimited string of numbers, or ""
        }
        else if (segment === "grid") {
            result.showGrid = true;
        }
    });
    return result;
}

/**
 * Holds the page's configuration as a set of attributes: bin, overlay, projection, orientation and showGrid.
 * A change fires "change:<attribute>" with the new value for each changed attribute, then one "change" with
 * the array of changed attribute names. For example, configuration.save({projection: "orthographic"}) fires an
 * event which causes the globe to be re-rendered with an orthographic projection.
 *
 * All attributes are kept in a human readable form in the page's hash fragment, and vice versa. This allows
 * deep linking and back-button navigation.
 */
export class Configuration extends Emitter {
    #names;
    #ignoreNextHashChange = false;

    /**
     * @param names the allowed values: {bins, overlays, projections}, each a Set.
     */
    constructor(names) {
        super();
        this.attributes = {};
        this.#names = names;
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
        return this.set(parse(window.location.hash.substr(1), this.#names));
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
        const projection = [attr.projection, attr.orientation].filter(Boolean).join("=");
        return [attr.bin, attr.overlay, projection, attr.showGrid ? "grid" : ""].filter(Boolean).join("/");
    }
}
