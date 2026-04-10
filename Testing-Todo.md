# Testing TODO

Status snapshot of what's tested, what isn't, and what refactors would unlock
the rest. Keep this file up to date as tests get added or the card is refactored.

## Current state

- **Framework:** Vitest + jsdom
- **Location:** `tests/`
- **Run:** `npm test` (or `npm run test:watch`)
- **Count:** 277 tests across 15 files, full run in ~1s
- **CI:** gated on every push and PR via `.github/workflows/test.yml`;
  release workflow blocks on the same job

## Coverage by tier

### Tier 1 — Pure functions (DONE)

| Method | File | Notes |
|---|---|---|
| `_getNthSundayOfMonth`, `_getNthDayOfMonth`, `_getLastDayOfMonth` | `date-helpers.test.js` | Anchor dates for Mothers/Fathers Day, AFL Grand Final, Melbourne Cup, State of Origin |
| `_getEasterSunday` | `date-helpers.test.js` | 2020–2030 against Wikipedia |
| `_evaluateVisibility` | `visibility.test.js` | All operators, array membership, HA-reformatted `[{gt:10},{lt:20}]` shape |
| `_isBinCollectionDay` | `bins.test.js` | Weekly, fortnightly (on/off weeks), monthly (same occurrence-of-weekday), missing/invalid anchors |
| `_buildTipsTemplate` | `tips-template.test.js` | Jinja template shape, quote escaping, defaults, `when` verbatim |
| `_resolveEnergyNodes` | `energy-nodes.test.js` | Manual only, auto solar/grid/battery, manual-vs-auto priority (entity and `replaces`), consumer discovery, custom positions |

### Tier 2 — Instance-based, no DOM (DONE)

| Method | File | Notes |
|---|---|---|
| `_calculateImage` | `calculate-image.test.js` | **Full priority chain.** Gaming, Xmas calendar (Dec 1/15/23/26, even/odd day, fallback selection), birthdays, every themed day (fixed dates + computed like Easter/Mothers/AFL/Neighbour/Melbourne Cup), Halloween window, weather variants (rainy/pouring/lightning/snowy/hail/fog), season fallback, Polish season translation, priority ordering between tiers |
| `_getBadgeColor` | `badge-color.test.js` | Default 4-zone temp, custom `temp_thresholds`, per-room custom thresholds+colors with short color arrays, non-temperature unit fallback |
| `_getStateVal`, `_getWindData`, `_getCloudCoverage`, `_t` | `state-helpers.test.js` | Missing entity, NaN, attribute fallback, entity-vs-attribute precedence, language fallback |

### Tier 3 — DOM write methods (DONE)

`_render()` works cleanly in jsdom — confirmed by `render-smoke.test.js`.
All DOM write methods testable via `mountCard()` helper (renders then exposes
shadowRoot for assertions).

| Method | File | Notes |
|---|---|---|
| `_updateBadges` | `update-badges.test.js` | Basic rendering, invalid-room skipping, unit formatting, positioning, all 5 colour classes, `show_when` with operators, edit-mode opacity overlay, idempotent re-render |
| `_updateAlerts` | `update-alerts.test.js` | Basic visibility, custom `show_when`, emoji vs `mdi:` icon rendering, color/background styling, pulse class, label optionality, positioning, edit-mode opacity + pulse suppression |
| `_updateBins` | `update-bins.test.js` | Basic collection-day rendering, label optionality, multiple bins, empty list, "5pm night before" visibility (Wed 3pm vs 6pm), fortnightly on/off weeks, monthly cadence with anchor |
| `_updateSprinklers` | `update-sprinklers.test.js` | Entity state gating, size classes, custom color on spray elements, label, operator `show_when`, edit-mode opacity |
| `_handleGamingMode`, `_handleDayNight`, `_updateMedianPill` | `ui-toggles.test.js` | Class toggling, dim-layer opacity, sun entity override, translation-aware median pill, graceful no-op when target element missing |

### Tier 3 — Follow-ups (optional)

- **`_render` snapshot test** — assert top-level structure. Low value; existing smoke coverage is enough unless someone starts refactoring the layout
- **`_updateData` integration test** — end-to-end assertion that setting `hass` results in the expected DOM. Covered indirectly by all T3 tests
- **Edit-mode detection walk** (`_editModeChecked` + DOM tree walk) — currently bypassed in tests by setting `_editMode` directly. Low value to test the walk itself

### Tier 4 — Hard without refactor

| Method | Why hard | Suggested refactor |
|---|---|---|
| `_updateEnergy` | Animated SVG dot generation intertwined with DOM creation and power math | **Split into two methods:** `_computeEnergyFlow(nodes, hass) → {dots, speeds, directions}` (pure) and `_renderEnergyFlow(flow)` (DOM). Test the math branch, leave the DOM branch to Tier 3 treatment. ~3 hours refactor, unlocks ~20 tests |
| ~~`_setupTips`, `_renderTips`, `_setupTipRotation`~~ | **SKIP — being rewritten** | Tips engine is being completely rewritten on the `tipsEngine` branch. Do not write tests against the current implementation. Revisit test strategy once the rewrite lands |
| `_updateData` (orchestrator) | Calls every other `_update*` method; hard to test in isolation | Not worth isolating; covered indirectly once each `_update*` method is tested individually |
| Weather canvas engine (`_animate`, `_drawRain`, `_drawSnow`, `_drawFog`, `_drawStars`, `_drawClouds`, `_createCloud`, `_handleLightning`, `_triggerLightning`, `_drawBolt`, `_resizeCanvas`, `_initStars`) | Canvas 2D context not implemented in jsdom. Would need `node-canvas` native build (painful on Windows CI) or headless browser | **Two options:** (a) extract each draw function into a pure module that takes a context object and state, use a spy-context in tests; or (b) leave untested — these are cosmetic and bugs are immediately visible to a human. **Recommendation: (b).** Cost/benefit is poor |
| `_fetchEnergyPrefs` | Websocket call with a 60s cache | Easy to test with a mocked `_hass.callWS`. ~30 min, ~5 tests |

### Not worth testing

- CSS-only animations, colour constants, layout
- `connectedCallback` / `disconnectedCallback` — framework lifecycle, trivially correct
- `set hass(hass)` debouncer — `requestAnimationFrame` gymnastics, easier to verify by hand
- SVG strings for the wheelie bin icon — static markup

## Refactoring insights

Things I noticed while writing tests that would be high-leverage cleanups,
ordered roughly by ROI:

### High ROI — worth doing beyond tests

1. **Weather engine extraction (canvas subsystem)**
   Currently `_animate()` branches on weather state every frame with particle
   arrays (`_particles`, `_clouds`, `_stars`, `_fogParticles`) living on
   `this`. Extract into a `WeatherEngine` class with per-effect modules
   (`RainEffect`, `SnowEffect`, `FogEffect`, `StarsEffect`, `CloudsEffect`,
   `LightningEffect`). **Non-test benefits:**
   - Object pooling per effect eliminates GC pressure on low-end devices
     (this is the current biggest perf hit — why `_lowPerf` exists)
   - Only active effects pay update/draw cost
   - Bail out of `_animate()` entirely when no effects active
   - **Unlocks combinable effects** (snow + wind + fog simultaneously — real
     weather, which the current single-state model can't represent)
   - Day/night modulation per effect
   - New weather types drop in as new effect classes without touching engine
   - Optional WebGL backend behind same interface for high-end devices
   ~4 hours. Must stay in the single JS file — use IIFE-scoped classes.
   **Highest-leverage refactor in the card.**

2. **Split `_updateEnergy` into compute + render**
   Non-test benefits:
   - Existing `_energyDirty` flag is coarse; fine-grained dirty tracking
     lets you skip renders when flows haven't changed (most hass pushes
     are for unrelated entities)
   - Hover tooltips with instant values become trivial (render layer
     queries the cached compute result)
   - Historical sparklines per node unlock via ring buffer of compute results
   - Smooth transitions when battery flow direction flips (charge ↔ discharge)
     — currently jumps
   ~3 hours.

3. **Extract `_pickThemedDay(year, month, day)` from `_calculateImage`**
   Currently `_calculateImage` is one 200-line method with an in-line cascade
   of `if (month === X && day === Y)` returns. Extracting a pure `_pickThemedDay`
   that returns `'anzac_day' | 'mothers_day' | null` would:
   - Let themed-day tests skip date-mocking the whole card
   - Make it obvious at a glance which date rules exist
   - Make the priority between themed days explicit (currently implicit in
     statement order)
   - ~1 hour, zero behaviour change, unlocks clean unit tests for every
     themed day in isolation

4. **Extract `_aiStatusMessage(sensors) → { text, level }` from `_updateData`**
   The AI advice sensor hierarchy (storms > AQI > pollen > forecast > UV >
   wind chill > temperature) is currently buried in `_updateData`. This is
   a large behavioural surface with no tests. Pulling it into a pure
   function would make it trivially testable and give the tips engine a
   cleaner fallback boundary. ~1 hour, ~20 tests.
   **BLOCKED: wait for tipsEngine branch rewrite to land.** The new tips
   engine may subsume or eliminate this code path entirely — revisit after
   rewrite lands to decide whether extraction is still worth doing.

### Medium ROI

4. **Make `_isBinCollectionDay` aware of "show from 5pm night before" logic**
   Currently `_updateBins` peeks at `now.getHours() >= 17` and then calls
   `_isBinCollectionDay` twice (today, tomorrow). Folding the
   time-of-day into the helper (or a wrapper) would make it testable
   end-to-end. Low priority — the current structure is already testable
   via fake timers.

5. **Consistent `show_when` rule normalisation**
   `_evaluateVisibility` already handles HA's `[{gt:10},{lt:20}]` reformat
   defensively. Would be cleaner to normalise at `setConfig` time so the
   evaluator only ever sees one shape. Cosmetic, no test value.

6. **Extract `_buildTipsTemplate` to a pure module file**
   It's already pure. Moving it to a separate file (or keeping inline but
   marking it `static`) would remove the need for `getProto()` shenanigans
   in the test file. Cosmetic.

### Low ROI but worth knowing

7. **The card is a single 1800-line class.** Long-term, it would benefit
   from being split into `ImageSelector`, `WeatherEngine`, `EnergyFlow`,
   `TipsEngine`, `Render`. But HACS distributes a single JS file, so any
   split needs a build step to re-bundle. Given the "no build step" design
   goal stated in `CLAUDE.md`, this is deferred indefinitely. A minimal
   compromise: use IIFE modules inside the same file with clear section
   comments. Won't change testability materially.

8. **Canvas engine modularisation**
   See Tier 4. Only worth it if someone wants to unit-test particle
   behaviour, which is unlikely to be where bugs actually hide.

## Gaps / known untested behaviour

- Any code path that reads `requestAnimationFrame` timing directly
- Lightning bolt generation randomness (deterministic seeding would help)
- The `set hass(hass)` debounce logic
- The performance auto-detect path in `setConfig` (`_perfAutoDetect`)
- `_fetchEnergyPrefs` caching behaviour
- The `seasonMap` Polish → English translation for *all* four seasons
  (tested `lato` → `summer` only)
- `_calculateImage` weather variants at night (day variants tested,
  night variants untested)
- Birthday image when the season entity returns a Polish name
  (covered indirectly via season translation)
