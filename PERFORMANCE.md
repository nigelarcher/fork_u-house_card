# Performance Optimisation

## `performance` config

Two forms — string (legacy shorthand) or object (fine-grained):

```yaml
# Shorthand — only sets mode, all other features stay on
performance: auto   # default — auto-detects slow devices
performance: low    # force low-perf mode
performance: high   # force full effects

# Object form — full control over global defaults
performance:
  mode: low                  # auto | low | high
  weather_effects: false     # skip canvas weather animation entirely
  energy_flow: false         # skip energy flow render
  update_throttle: 10        # debounce _updateData to once per N seconds
```

## Per-user overrides: `performance_profiles`

Symmetric with the global object — same fields, plus `users:` to match
against. First matching profile wins. Only fields you explicitly set on a
profile override the corresponding global default; everything else inherits.

Match is against `hass.user.name` (case-insensitive) or `user.id`.

**Allow-list pattern (recommended for mixed-device households):** lock down
defaults globally, opt your own devices back in.

```yaml
performance:
  mode: low
  weather_effects: false
  energy_flow: false
  update_throttle: 10
performance_profiles:
  - users: ["nigel", "mel"]   # full effects on my phone/laptop
    mode: high
    weather_effects: true
    energy_flow: true
    update_throttle: 0
```

**Deny-list pattern (just throttle one device):** leave defaults full,
target the slow one.

```yaml
performance_profiles:
  - users: ["sansung_fridge"]
    mode: low
    weather_effects: false
    energy_flow: false
    update_throttle: 5
```

Notes:
- `update_throttle` is the biggest single win on devices with many sensors —
  every HA state push currently re-runs badge / alert / sprinkler / bin
  updates. A 5-10s throttle drops that load by ~10-50x with no visual loss
  on a glance display.
- `weather_effects: false` is stronger than `mode: low` (which only caps to
  15fps) — it stops rAF entirely.
- The fridge needs its own HA user account for matching to work. Each device
  identifies via `hass.user`; there's no per-device handle exposed to cards.

### What `low` mode does (auto or manual)
- Removes `backdrop-filter: blur()` on all elements (badges, alerts, footer, energy nodes, pills)
- Replaces with solid semi-transparent backgrounds (visually similar, much cheaper)

### Auto-detection
When `performance: auto` (default), the card samples frame times during the first 60 animation frames (~3 seconds). If the average frame time exceeds 40ms (below 25fps), it automatically enables low-perf mode by adding the `low-perf` CSS class to the card.

### Already implemented (always on)
- Dirty-check badges innerHTML before DOM update
- Dirty-check alerts innerHTML before DOM update
- Dirty-check bins innerHTML before DOM update
- Energy flow cache key — only re-renders when sensor values change by 1+ whole unit
- Energy flow throttled to configurable interval (default 30s)

## Future optimisations (not yet implemented)

### Quick wins
- [x] Cap canvas animation frame rate to 15fps in low-perf mode
- [ ] Disable energy node glow pulse animations in low-perf
- [ ] Disable alert badge pulse animations in low-perf
- [ ] Disable sprinkler rotate/spray animations in low-perf
- [x] Reduce energy flow dots to max 1 per line in low-perf
- [x] Increase energy update interval to 120s in low-perf
- [ ] Reduce star/rain/snow particle counts in low-perf (75% reduction)

### Medium effort
- [ ] Debounce `_updateData` — batch updates to every 5-10s in low-perf
- [ ] Reduce cloud count in low-perf
- [ ] Remove fog particle system in low-perf
- [x] Option to completely disable weather animations (via `performance_profiles[].weather_effects: false`)
- [x] Option to completely disable energy flow (via `performance_profiles[].energy_flow: false`)
- [x] Debounce `_updateData` (via `performance_profiles[].update_throttle`)

### Major refactors
- [ ] Lazy-init energy flow via IntersectionObserver (only build SVG when visible)
- [ ] Move weather canvas to OffscreenCanvas + Web Worker
- [ ] Replace SVG `animateMotion` dots with CSS animations (potentially lighter)
- [ ] Use `will-change: transform` hints for GPU compositing
- [ ] Profile and optimise lightning flash repaints
