# Official Logo Source Files

This directory preserves supplied logo artwork by brand owner. The originally
supplied PNGs remain unchanged. Use the matching `*-transparent.png` derivative
when a placement needs transparent space around the artwork; these derivatives
remove the white matte without cropping or redrawing the marks.

## Fairway Refresh

- `fairway-refresh/fairway-refresh-horizontal.png` — original horizontal logo and name lockup.
- `fairway-refresh/fairway-refresh-horizontal-transparent.png` — transparent-background derivative for wide headers and banners.
- `fairway-refresh/fairway-refresh-stacked.png` — original stacked logo and name lockup.
- `fairway-refresh/fairway-refresh-stacked-transparent.png` — transparent-background derivative for compact or vertical placements.

## Customer Logos

- `customers/monarch-bay-golf-club/monarch-bay-golf-club.png` — original supplied Monarch Bay Golf Club customer logo.
- `customers/monarch-bay-golf-club/monarch-bay-golf-club-transparent.png` — transparent-background derivative.

Use the Fairway Refresh mark and customer mark together in the approved
`FAIRWAY REFRESH | AT | CUSTOMER` hierarchy. Choose the Fairway variant for the
available form factor; preserve the customer logo artwork and aspect ratio.

## Customer menu logo derivative

Public menus use one Customer-owned web logo, inherited by all of that
Customer's menus. `fairway_backend/cloudrun_receiver/scripts/publish_customer_logo.js`
derives it deterministically from the approved `*-transparent.png` source,
verified by its SHA-256: invisible margins (alpha ≤ 4 of 255, a residual matte
haze) are trimmed and cleared, and the artwork is scaled proportionally to at
most 640 pixels wide without redrawing or recolouring. Without `--apply` the
script only reports the derivative. For Monarch Bay, source
`monarch-bay-golf-club-transparent.png` (SHA-256
`0851107eae56a7e1562a179f19ab6a611f8dc91c36e70f137abf7d85bd9de85e`) yields a
640×321, 167,935-byte PNG with SHA-256
`854f1da92432a293a5e3e1ea660d32e553ef8fcad81308c84bfdc17aa3f02ae5`; this
derivative was published to CUST-0001 in production on 2026-11-16.
