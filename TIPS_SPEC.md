# Smart Tips Engine — Spec

## Goal
Replace the static AI footer text with a richer system showing actionable, contextual tips. Instead of "Weather is stable at 24°C" all the time, show things that actually matter right now: bin night, rain incoming, motion in the pool, UV warning, etc.

## Design principles
1. **Quiet by default** — if nothing is relevant, hide the footer entirely (or show a single muted "all good" line)
2. **All tips in one place** — single config block, easy to find and edit
3. **Actionable, not informational** — "bring washing in" not "current humidity 67%"
4. **Prioritised** — when multiple tips fire, show the most important one (or rotate through them)
5. **HA-native templates** — use Jinja2 templates (the same syntax as HA automations) for maximum power and zero learning curve

## User experience

### Display modes
- **Single tip** — shows highest priority active tip, no rotation
- **Rotating** — cycles through all active tips every N seconds (default: 8s)
- **Stacked** — shows top 2-3 tips in a vertical list (might be too crowded)

### Visual treatment
- Each tip has an icon, text, and a "level" (info, warn, danger)
- Background colour reflects level: subtle dark → amber tint → red tint
- Pulse animation on `danger` level
- Click/tap to open the entity that triggered it (optional)

### When nothing is active
- Option A: hide footer completely (preferred — clean look)
- Option B: show a single "All good" or "Quiet evening" message
- Configurable: `idle_message: "All good"` or `idle_message: false` to hide

## Config structure

Both `when:` and `text:` are HA Jinja2 templates — the exact same syntax used in automations, scripts, and template sensors.

```yaml
tips:
  display: rotating          # rotating, single, stacked
  rotation_seconds: 8        # for rotating mode
  hide_when_empty: true      # hide footer when no tips active
  idle_message: false        # or "All good" / "Quiet" / etc.

  rules:
    - id: bin_night
      icon: "mdi:trash-can"
      text: "Bin night — put out the red and yellow bins"
      level: info
      priority: 5
      when: >-
        {{ now().hour >= 17 and
           now().weekday() == 1 }}    # Tuesday evening = Wed bin day

    - id: rain_soon
      icon: "mdi:weather-pouring"
      level: warn
      priority: 8
      text: >-
        Rain expected at {{ state_attr('weather.forecast_home','forecast')[0].datetime[11:16] }}
        — bring washing in
      when: >-
        {{ state_attr('weather.forecast_home','forecast')[:3]
           | selectattr('condition','in',['rainy','pouring'])
           | list | count > 0
           and is_state('binary_sensor.washing_on_line','on') }}

    - id: pool_motion
      icon: "mdi:pool"
      text: "Motion in pool area — keep an eye on the kids"
      level: warn
      priority: 9
      when: >-
        {{ is_state('binary_sensor.pool_motion','on')
           and is_state('input_boolean.kids_home','on') }}

    - id: uv_high
      icon: "mdi:weather-sunny-alert"
      level: warn
      priority: 6
      text: "UV index {{ states('sensor.uv_index') }} — slip slop slap"
      when: >-
        {{ states('sensor.uv_index') | float(0) > 7
           and is_state('sun.sun','above_horizon') }}

    - id: solar_peak
      icon: "mdi:solar-power"
      level: info
      priority: 4
      text: >-
        Solar producing {{ states('sensor.solar_power') | float / 1000 | round(1) }} kW
        — good time to run dishwasher
      when: >-
        {{ states('sensor.solar_power') | float(0) > 5000
           and is_state('switch.dishwasher','off') }}
```

### Why Jinja2 templates?

- **Zero learning curve** — anyone who's written a HA automation already knows the syntax
- **Universal** — every HA helper function works (`now()`, `is_state()`, `state_attr()`, `as_timestamp()`, `relative_time()`, `iif()`, etc.)
- **Powerful** — list comprehensions, filters, math, string formatting, time logic
- **Same engine** — templates are evaluated by HA's backend, exactly like in automations
- **No custom decoder** — we don't have to write or maintain operator parsing

### Template evaluation strategy

**Single subscription, server-side evaluation.** The card combines all rules into ONE Jinja2 template that returns a JSON-serialised list of active tips, already filtered and sorted by priority. HA evaluates the whole thing server-side and pushes only the final result.

```javascript
// Card builds the combined template from rules config
const combinedTemplate = this._buildTipsTemplate(this._config.tips.rules);

// One subscription does it all
hass.connection.subscribeMessage(
  (msg) => { this._activeTips = JSON.parse(msg.result); this._renderFooter(); },
  { type: 'render_template', template: combinedTemplate }
);
```

The combined template looks like:

```jinja
{% set tips = [] %}

{# Rule: bin_night #}
{% if now().hour >= 17 and now().weekday() == 1 %}
  {% set tips = tips + [{
    'id': 'bin_night',
    'icon': 'mdi:trash-can',
    'text': 'Bin night — put out the red and yellow bins',
    'level': 'info',
    'priority': 5
  }] %}
{% endif %}

{# Rule: rain_soon #}
{% if state_attr('weather.forecast_home','forecast')[:3]
      | selectattr('condition','in',['rainy','pouring'])
      | list | count > 0
      and is_state('binary_sensor.washing_on_line','on') %}
  {% set tips = tips + [{
    'id': 'rain_soon',
    'icon': 'mdi:weather-pouring',
    'text': 'Rain expected at ' ~ state_attr('weather.forecast_home','forecast')[0].datetime[11:16] ~ ' — bring washing in',
    'level': 'warn',
    'priority': 8
  }] %}
{% endif %}

{# ... more rules ... #}

{{ tips | sort(attribute='priority', reverse=true) | tojson }}
```

### Why single subscription?

| | 20 subscriptions | 1 subscription |
|---|---|---|
| Websocket connections | 20 long-lived | 1 |
| Subscribe overhead | 20 round trips on load | 1 round trip |
| Reconnect cost | 20 re-subscribes | 1 |
| HA backend tracking | 20 templates tracked separately | 1 template |
| Sort/priority logic | Client-side after collecting results | Server-side in template |
| Card code complexity | Higher (manage 20 lifecycles) | Trivial (receive JSON, render) |

HA handles the entire pipeline: evaluation → filtering → text rendering → sorting → JSON output. The card just receives the final list and renders it. Push-based, near-zero idle cost.

### Considerations

- **Template size** — 20 rules might compile to 200+ lines of Jinja2. HA handles this fine, but very long templates can be slower to parse on initial render. If performance becomes an issue, the card can split into 2-3 batched subscriptions by priority/category
- **Error handling** — if one rule has a syntax error, the whole template fails. The card validates each rule individually during config parsing and skips broken ones with a console warning
- **Debugging** — each tip in the output includes its `id` so the card knows which rule fired
- **Update granularity** — HA re-renders the whole template when ANY referenced entity changes, but this is fine because Jinja2 evaluation is fast and HA only pushes the result if it actually differs from the previous one

## Template helpers (HA-native)

Since we use Jinja2, all standard HA template functions work. Common ones for tips:

```jinja
{# State checks #}
{{ is_state('binary_sensor.front_door', 'on') }}
{{ states('sensor.uv_index') | float(0) > 7 }}
{{ state_attr('weather.forecast_home', 'temperature') < 5 }}

{# Time checks #}
{{ now().hour >= 17 }}
{{ now().weekday() == 1 }}                          {# Monday=0, Sunday=6 #}
{{ now().strftime('%H:%M') > '17:00' }}

{# Date helpers #}
{{ now().month == 12 and now().day == 25 }}        {# Christmas day #}
{{ now().strftime('%m-%d') == '09-08' }}            {# Anniversary #}

{# Sun #}
{{ is_state('sun.sun', 'above_horizon') }}
{{ state_attr('sun.sun','elevation') | float < 10 }}

{# Forecast (next 3 hours rainy) #}
{{ state_attr('weather.forecast_home','forecast')[:3]
   | selectattr('condition','in',['rainy','pouring'])
   | list | count > 0 }}

{# Duration: entity has been in state for X minutes #}
{{ (now() - states.cover.garage_door.last_changed).total_seconds() / 60 > 15 }}

{# Combining with logical operators #}
{{ states('sensor.uv_index') | float > 7
   and is_state('sun.sun', 'above_horizon')
   and not is_state('weather.forecast_home', 'rainy') }}
```

For full reference: [HA Templating Documentation](https://www.home-assistant.io/docs/configuration/templating/)

## Built-in rule library

Pre-built rules users can enable by name. Each is a templated rule shipped with the card — users just enable it and provide the entities they have. Behind the scenes it's just a Jinja2 rule like any other, but they don't have to write the template themselves.

```yaml
tips:
  built_in:
    rain_soon:
      weather_entity: weather.forecast_home
    storm_warning:
      weather_entity: weather.forecast_home
    uv_high:
      uv_entity: sensor.uv_index
      threshold: 7
    frost_overnight:
      weather_entity: weather.forecast_home
    aqi_bad:
      aqi_entity: sensor.waqi_pm2_5
      threshold: 100
    pollen_high:
      pollen_entity: sensor.pollen_level
    pool_motion:
      motion_entity: binary_sensor.pool_motion
      kids_home_entity: input_boolean.kids_home    # optional
    garage_left_open:
      entity: cover.garage_door
      minutes: 15
    door_left_open:
      entity: binary_sensor.front_door
      minutes: 10
    washing_finished:
      power_entity: sensor.washing_machine_power
      threshold_w: 5
    solar_peak:
      solar_entity: sensor.solar_power
      threshold_w: 5000
      appliance_entity: switch.dishwasher
    # These auto-fire from existing card config (bins:, birthdays:)
    bin_night: true
    birthday_today: true
    themed_day_today: true
```

Built-ins use the same `priority`, `level`, `text`, `icon` fields as custom rules — they're just preset templates. Users can override any of those:

```yaml
tips:
  built_in:
    rain_soon:
      weather_entity: weather.forecast_home
      priority: 10                     # bump priority
      text: "Storm coming! Get the kids inside"   # override text
      level: danger                    # bump level
```

## Rule evaluation

- All rules are combined into a **single Jinja2 template** at config parse time
- Card opens **one** `render_template` subscription containing the combined template
- HA evaluates server-side and pushes back a JSON list of currently active tips, already sorted by priority
- The card just parses JSON and renders — no client-side rule logic
- HA pushes updates only when the result actually changes (state-driven, no polling)
- Subscription cleaned up on `setConfig` (rule edit) or `disconnectedCallback` (card removal)
- Edit mode uses a separate "debug" version of the template that returns ALL rules with their evaluation state, so users can see which would fire

## Performance considerations

- **One subscription regardless of rule count** — 5 rules or 50, same network footprint
- Templates are validated individually at config parse time; broken rules are skipped with a console warning rather than failing the whole template
- Idle CPU/network cost is essentially zero — HA pushes only on state changes
- For very large rule sets (>50), the card can optionally split into 2-3 batched subscriptions by category

## Open questions

1. **Tap actions** — should clicking a tip do something? Open the triggering entity? Run a service?
2. **Snooze** — let user dismiss a tip for X hours? Where would the state be stored?
3. **History** — should there be a "previous tips" log? Probably overkill
4. **Translations** — keep `text:` as a plain string or support `{ en: "...", pl: "..." }` per tip?
5. **Multiple footer slots** — show 2 tips at once side by side instead of stacking?
6. **Rotation pause on hover** — pause carousel when user hovers over the footer?
7. **Sound/notification** — should `danger` level tips do anything more attention-grabbing?
8. **Time format** — `time_after: "17:00"` always 24h, or support `"5pm"`?
9. **Operator key collision** — should `gt: 7` use the existing visibility rule syntax (`{ gt: 7 }`) for consistency?

## Migration / backwards compatibility

Current AI status messages would still work as a fallback when no tips are configured AND the auto-built-ins are disabled. So existing dashboards keep their current behaviour until users opt in to `tips:`.

## Implementation phases

### Phase 1 — minimal viable
- Add `tips:` config block parsing
- Subscribe to `render_template` for each rule's `when:` and `text:`
- Handle subscription lifecycle (connect, reconnect, cleanup)
- Implement single-tip and rotating display modes
- Render footer with icon, text, level styling
- Hide footer when no rules active (if `hide_when_empty: true`)
- 5-6 built-in rules (bin night, rain soon, UV high, storm, birthday today, themed day)

### Phase 2 — richer
- Built-in rule library with all the presets
- Edit mode preview showing rule states (active/inactive with template result)
- Stacked display mode
- Tap actions

### Phase 3 — polish
- Translation support
- Snooze
- Multi-slot footer
- Sound/notifications for danger tips
- Template error handling UI

## Notes for later — extend templates to other features

Once the tips template subscription pattern is proven, retrofit it (optionally) onto:

### Alerts — HIGH VALUE
Currently `show_when` is a custom DSL. Templates would unlock cross-entity logic without needing HA helper sensors:
```yaml
# Garage open after dark
- entity: cover.garage_door
  show_when: "{{ is_state('cover.garage_door','open') and is_state('sun.sun','below_horizon') }}"

# Door open for more than 10 minutes
- entity: binary_sensor.front_door
  show_when: >-
    {{ is_state('binary_sensor.front_door','on') and
       (now() - states.binary_sensor.front_door.last_changed).total_seconds() > 600 }}
```
Also support template `label:` and `icon:` for dynamic content.

### Sprinklers — HIGH VALUE
Same idea — show only when watering AND specific conditions:
```yaml
- entity: switch.front_lawn
  show_when: "{{ is_state('switch.front_lawn','on') and not is_state('weather.home','rainy') }}"
```

### Energy nodes — MEDIUM VALUE
- Templated `show_when` (richer than current DSL)
- Templated value display: `text: "{{ states('sensor.solar_power') | float / 1000 }} kW from {{ state_attr('sensor.solar_power','source_count') }} panels"`
- Could replace `reverse: true` with a sign-flipping template
- Could compute combined values: "5.2 kW (78% solar)"

### Room badges — LOW VALUE
- Cross-entity show_when ("only show when door is open")
- Templated value text for combined readings ("23.5°C feels like 26°C")
- Most use cases are satisfied by the existing config

### NOT worth it
- **Bins** — current cadence + anchor_date system is simpler and covers 99% of cases
- **Birthdays** — MM-DD is dead simple, no need
- **Themed days** — built-in date logic, no config needed
- **Christmas calendar** — date-driven, no benefit

### Migration approach
- **Don't break existing configs.** Use distinct property names so the existing DSL and Jinja2 templates can coexist without ambiguity:
  - `show_when:` — keeps the existing structured DSL syntax
  - `show_when_template:` — new, takes a Jinja2 template string
  - If both are set, `show_when_template:` wins (template takes precedence)
- Same pattern for any other field that gets a template variant:
  - `text:` (string) → `text_template:` (Jinja2)
  - `icon:` (string) → `icon_template:` (Jinja2)
  - `color:` (string) → `color_template:` (Jinja2)
- **Exception**: tip `text:` field already supports both literal strings AND `{{...}}` placeholders inline (Jinja2 templates already coexist with literal strings naturally — no ambiguity, since `{{` is only valid as a template marker). So tip `text:` can stay as a single property.
- Documentation shows DSL as the "simple path", `_template` variants as "power user"
- Same subscription/cleanup pattern as tips engine
