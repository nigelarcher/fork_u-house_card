# Fork U-House Card — Project Context

## What this is
A Home Assistant Lovelace custom card that displays an isometric 3D rendering of the user's house with live weather effects, room temperature badges, AI weather advice, and themed seasonal/holiday overlays. Originally forked from a Polish HA community project; this fork is heavily customised for an Australian household.

## Architecture

### Frontend (`fork_u-house_card.js`)
Single self-contained JS file — no build step, no dependencies. Registers as a custom element (`<fork-u-house-card>`) in HA's Lovelace dashboard.

Key systems:
- **Image selection** (`_calculateImage`) — priority chain: Gaming Mode > Christmas Calendar (Dec 1-26) > Birthdays > Themed Days (date-based) > Weather variants > Season fallback. Images served from a user-configured `image_path` (defaults to `/local/house_card_images/`).
- **Weather engine** — canvas-based particle system for rain, snow, fog, stars, clouds, lightning. Wind direction/speed from HA sensors drives particle physics.
- **Room badges** — positioned overlays showing sensor values with configurable units, colour thresholds, and colour coding.
- **Alert badges** — conditional icons that appear/disappear based on entity state. Support emoji and `mdi:` HA icons with optional background circle, colour, pulse animation, and labels.
- **Sprinkler zones** — animated water effect overlays triggered by switch entities.
- **Bin night** — isometric SVG wheelie bins that appear on collection day (and from 5pm the night before). Supports weekly/fortnightly/monthly cadence with anchor date calculation.
- **Energy flow** (`_updateEnergy`) — power flow overlay with animated SVG dots between nodes, like HA's energy distribution card. Supports auto-discovery from HA Energy Dashboard (`energy/get_prefs` websocket) and/or manual node config. Sources flow to home, consumers flow from home. Dot count and speed scale with power values. Prefs cached for 60s.
- **Visibility rules** (`_evaluateVisibility`) — shared engine for `show_when` on rooms, alerts, sprinklers, and energy nodes. Supports exact match, arrays, and comparison operators (gt, lt, gte, lte, eq, neq, range).
- **AI status** — footer text with contextual weather/health advice based on sensor hierarchy (storms > AQI > pollen > forecast > UV > wind chill > temperature). Used as fallback when no `tips:` config is present.
- **Tips engine** (`_setupTips`, `_buildTipsTemplate`, `_renderTips`) — replaces AI status when `tips:` config is set. All rules combined into a single Jinja2 template, sent via `render_template` websocket subscription. HA evaluates server-side and pushes a sorted JSON list of active tips. Card just renders. Supports `single`, `rotating`, `stacked` display modes. Hides footer when no tips active. See [TIPS_SPEC.md](TIPS_SPEC.md).
- **Gaming mode** — ambient colour blob overlay triggered by a boolean entity.

### Image Generator (`colab_generator/generate_house_assets.ipynb`)
Google Colab notebook that generates all house images using Google Gemini API. Produces:
- 8 base season/time images
- 40+ weather variants (rain, snow, fog, lightning, hail, overcast per season/time)
- 4 xmas fallback images (traditional + australian, day/night)
- 52 unique Christmas calendar images (Dec 1-26, day/night)
- Halloween day/night
- 5 gaming mode images
- 20+ themed day images (Easter, ANZAC Day, AFL Grand Final, etc.)
- Birthday images (all 4 seasons x day/night)

Master reference image is generated first (or uploaded), then all variants reference it for architectural consistency.

### Configuration (`Dashboard_yaml_example.yaml`)
Example HA dashboard YAML with all config options documented, including colour reference and icon reference.

## Key design decisions

- **Images in separate folder** — HACS only manages the JS file. Images must live outside the HACS-managed folder (e.g., `config/www/house_card_images/`) or they get deleted on update.
- **Southern Hemisphere seasons** — user is in Australia. Christmas = summer, Halloween = spring, Easter = autumn. All date logic reflects this.
- **Christmas calendar alternates daily** — even days show traditional winter/snowy xmas, odd days show Australian summer xmas. Dec 23 combines girl's birthday with xmas.
- **z-index cap at 3** — HA's toolbar sits at z-index 4. All card layers must stay at 3 or below.
- **Bin cadence uses anchor dates** — fortnightly/monthly bins calculate from a known past collection date. No HA helpers needed.
- **No build step** — everything is a single JS file for simplicity. CSS is inline in the `_render()` method.
- **Wedding anniversary** — Sep 8.
- **Birthdays** — configured in dashboard YAML, not hardcoded in JS.

## File structure
```
fork_u-house_card.js          — the card (single file, no build)
Dashboard_yaml_example.yaml   — example config with all options
hacs.json                     — HACS metadata
readme.md                     — user-facing docs
colab_generator/
  generate_house_assets.ipynb  — main Colab notebook
  generate_new_themes_only.py  — standalone cell for generating only new themed images
images/                        — generated house images (not managed by HACS)
```

## Conventions
- Australian English spelling in user-facing text (colour, metres, etc.)
- Comments in JS mix Polish (from original fork) and English
- Image filenames use underscores: `season_weather_time.png`, `themed_name_time.png`, `xmas_dec{day}_time.png`
- Themed day images use `themed_` prefix, gaming uses `gaming_` prefix, xmas calendar uses `xmas_dec` prefix
