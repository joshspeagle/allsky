allsky
======

"allsky" is a project to visualize the bulk galactic motions and properties
of stars. It is built off of the ["earth"](https://github.com/cambecc/earth)
package developed by Cameron Beccario, to whom we are entirely indebted,
which itself is based on the earlier
[Tokyo Wind Map](https://github.com/cambecc/air) project.

Building and Launching
----------------------

After installing node.js and npm, clone "allsky" and install the
associated dependencies:

    git clone https://github.com/cambecc/earth
    cd earth
    npm install

After that is done, launch the development web server:

    node dev-server.js 8080

Note that you might need to use `nodejs` instead of `node` due to a possible
naming conflict for Ubuntu, Mint, and/or elementary OS users.

Finally, point your browser to:

    http://localhost:8080

All relevant files are located in the `public` directory.
See `public/index.html` and `public/libs/earth/*.js` for the main entry points.
Data files are located in the `public/data` directory. These are currently
named after existing weather hooks in the codebase and so are essentially
non-sensical. To see what things refer to what, use the menu in the
`index.html` file or email jspeagle@cfa.harvard.edu.

Most of the structure used in "allsky" follows that of "earth", so if there
are issues that appear unaddressed please check whether they are discussed
there before raising a new one.

Notes
-----

- To produce smooth behavior, 
[bilinear interpolation](http://en.wikipedia.org/wiki/Bilinear_interpolation)
is used. While the default resolution of our data is constructed using
an `nside=64` [healpix](https://healpix.jpl.nasa.gov/) scheme
(roughly 1 degree on the sky) and then interpolated to a 1 degree grid in
Galactic longitude and latitude, the cost of doing this can start becoming
prohibitive at higher resolutions.
- Various projections warp and distort the sphere in various ways. Accounting
for this requires the use of 
[finite difference approximations](http://gis.stackexchange.com/a/5075/23451)
that are computed during interpolation.
- Velocity stream animations do not scale linearly with the actual underlying
tangential velocities in order to accomodate the broad range of
observed values as a function of distance.
- For visualization purposes only, all data is smoothed with a Gaussian beam
with a FWHM of 0.01 radians (~30 arcmin).

Inspiration
-----------

This work was inspired (and built off of) the wonderful
["earth"](https://github.com/cambecc/earth) project. "earth" was itself
inspired by the [hint.fm wind map](http://hint.fm/wind/)
and [D3.js visualization library](http://d3js.org).
