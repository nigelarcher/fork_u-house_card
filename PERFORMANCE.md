# Performance Optimisation

## Current: `performance` config

```yaml
performance: auto   # default — auto-detects slow devices
performance: low    # force low-perf mode
performance: high   # force full effects
```

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
- [ ] Option to completely disable weather animations (`weather_effects: false`)
- [ ] Option to completely disable energy flow (`energy.enabled: false`)

### Major refactors
- [ ] Lazy-init energy flow via IntersectionObserver (only build SVG when visible)
- [ ] Move weather canvas to OffscreenCanvas + Web Worker
- [ ] Replace SVG `animateMotion` dots with CSS animations (potentially lighter)
- [ ] Use `will-change: transform` hints for GPU compositing
- [ ] Profile and optimise lightning flash repaints
