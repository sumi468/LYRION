# LYRION application icon

Original project artwork, drawn in `public/favicon.svg` without external assets or fonts.
The blue home planet, thin atmosphere, small LX-07 silhouette and orbital station are
kept within the central maskable safe area. Stars are decorative.

`node scripts/export-icons.mjs` rasterizes the source with the browser's SVG renderer:
192 / 512 px PNG, 180 px Apple touch icon, 512 px maskable icon and a multi-resolution
32 / 48 / 64 / 256 px PNG-based ICO. No external CDN is needed.
