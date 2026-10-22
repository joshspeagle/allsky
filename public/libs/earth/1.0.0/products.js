/**
 * products - defines the data layers, including grid construction, interpolation, and color scales.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
var products = function() {
    "use strict";

    var WEATHER_PATH = "/data/weather";

    function buildProduct(overrides) {
        return _.extend({
            paths: [],
            load: function(cancel) {
                var me = this;
                return when.map(this.paths, µ.loadJson).then(function(files) {
                    return cancel.requested ? null : _.extend(me, buildGrid(me.builder.apply(me, files)));
                });
            }
        }, overrides);
    }

    /**
     * @param attr
     * @param {String} type
     * @param {String?} surface
     * @param {String?} level
     * @returns {String}
     */
    function gfs1p0degPath(attr, type, surface, level) {
        var dir = attr.date, stamp = dir === "current" ? "current" : attr.hour;
        var file = [stamp, type, surface, level, "gfs", "1.0"].filter(µ.isValue).join("-") + ".json";
        return [WEATHER_PATH, dir, file].join("/");
    }

    var FACTORIES = {

        "wind": {
            matches: _.matches({param: "wind"}),
            create: function(attr) {
                return buildProduct({
                    type: "wind",
                    paths: [gfs1p0degPath(attr, "wind", attr.surface, attr.level)],
                    builder: function(file) {
                        var uData = file[0].data, vData = file[1].data;
                        return {
                            header: file[0].header,
                            interpolate: bilinearInterpolateVector,
                            data: function(i) {
                                return [uData[i], vData[i]];
                            }
                        }
                    },
                    units: [
                        {label: "km/s", conversion: function(x) { return x; },      precision: 2}
                    ],
                    scale: {
                        bounds: [0, 250],
                        gradient: µ.segmentedColorScale([
                            [0,      [8,64,129]],
                            [16,     [8,104,172]],
                            [33,     [43,140,190]],
                            [52,     [78,179,211]],
                            [73,     [123,204,196]],
                            [97,     [168,221,181]], 
                            [125,    [217,240,163]],
                            [162,    [247,252,185]],
                            [250,    [255,255,204]]
                        ])
                    },
                    particles: {velocityScale: 1/60000, maxIntensity: 17}
                });
            }
        },

        "temp": {
            matches: _.matches({param: "wind", overlayType: "temp"}),
            create: function(attr) {
                return buildProduct({
                    type: "temp",
                    paths: [gfs1p0degPath(attr, "temp", attr.surface, attr.level)],
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "stars", conversion: function(x) { return x; },       precision: 0}
                    ],
                    scale: {
                        bounds: [0, 32000],
                        gradient: µ.segmentedColorScale([
                            [0,       [12,7,134]],
                            [1,       [43,5,148]],
                            [2,       [66,3,157]],
                            [4,       [89,1,164]],
                            [8,       [109,0,168]],
                            [15,      [130,4,167]],
                            [25,      [149,17,161]],
                            [45,      [167,33,151]],
                            [80,      [182,47,139]],
                            [135,     [196,63,126]],
                            [230,     [209,78,114]],
                            [400,     [220,94,102]],
                            [700,     [230,109,90]],
                            [1200,    [239,126,78]],
                            [2050,    [246,143,67]],
                            [3550,    [251,163,55]],
                            [6150,    [253,182,45]],
                            [10600,   [252,204,37]],
                            [18300,   [247,226,37]],
                            [32000,   [239,248,33]]
                        ])
                    }
                });
            }
        },

        "relative_humidity": {
            matches: _.matches({param: "wind", overlayType: "relative_humidity"}),
            create: function(attr) {
                return buildProduct({
                    type: "relative_humidity",
                    paths: [gfs1p0degPath(attr, "relative_humidity", attr.surface, attr.level)],
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "[Fe/H]", conversion: function(x) { return x; },       precision: 2}
                    ],
                    scale: {
                        bounds: [-3, 0.5],
                        gradient: µ.segmentedColorScale([
                            [-3.0,       [165,0,38]],
                            [-2.81,      [190,24,38]],
                            [-2.63,      [215,49,39]],
                            [-2.45,      [231,82,54]],
                            [-2.26,      [244,114,69]],
                            [-2.08,      [249,149,85]],
                            [-1.89,      [253,180,103]],
                            [-1.71,      [253,208,129]],
                            [-1.52,      [254,230,153]],
                            [-1.34,      [254,247,179]],
                            [-1.15,      [247,251,205]],
                            [-0.97,      [230,245,236]],
                            [-0.79,      [207,234,243]],
                            [-0.61,      [178,220,235]],
                            [-0.42,      [150,200,224]],
                            [-0.23,      [120,176,210]],
                            [-0.05,      [95,148,196]],
                            [0.13,       [69,118,180]],
                            [0.32,       [59,86,164]],
                            [0.5,        [49,54,149]]
                        ])
                    }
                });
            }
        },

        "air_density": {
            matches: _.matches({param: "wind", overlayType: "air_density"}),
            create: function(attr) {
                return buildProduct({
                    type: "air_density",
                    paths: [gfs1p0degPath(attr, "air_density", attr.surface, attr.level)],
                    builder: function(file) {
                        var record = file[0], data = record.data;
                        return {
                            header: record.header,
                            interpolate: bilinearInterpolateScalar,
                            data: function(i) {
                                return data[i];
                            }
                        }
                    },
                    units: [
                        {label: "Gyr", conversion: function(x) { return x; },       precision: 1}
                    ],
                    scale: {
                        bounds: [2, 13.8],
                        gradient: µ.segmentedColorScale([
                            [2.0,      [94,79,162]],
                            [3.2,      [71,108,175]],
                            [4.3,      [51,137,188]],
                            [5.4,      [79,168,175]],
                            [6.4,      [107,196,164]],
                            [7.4,      [145,210,164]],
                            [8.3,      [179,224,162]],
                            [9.1,      [211,237,155]],
                            [9.8,      [234,246,159]],
                            [10.5,     [248,252,181]],
                            [11.2,     [254,247,177]],
                            [11.7,     [254,230,149]],
                            [12.2,     [253,208,125]],
                            [12.6,     [253,180,102]],
                            [13.0,     [249,149,85]],
                            [13.3,     [244,114,69]],
                            [13.5,     [230,88,72]],
                            [13.7,     [213,62,78]],
                            [13.8,     [186,32,72]]
                        ])
                    }
                });
            }
        },

        "off": {
            matches: _.matches({overlayType: "off"}),
            create: function() {
                return null;
            }
        }
    };

    function bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
        var rx = (1 - x);
        var ry = (1 - y);
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    }

    function bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
        var rx = (1 - x);
        var ry = (1 - y);
        var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
        var u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        var v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [u, v, Math.sqrt(u * u + v * v)];
    }

    /**
     * Builds an interpolator for the specified data in the form of JSON-ified GRIB files. Example:
     *
     *     [
     *       {
     *         "header": {
     *           "refTime": "2013-11-30T18:00:00.000Z",
     *           "parameterCategory": 2,
     *           "parameterNumber": 2,
     *           "surface1Type": 100,
     *           "surface1Value": 100000.0,
     *           "forecastTime": 6,
     *           "scanMode": 0,
     *           "nx": 360,
     *           "ny": 181,
     *           "lo1": 0,
     *           "la1": 90,
     *           "lo2": 359,
     *           "la2": -90,
     *           "dx": 1,
     *           "dy": 1
     *         },
     *         "data": [3.42, 3.31, 3.19, 3.08, 2.96, 2.84, 2.72, 2.6, 2.47, ...]
     *       }
     *     ]
     *
     */
    function buildGrid(builder) {

        var header = builder.header;
        var λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
        var Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
        var ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)

        // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
        // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
        var grid = [], p = 0;
        var isContinuous = Math.floor(ni * Δλ) >= 360;
        for (var j = 0; j < nj; j++) {
            var row = [];
            for (var i = 0; i < ni; i++, p++) {
                row[i] = builder.data(p);
            }
            if (isContinuous) {
                // For wrapped grids, duplicate first column as last column to simplify interpolation logic
                row.push(row[0]);
            }
            grid[j] = row;
        }

        function interpolate(λ, φ) {
            var i = µ.floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
            var j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90

            //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
            //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
            //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
            //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
            //    j ___|_ .   |           (1, 9) and (2, 9).
            //  =8.3   |      |
            //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
            //         |      |           column, so the index ci can be used without taking a modulo.

            var fi = Math.floor(i), ci = fi + 1;
            var fj = Math.floor(j), cj = fj + 1;

            var row;
            if ((row = grid[fj])) {
                var g00 = row[fi];
                var g10 = row[ci];
                if (µ.isValue(g00) && µ.isValue(g10) && (row = grid[cj])) {
                    var g01 = row[fi];
                    var g11 = row[ci];
                    if (µ.isValue(g01) && µ.isValue(g11)) {
                        // All four points found, so interpolate the value.
                        return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                    }
                }
            }
            return null;
        }

        return {
            interpolate: interpolate,
            forEachPoint: function(cb) {
                for (var j = 0; j < nj; j++) {
                    var row = grid[j] || [];
                    for (var i = 0; i < ni; i++) {
                        cb(µ.floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i]);
                    }
                }
            }
        };
    }

    function productsFor(attributes) {
        var attr = _.clone(attributes), results = [];
        _.values(FACTORIES).forEach(function(factory) {
            if (factory.matches(attr)) {
                results.push(factory.create(attr));
            }
        });
        return results.filter(µ.isValue);
    }

    return {
        overlayTypes: d3.set(_.keys(FACTORIES)),
        productsFor: productsFor
    };

}();
