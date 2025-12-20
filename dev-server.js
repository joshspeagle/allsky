/**
 * dev-server - serves static resources for developing "earth" locally
 */

"use strict";

console.log("============================================================");
console.log(new Date().toISOString() + " - Starting");

var express = require("express");
var compression = require("compression");
var morgan = require("morgan");

/**
 * Returns true if the response should be compressed.
 */
function compressionFilter(req, res) {
    return (/json|text|javascript|font/).test(res.getHeader('Content-Type'));
}

/**
 * Adds headers to a response to enable caching.
 */
function cacheControl() {
    return function(req, res, next) {
        res.setHeader("Cache-Control", "public, max-age=300");
        return next();
    };
}

var portArg = process.argv[2];
var DEFAULT_PORT = 3000;
var port = DEFAULT_PORT;

if (portArg !== undefined) {
    var parsedPort = parseInt(portArg, 10);
    if (!isNaN(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
        port = parsedPort;
    } else {
        console.warn("Invalid port specified (" + portArg + "). Falling back to default port " + DEFAULT_PORT + ".");
    }
}
var app = express();

app.use(cacheControl());
app.use(compression({filter: compressionFilter}));
app.use(morgan('combined'));
app.use(express.static("public"));

app.listen(port);
console.log("Listening on port " + port + "...");
