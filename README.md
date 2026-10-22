allsky
======

allsky is an animated all-sky map of the Milky Way's stars. It shows the mean tangential velocity of stars as
moving streams, and their density, metallicity and age as colour overlays, in nine distance bins from 0 to 50 kpc.

See it at https://joshspeagle.com/allsky/.

The stellar properties come from [brutus](https://github.com/joshspeagle/brutus) fits to photometry from
[PanSTARRS1](https://panstarrs.stsci.edu/), [2MASS](https://old.ipac.caltech.edu/2mass/),
[UKIDSS](http://www.ukidss.org/), [unWISE](http://catalog.unwise.me/) and
[Gaia](https://sci.esa.int/web/gaia).

allsky is built on [earth](https://github.com/cambecc/earth) by Cameron Beccario, to whom we are entirely
indebted. earth is itself based on the [Tokyo Wind Map](https://github.com/cambecc/air).

Running it locally
------------------

allsky is a static site: everything the browser loads is in `public/`. To serve it locally, install
[Node.js](https://nodejs.org/) 20.19 or later, then run:

    git clone https://github.com/joshspeagle/allsky
    cd allsky
    npm ci
    npm start

and open http://localhost:8080.

Notes
-----

- The data are built on an `nside=64` [HEALPix](https://healpix.jpl.nasa.gov/) grid (about 1 degree on the sky),
  then interpolated to a 1 degree grid in Galactic longitude and latitude. The map interpolates that grid
  [bilinearly](https://en.wikipedia.org/wiki/Bilinear_interpolation).
- Each projection distorts the sphere. The map corrects the stream directions and speeds for this with
  [finite differences](https://gis.stackexchange.com/a/5075/23451).
- Stream speed does not scale linearly with the tangential velocity, so that the wide range of velocities at
  different distances stays visible.
- For display only, all data are smoothed with a Gaussian beam with a FWHM of 0.01 radians (about 30 arcmin).
- Click a point to read its values: the direction of motion (in degrees from Galactic north toward increasing
  longitude) and the speed, and the value of the overlay. Grey regions of the sphere are unobserved.

Questions and problems go to the [issue tracker](https://github.com/joshspeagle/allsky/issues). Most of the code
follows earth, so an unanswered question may already be answered there.

Inspiration
-----------

allsky was inspired by, and built on, the wonderful [earth](https://github.com/cambecc/earth) project. earth
was itself inspired by the [hint.fm wind map](http://hint.fm/wind/) and the
[D3.js visualization library](https://d3js.org).
