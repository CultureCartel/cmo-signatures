# CMO Council animated email signatures

Private signature studio for the CMO Council team, served at **https://cmo.culturecartel.ca** (password protected page).

## Artwork permanence

Signatures load artwork from jsDelivr pinned to an exact commit of this repo:

    https://cdn.jsdelivr.net/gh/CultureCartel/cmo-signatures@<commit>/assets/<file>

A commit-pinned URL is immutable: the file behind it can never change, and jsDelivr keeps serving it from its own permanent storage even if this repo changes. **Never delete or rewrite history in this repo, and never rename files in `assets/`.** Add new artwork as new files.

## Layout

- `index.html` the studio (password gate, person tabs, 10 animations x 10 layouts, copy buttons)
- `assets/` 50 GIFs and 6 headshots
  - `NN-name-lockup.gif` CMO Council + GLOBAL CIRCLE, 176x146 display, 2x
  - `NN-name-lockup-plain.gif` CMO Council, 176x120
  - `NN-name-banner-{jarryd|donovan|bryan}.gif` 560px banners with name and title animated in
- `source/` the canvas renderer used to make every GIF (`render.html`, `cap2.js`, `enc.sh`)

Built by Culture Cartel.
