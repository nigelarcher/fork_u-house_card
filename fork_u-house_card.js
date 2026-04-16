/**
 * Fork_U-House_Card v12.0 (AI Storyteller Edition)
 * * FEATURE: Long, descriptive, "AI-like" status messages with context & reasoning.
 * * FEATURE: Pollen support restored & integrated into advice logic.
 * * FEATURE: Wind Chill logic (Wind + Cold temp = specific advice).
 * * VISUALS: Prism Classic (Stars, Fog, No-Glow Rain) + Gaming Ambient Mode.
 */

const TRANSLATIONS = {
    en: {
        loading: "Analyzing environmental data...",
        home_median: "Home",
    },
    pl: {
        loading: "Analizuję dane środowiskowe...",
        home_median: "Dom",
    }
};

class ForkUHouseCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._hass = null;
      this._config = {};
      this._animationFrame = null;
      this._canvas = null;
      this._ctx = null;
      this._resizeObserver = null;
      
      // Visuals
      this._particles = []; 
      this._clouds = [];
      this._stars = [];
      this._fogParticles = [];
      
      // Lightning
      this._lightningTimer = 0;
      this._flashOpacity = 0;
      this._lightningBolt = null;
    }
  
    static getStubConfig() {
      return {
        language: "en",
        image: "/local/community/fork_u-house_card/images/",

        // Entities
        weather_entity: "weather.forecast_home",
        season_entity: "sensor.season",
        sun_entity: "sun.sun",
        cloud_coverage_entity: "sensor.home_cloud_coverage",
        party_mode_entity: "input_boolean.gaming_mode",  // enables gaming ambient
        gaming_image: "synthwave",  // gaming image theme: synthwave, cyberpunk, matrix, mario, xbox_kid

        // Themed Days - configure birthdays in your dashboard YAML
        // birthdays: [{ name: "boy_bday", date: "03-15" }, { name: "girl_bday", date: "07-22" }],

        // AI Sensors
        aqi_entity: "sensor.beresfield_lower_hunter_pm2_5",
        pollen_entity: "sensor.home_pollen_types_32_753374151_625700_grass",
        uv_entity: "sensor.home_uv_index",
        wind_speed_entity: "sensor.home_wind_speed",
        wind_direction_entity: "sensor.home_wind_direction",

        rooms: [{ name: "Salon", entity: "sensor.salon_temp", x: 50, y: 50, weight: 1 }]
      };
    }
  
    setConfig(config) {
      if (!config.rooms || !Array.isArray(config.rooms)) throw new Error("Missing 'rooms' list.");
      this._config = config;
      this._lang = config.language || 'en';
      this._editMode = false;
      // Reset energy state on config change
      this._energyPrefsFetched = false;
      this._energyPrefs = null;
      this._energyCacheKey = null;
      this._energyDirty = true;
      this._energyLastUpdate = null;
      // performance: "low" forces it, "auto" (default) detects, "high" disables
      const perfSetting = config.performance ?? 'auto';
      this._lowPerf = perfSetting === 'low';
      this._perfAutoDetect = perfSetting === 'auto';
      this._perfSamples = [];
      // Reset tips state — clean up old subscription if any
      if (this._tipsUnsub) { try { this._tipsUnsub(); } catch (e) {} this._tipsUnsub = null; }
      this._activeTips = [];
      this._tipRotationIdx = 0;
      this._tipsTemplateCache = null;
      this._render();
    }
  
    set hass(hass) {
      this._hass = hass;
      // Coalesce bursts of HA state pushes into one update per animation frame.
      // HA can fire this setter many times per second on busy instances; without
      // this debounce we rebuild all badge/alert/energy HTML strings on every push.
      if (this._updateScheduled) return;
      this._updateScheduled = true;
      this._updateRaf = requestAnimationFrame(() => {
          this._updateScheduled = false;
          this._updateRaf = null;
          this._updateData();
      });
    }

    _t(key, repl = {}) {
        let txt = TRANSLATIONS[this._lang]?.[key] || TRANSLATIONS['en'][key] || key;
        Object.keys(repl).forEach(k => { txt = txt.replace(`{${k}}`, repl[k]); });
        return txt;
    }
  
    connectedCallback() {
      if (this.shadowRoot && !this._resizeObserver) {
          const card = this.shadowRoot.querySelector('.card');
          if (card) {
              this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
              this._resizeObserver.observe(card);
          }
      }
      // Pause the canvas animation loop when the tab is hidden. On low-end
      // tablets (e.g. fridge displays) a 60fps canvas loop running for hours
      // in a background tab accumulates GPU/compositor memory and eventually
      // crashes the renderer.
      if (!this._visibilityHandler) {
          this._visibilityHandler = () => {
              if (document.hidden) {
                  if (this._animationFrame) {
                      cancelAnimationFrame(this._animationFrame);
                      this._animationFrame = null;
                  }
              } else if (!this._animationFrame && this._canvas && this._ctx) {
                  this._animate();
              }
          };
          document.addEventListener('visibilitychange', this._visibilityHandler);
      }
    }

    disconnectedCallback() {
      if (this._resizeObserver) { this._resizeObserver.disconnect(); this._resizeObserver = null; }
      if (this._animationFrame) { cancelAnimationFrame(this._animationFrame); this._animationFrame = null; }
      if (this._updateRaf) { cancelAnimationFrame(this._updateRaf); this._updateRaf = null; this._updateScheduled = false; }
      if (this._tipsUnsub) { try { this._tipsUnsub(); } catch (e) {} this._tipsUnsub = null; }
      if (this._tipRotationTimer) { clearInterval(this._tipRotationTimer); this._tipRotationTimer = null; }
      if (this._visibilityHandler) {
          document.removeEventListener('visibilitychange', this._visibilityHandler);
          this._visibilityHandler = null;
      }
    }

    // --- IMAGE SELECTION LOGIC ---
    // Priority: Gaming > Birthdays > Themed Days (by date) > Weather > Season fallback

    _getNthSundayOfMonth(year, month, n) {
        // Returns the date of the nth Sunday in a given month (1-indexed)
        const d = new Date(year, month - 1, 1);
        let count = 0;
        while (count < n) {
            if (d.getDay() === 0) count++;
            if (count < n) d.setDate(d.getDate() + 1);
        }
        return d.getDate();
    }

    _getNthDayOfMonth(year, month, dayOfWeek, n) {
        // Returns the date of the nth occurrence of dayOfWeek (0=Sun..6=Sat) in a month
        const d = new Date(year, month - 1, 1);
        let count = 0;
        while (count < n) {
            if (d.getDay() === dayOfWeek) count++;
            if (count < n) d.setDate(d.getDate() + 1);
        }
        return d.getDate();
    }

    _getLastDayOfMonth(year, month, dayOfWeek) {
        // Returns the date of the last occurrence of dayOfWeek in a month
        const d = new Date(year, month, 0); // last day of month
        while (d.getDay() !== dayOfWeek) d.setDate(d.getDate() - 1);
        return d.getDate();
    }

    _getEasterSunday(year) {
        // Anonymous Gregorian algorithm for Easter Sunday
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        return { month, day };
    }

    _calculateImage() {
        const path = this._config.image_path || "/local/community/fork_u-house_card/images/";

        // 1. Time of Day
        const sunState = this._hass.states[this._config.sun_entity || 'sun.sun']?.state || 'above_horizon';
        const timeOfDay = sunState === 'below_horizon' ? 'night' : 'day';

        // 2. Season (needed by multiple checks below)
        let season = this._hass.states[this._config.season_entity]?.state || 'summer';
        const seasonMap = { 'wiosna': 'spring', 'lato': 'summer', 'jesień': 'autumn', 'zima': 'winter' };
        if (seasonMap[season]) season = seasonMap[season];
        season = season.toLowerCase();

        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const year = now.getFullYear();
        const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        // --- PRIORITY 1: Gaming Mode ---
        const partyEntity = this._config.party_mode_entity;
        const isGaming = partyEntity && this._hass.states[partyEntity]?.state === 'on';
        if (isGaming && this._config.gaming_image) {
            return `${path}gaming_${this._config.gaming_image}.png`;
        }

        // --- PRIORITY 2: Christmas Calendar (Dec 1 - Dec 26) ---
        // Full month of xmas! Each day has a unique scene: xmas_dec{day}_{time}.png
        // Even days = traditional winter, odd days = australian summer
        // Dec 23 combines girl_bday + xmas. Falls back to generic xmas images.
        if (month === 12 && day >= 1 && day <= 26) {
            const adventImage = `${path}xmas_dec${day}_${timeOfDay}.png`;
            this._xmasFallback = day % 2 !== 0
                ? `${path}xmas_australian_${timeOfDay}.png`
                : `${path}xmas_${timeOfDay}.png`;
            return adventImage;
        }

        // --- PRIORITY 3: Birthdays (hardcoded dates, exact match) ---
        const birthdays = this._config.birthdays || [];
        for (const bday of birthdays) {
            if (bday.date === mmdd) {
                // Birthday themes have all-season variants: themed_{name}_{season}_{time}.png
                return `${path}themed_${bday.name}_${season}_${timeOfDay}.png`;
            }
        }

        // --- PRIORITY 4: Themed Days by date ---

        // New Years Eve & Day (Dec 31 - Jan 1)
        if ((month === 12 && day === 31) || (month === 1 && day === 1)) {
            return `${path}themed_new_years_${timeOfDay}.png`;
        }

        // Australia Day (Jan 26)
        if (month === 1 && day === 26) {
            return `${path}themed_australia_day_${timeOfDay}.png`;
        }

        // Back to School (Jan 27 - Jan 31)
        if (month === 1 && day >= 27 && day <= 31) {
            return `${path}themed_back_to_school_${timeOfDay}.png`;
        }

        // Lunar New Year (Jan 20 - Feb 12 approximate range, varies yearly)
        // Shows for 3 days around the actual date — simplified to late Jan/early Feb
        if ((month === 1 && day >= 20) || (month === 2 && day <= 12)) {
            // Only show if not overlapping with Australia Day or Back to School above
            return `${path}themed_lunar_new_year_${timeOfDay}.png`;
        }

        // Valentine's Day (Feb 14)
        if (month === 2 && day === 14) {
            return `${path}themed_valentines_day_${timeOfDay}.png`;
        }

        // St Patrick's Day (Mar 17)
        if (month === 3 && day === 17) {
            return `${path}themed_st_patricks_day_${timeOfDay}.png`;
        }

        // Neighbour Day (last Sunday of March)
        if (month === 3) {
            const neighbourDay = this._getLastDayOfMonth(year, 3, 0);
            if (day === neighbourDay) {
                return `${path}themed_neighbour_day_${timeOfDay}.png`;
            }
        }

        // Easter (Good Friday to Easter Monday — 4 days)
        {
            const easter = this._getEasterSunday(year);
            const easterDate = new Date(year, easter.month - 1, easter.day);
            const goodFriday = new Date(easterDate);
            goodFriday.setDate(easterDate.getDate() - 2);
            const easterMonday = new Date(easterDate);
            easterMonday.setDate(easterDate.getDate() + 1);
            const todayDate = new Date(year, month - 1, day);
            if (todayDate >= goodFriday && todayDate <= easterMonday) {
                return `${path}themed_easter_${timeOfDay}.png`;
            }
        }

        // ANZAC Day (Apr 25)
        if (month === 4 && day === 25) {
            return `${path}themed_anzac_day_${timeOfDay}.png`;
        }

        // Mothers Day (2nd Sunday of May in Australia)
        if (month === 5) {
            const mothersDay = this._getNthSundayOfMonth(year, 5, 2);
            if (day === mothersDay) {
                return `${path}themed_mothers_day_${timeOfDay}.png`;
            }
        }

        // World Environment Day (Jun 5)
        if (month === 6 && day === 5) {
            return `${path}themed_environment_day_${timeOfDay}.png`;
        }

        // State of Origin (3 games in Jun-Jul, approximate: show for June Wed nights)
        // Games are typically Wed nights in June/early July
        {
            const sooGame1 = this._getNthDayOfMonth(year, 6, 3, 1); // 1st Wed June
            const sooGame2 = this._getNthDayOfMonth(year, 6, 3, 3); // 3rd Wed June
            const sooGame3 = this._getNthDayOfMonth(year, 7, 3, 2); // 2nd Wed July
            if ((month === 6 && (day === sooGame1 || day === sooGame2)) ||
                (month === 7 && day === sooGame3)) {
                return `${path}themed_state_of_origin_${timeOfDay}.png`;
            }
        }

        // Wedding Anniversary (Sep 8)
        if (month === 9 && day === 8) {
            return `${path}themed_wedding_anniversary_${timeOfDay}.png`;
        }

        // Fathers Day (1st Sunday of September in Australia)
        if (month === 9) {
            const fathersDay = this._getNthSundayOfMonth(year, 9, 1);
            if (day === fathersDay) {
                return `${path}themed_fathers_day_${timeOfDay}.png`;
            }
        }

        // AFL Grand Final (last Saturday of September)
        if (month === 9) {
            const aflFinal = this._getLastDayOfMonth(year, 9, 6); // last Saturday
            if (day === aflFinal) {
                return `${path}themed_afl_grand_final_${timeOfDay}.png`;
            }
        }

        // Halloween (Oct 25 - Oct 31)
        if (month === 10 && day >= 25) {
            return `${path}halloween_${timeOfDay}.png`;
        }

        // Melbourne Cup (1st Tuesday of November)
        if (month === 11) {
            const melbCup = this._getNthDayOfMonth(year, 11, 2, 1); // 1st Tuesday
            if (day === melbCup) {
                return `${path}themed_melbourne_cup_${timeOfDay}.png`;
            }
        }

        // --- PRIORITY 5: Xbox Kid (themed day, no date - config driven) ---
        // Can be triggered via a HA entity if desired
        // TODO: future - calendar integration

        // --- PRIORITY 6: Weather variants ---
        const wStateRaw = this._hass.states[this._config.weather_entity]?.state;
        let weatherSuffix = null;

        if (wStateRaw) {
            const s = wStateRaw.toLowerCase();
            if (['lightning', 'lightning-rainy'].includes(s)) {
                weatherSuffix = 'lightning';
            } else if (['rainy', 'pouring'].includes(s)) {
                weatherSuffix = 'rainy';
            } else if (['snowy', 'snowy-rainy'].includes(s)) {
                weatherSuffix = 'snowy';
            } else if (s === 'hail') {
                weatherSuffix = 'hail';
            } else if (s === 'fog') {
                weatherSuffix = 'fog';
            }
        }

        if (weatherSuffix) {
            const configKey     = `img_${season}_${timeOfDay}_${weatherSuffix}`;
            const configKey_alt = `img_${season}_${weatherSuffix}_${timeOfDay}`;
            if (this._config[configKey] === true || this._config[configKey_alt] === true) {
                return `${path}${season}_${weatherSuffix}_${timeOfDay}.png`;
            }
        }

        // --- PRIORITY 7: Season fallback ---
        return `${path}${season}_${timeOfDay}.png`;
    }

    // --- DATA LOGIC ---
    _updateData() {
      if (!this._hass || !this.shadowRoot.querySelector('.card')) return;

      // Detect edit mode — walk up through shadow DOM boundaries (cache result)
      if (this._editModeChecked === undefined) {
          let el = this;
          this._editMode = false;
          while (el) {
              if (el.classList?.contains('element-preview') ||
                  el.tagName?.toLowerCase() === 'hui-card-preview') {
                  this._editMode = true;
                  break;
              }
              if (el.parentElement) {
                  el = el.parentElement;
              } else {
                  const root = el.getRootNode();
                  el = root?.host ?? null;
              }
          }
          this._editModeChecked = true;
      }

      // --- DYNAMIC BACKGROUND UPDATE ---
      const newImage = this._calculateImage();
      if (this._currentImageUrl !== newImage) {
          this._currentImageUrl = newImage;
          const bgEl = this.shadowRoot.querySelector('.bg-image');
          if (bgEl) {
              const img = new Image();
              img.onload = () => { bgEl.style.backgroundImage = `url('${newImage}')`; };
              img.onerror = () => {
                  // Fallback: if day-specific xmas image missing, use generic
                  if (this._xmasFallback) {
                      bgEl.style.backgroundImage = `url('${this._xmasFallback}')`;
                      this._xmasFallback = null;
                  }
              };
              img.src = newImage;
          }
      }

      // Rooms & Median
      const roomsData = this._config.rooms.map(r => {
        const s = this._hass.states[r.entity];
        const v = s ? parseFloat(s.state) : null;
        return { ...r, value: v, valid: v !== null && !isNaN(v) };
      });
      
      const weighted = roomsData.filter(r => r.valid && (r.weight === undefined || r.weight > 0) && (r.unit === undefined || r.unit === '°')).map(r => r.value).sort((a,b)=>a-b);
      let median = 0;
      if (weighted.length > 0) {
        const mid = Math.floor(weighted.length/2);
        median = weighted.length % 2 !== 0 ? weighted[mid] : (weighted[mid-1]+weighted[mid])/2;
      }
  
      // Updates
      this._updateBadges(roomsData);
      this._updateAlerts();
      this._updateSprinklers();
      this._updateBins();
      this._updateEnergy();
      this._handleGamingMode();
      this._handleDayNight();
      this._setupTips();
      this._updateMedianPill(median);
  
      // Animation Loop
      if (!this._animationFrame && this._canvas) {
        this._initStars();
        this._animate();
      }
    }
  
    _evaluateVisibility(rule, value) {
        // Supports: number, string, array, or object with operator
        // show_when: 42              — exact match
        // show_when: "on"            — string match
        // show_when: [1, 2, 3]       — value in array
        // show_when: { gt: 10 }      — greater than
        // show_when: { lt: 50 }      — less than
        // show_when: { gte: 10 }     — greater than or equal
        // show_when: { lte: 50 }     — less than or equal
        // show_when: { eq: 42 }      — equals
        // show_when: { neq: 0 }      — not equals
        // show_when: { range: [10, 50] } — between (inclusive)
        if (rule === undefined || rule === null) return true;

        if (Array.isArray(rule)) {
            // Check if array contains operator objects (HA reformats {gt:1} to [{gt:1}])
            // If first element is an object with operator keys, treat as operator
            const ops = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq', 'range'];
            if (rule.length > 0 && typeof rule[0] === 'object' && rule[0] !== null) {
                const firstKeys = Object.keys(rule[0]);
                if (firstKeys.some(k => ops.includes(k))) {
                    // Merge all objects in the array into one rule object
                    const merged = Object.assign({}, ...rule);
                    return this._evaluateVisibility(merged, value);
                }
            }
            return rule.some(r => String(r).toLowerCase() === String(value).toLowerCase());
        }

        if (typeof rule === 'object') {
            const v = parseFloat(value);
            if (isNaN(v)) return false;
            if (rule.gt !== undefined && !(v > rule.gt)) return false;
            if (rule.lt !== undefined && !(v < rule.lt)) return false;
            if (rule.gte !== undefined && !(v >= rule.gte)) return false;
            if (rule.lte !== undefined && !(v <= rule.lte)) return false;
            if (rule.eq !== undefined && !(v === rule.eq)) return false;
            if (rule.neq !== undefined && !(v !== rule.neq)) return false;
            if (rule.range !== undefined) {
                if (!(v >= rule.range[0] && v <= rule.range[1])) return false;
            }
            return true;
        }

        // Simple value match (string or number)
        return String(rule).toLowerCase() === String(value).toLowerCase();
    }

    _updateBadges(rooms) {
      const container = this.shadowRoot.querySelector('.badges-layer');
      if (!container) return;
      const html = rooms.map(room => {
        if (!room.valid) return '';
        // Visibility check (in edit mode, show hidden items at reduced opacity)
        let editHidden = false;
        if (room.show_when !== undefined) {
            const state = this._hass.states[room.entity]?.state;
            if (!this._evaluateVisibility(room.show_when, state)) {
                if (!this._editMode) return '';
                editHidden = true;
            }
        }
        const top = room.y ?? 50; const left = room.x ?? 50;
        const unit = room.unit ?? '°';
        const { colorClass, colorStyle } = this._getBadgeColor(room);
        const editStyle = editHidden ? ' opacity: 0.3; outline: 1px dashed rgba(255,255,255,0.3);' : '';
        return `
          <div class="badge ${colorClass}" style="top: ${top}%; left: ${left}%;${editStyle}">
            <div class="badge-dot" ${colorStyle}></div>
            <div class="badge-content">
              <span class="badge-name">${room.name}</span>
              <span class="badge-val">${room.value.toFixed(1)}${unit}</span>
            </div>
          </div>`;
      }).join('');
      if (container.innerHTML !== html) container.innerHTML = html;
    }

    _getBadgeColor(room) {
        // Custom thresholds & colors per room:
        //   thresholds: [low, mid, high]   — 3 boundaries = 4 zones
        //   colors: [color1, color2, color3, color4] — one per zone
        // Falls back to global temp_thresholds config, then defaults.
        const v = room.value;

        if (room.thresholds && room.colors) {
            const t = room.thresholds;
            const c = room.colors;
            let color;
            if (v < t[0]) color = c[0];
            else if (v < t[1]) color = c[1] ?? c[0];
            else if (v < t[2]) color = c[2] ?? c[1] ?? c[0];
            else color = c[3] ?? c[2] ?? c[1] ?? c[0];
            return { colorClass: '', colorStyle: `style="background:${color}; box-shadow: 0 0 5px ${color};"` };
        }

        // No custom config — use temp classes (only for ° unit)
        if ((room.unit ?? '°') !== '°') {
            return { colorClass: 'is-neutral', colorStyle: '' };
        }

        // Default temp thresholds — configurable globally via temp_thresholds
        const defaults = this._config.temp_thresholds || [18, 24, 30, 35];
        if (v < defaults[0]) return { colorClass: 'is-cold', colorStyle: '' };
        if (v < defaults[1]) return { colorClass: 'is-optimal', colorStyle: '' };
        if (v < defaults[2]) return { colorClass: 'is-warm', colorStyle: '' };
        return { colorClass: 'is-hot', colorStyle: '' };
    }

    _updateAlerts() {
        const container = this.shadowRoot.querySelector('.alerts-layer');
        if (!container) return;
        const alerts = this._config.alerts || [];
        const html = alerts.map(alert => {
            const state = this._hass.states[alert.entity]?.state;
            if (!state && !this._editMode) return '';

            // Determine if alert is active
            let editHidden = false;
            if (!this._evaluateVisibility(alert.show_when ?? 'on', state ?? '')) {
                if (!this._editMode) return '';
                editHidden = true;
            }

            const top = alert.y ?? 50;
            const left = alert.x ?? 50;
            const rawIcon = alert.icon ?? '!';
            const color = alert.color || null;
            const label = alert.label ?? '';
            const pulse = (!editHidden && alert.pulse !== false) ? 'alert-pulse' : '';

            // Support mdi: icons (rendered as HA icon element) or emoji/text
            const iconColor = alert.icon_color ?? (color ? '#fff' : '#ccc');
            const iconContent = rawIcon.startsWith('mdi:')
                ? `<ha-icon icon="${rawIcon}" style="--mdc-icon-size: 14px; color: ${iconColor};"></ha-icon>`
                : rawIcon;

            const iconStyle = color
                ? `style="background: ${color}; box-shadow: 0 0 8px ${color};"`
                : `style="background: transparent; width: auto; height: auto;"`;

            const editStyle = editHidden ? ' opacity: 0.3; outline: 1px dashed rgba(255,255,255,0.3);' : '';

            return `
              <div class="alert-badge ${pulse}" style="top: ${top}%; left: ${left}%;${editStyle}">
                <div class="alert-icon" ${iconStyle}>${iconContent}</div>
                ${label ? `<span class="alert-label">${label}</span>` : ''}
              </div>`;
        }).join('');
        if (container.innerHTML !== html) container.innerHTML = html;
    }

    _updateSprinklers() {
        const container = this.shadowRoot.querySelector('.sprinklers-layer');
        if (!container) return;
        const sprinklers = this._config.sprinklers || [];
        const html = sprinklers.map(zone => {
            const state = this._hass.states[zone.entity]?.state;
            if (!state && !this._editMode) return '';
            let editHidden = false;
            if (!this._evaluateVisibility(zone.show_when ?? 'on', state ?? '')) {
                if (!this._editMode) return '';
                editHidden = true;
            }

            const top = zone.y ?? 50;
            const left = zone.x ?? 50;
            const color = zone.color ?? '#38BDF8';
            const label = zone.label ?? '';
            const size = zone.size ?? 'medium';
            const sizeClass = `sprinkler-${size}`;
            const editStyle = editHidden ? ' opacity: 0.3; outline: 1px dashed rgba(255,255,255,0.3);' : '';

            return `
              <div class="sprinkler-zone ${sizeClass}" style="top: ${top}%; left: ${left}%;${editStyle}">
                <div class="sprinkler-head" style="color: ${color};">
                  <div class="sprinkler-spray" style="border-color: ${color};"></div>
                  <div class="sprinkler-spray spray-2" style="border-color: ${color};"></div>
                  <div class="sprinkler-spray spray-3" style="border-color: ${color};"></div>
                  <div class="sprinkler-icon">💦</div>
                </div>
                ${label ? `<span class="sprinkler-label">${label}</span>` : ''}
              </div>`;
        }).join('');
        if (container.innerHTML !== html) container.innerHTML = html;
    }

    _isBinCollectionDay(bin, checkDate) {
        // Returns true if checkDate is a collection day for this bin
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const collectionDay = bin.day?.toLowerCase();
        const dateDayName = dayNames[checkDate.getDay()];

        // Wrong day of week — not a collection day
        if (collectionDay !== dateDayName) return false;

        // Cadence check: weekly (default), fortnightly, monthly
        const cadence = (bin.cadence ?? 'weekly').toLowerCase();
        if (cadence === 'weekly') return true;

        // Need an anchor_date for fortnightly/monthly
        if (!bin.anchor_date) return true; // no anchor = assume every occurrence

        // Parse anchor date (YYYY-MM-DD)
        const anchor = new Date(bin.anchor_date + 'T00:00:00');
        if (isNaN(anchor.getTime())) return true; // invalid anchor = show anyway

        if (cadence === 'fortnightly') {
            // Count weeks between anchor and check date
            const msPerWeek = 7 * 24 * 60 * 60 * 1000;
            const diffWeeks = Math.round((checkDate - anchor) / msPerWeek);
            return diffWeeks % 2 === 0;
        }

        if (cadence === 'monthly') {
            // Same occurrence-of-weekday in the month as the anchor
            const anchorOccurrence = Math.ceil(anchor.getDate() / 7);
            const checkOccurrence = Math.ceil(checkDate.getDate() / 7);
            return anchorOccurrence === checkOccurrence;
        }

        return true;
    }

    _updateBins() {
        const container = this.shadowRoot.querySelector('.bins-layer');
        if (!container) return;
        const bins = this._config.bins || [];
        if (bins.length === 0) return;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tonight = now.getHours() >= 17;

        const html = bins.map(bin => {
            // Show if today is collection day, or from 5pm the night before
            const show = this._isBinCollectionDay(bin, today) || (tonight && this._isBinCollectionDay(bin, tomorrow));
            if (!show) return '';

            const top = bin.y ?? 85;
            const left = bin.x ?? 15;
            const color = bin.color ?? '#888';
            const label = bin.label ?? '';

            return `
              <div class="bin-badge" style="top: ${top}%; left: ${left}%;">
                <svg class="bin-svg" viewBox="0 0 40 50" width="28" height="35" xmlns="http://www.w3.org/2000/svg">
                  <!-- Isometric wheelie bin (square proportions, top-down ~30deg) -->
                  <!-- Ground shadow -->
                  <ellipse cx="20" cy="47" rx="10" ry="2.5" fill="rgba(0,0,0,0.2)"/>
                  <!-- Left face (darker, in shadow) -->
                  <path d="M6 16 L20 22 L18 44 L8 40 Z" fill="#2e2e2e"/>
                  <!-- Left ridges -->
                  <line x1="7" y1="22" x2="19.6" y2="27.5" stroke="#383838" stroke-width="0.5"/>
                  <line x1="7.4" y1="28" x2="19.2" y2="33" stroke="#383838" stroke-width="0.5"/>
                  <line x1="7.8" y1="34" x2="18.8" y2="38.5" stroke="#383838" stroke-width="0.5"/>
                  <!-- Right face (lighter, catching light) -->
                  <path d="M20 22 L34 16 L32 40 L18 44 Z" fill="#444"/>
                  <!-- Right ridges -->
                  <line x1="20.4" y1="27.5" x2="33.4" y2="22" stroke="#4f4f4f" stroke-width="0.5"/>
                  <line x1="19.8" y1="33" x2="32.8" y2="28" stroke="#4f4f4f" stroke-width="0.5"/>
                  <line x1="19.2" y1="38.5" x2="32.2" y2="34" stroke="#4f4f4f" stroke-width="0.5"/>
                  <!-- Wheels (bottom edge) -->
                  <ellipse cx="12" cy="42" rx="1.8" ry="0.9" fill="#1a1a1a"/>
                  <ellipse cx="19" cy="44.5" rx="1.8" ry="0.9" fill="#1a1a1a"/>
                  <!-- Lid top (coloured, symmetric isometric diamond) -->
                  <path d="M6 12 L20 6 L34 12 L20 18 Z" fill="${color}"/>
                  <!-- Lid left edge -->
                  <path d="M6 12 L6 16 L20 22 L20 18 Z" fill="${color}" opacity="0.5"/>
                  <!-- Lid right edge -->
                  <path d="M20 18 L20 22 L34 16 L34 12 Z" fill="${color}" opacity="0.35"/>
                  <!-- Handle (across lid top) -->
                  <path d="M13 10 L27 10" stroke="#555" stroke-width="1.5" stroke-linecap="round"/>
                  <!-- Top edge highlight -->
                  <path d="M6 12 L20 6 L34 12" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="0.5"/>
                </svg>
                ${label ? `<span class="bin-label" style="color: ${color};">${label}</span>` : ''}
              </div>`;
        }).join('');
        if (container.innerHTML !== html) container.innerHTML = html;
    }

    async _fetchEnergyPrefs() {
        // Cache for 60s to avoid hammering the websocket
        const now = Date.now();
        if (this._energyPrefsCache && now - this._energyPrefsCacheTime < 60000) {
            return this._energyPrefsCache;
        }
        try {
            const prefs = await this._hass.callWS({ type: 'energy/get_prefs' });
            this._energyPrefsCache = prefs;
            this._energyPrefsCacheTime = now;
            return prefs;
        } catch (e) {
            return null;
        }
    }

    _resolveEnergyNodes(energyCfg, prefs) {
        // Merge HA energy dashboard auto-discovered nodes with manual config.
        // Manual nodes in energyCfg.nodes always take priority.
        // Auto-discovered nodes fill in from HA energy prefs.

        const manualNodes = energyCfg.nodes || [];
        // auto: true is shorthand for both. Can also set individually.
        const autoSources = energyCfg.auto_sources ?? energyCfg.auto ?? false;
        const autoConsumers = energyCfg.auto_consumers ?? energyCfg.auto ?? false;
        if ((!autoSources && !autoConsumers) || !prefs) return manualNodes;

        const positions = energyCfg.node_positions || {};
        const consumerPositions = energyCfg.consumer_positions || {};

        // Track which entities and types are already manually configured
        const manualEntities = new Set(manualNodes.map(n => n.entity));
        const manualTypes = new Set(manualNodes.filter(n => n.replaces).map(n => n.replaces));

        const autoNodes = [];
        const sources = prefs.energy_sources || [];

        // Default positions for auto-discovered sources (spread around the house)
        const defaultSourcePositions = {
            solar: { x: 57, y: 12, icon: 'mdi:solar-power', color: '#FBBF24' },
            grid: { x: 88, y: 55, icon: 'mdi:transmission-tower', color: '#60A5FA' },
            battery: { x: 15, y: 30, icon: 'mdi:battery', color: '#34D399' },
        };

        autoSources && sources.forEach(source => {
            // Skip if manual node replaces this type
            if (manualTypes.has(source.type)) return;

            if (source.type === 'solar') {
                const entity = source.stat_rate || source.config_entry_solar_forecast?.[0] || source.stat_energy_from;
                if (!entity || manualEntities.has(entity)) return;
                const pos = positions.solar || defaultSourcePositions.solar;
                autoNodes.push({
                    entity, direction: 'source', max: 10,
                    ...defaultSourcePositions.solar, ...pos,
                });
            } else if (source.type === 'grid') {
                const importEntity = source.power_config?.stat_rate_from || source.power_config?.stat_rate || source.stat_energy_from;
                if (importEntity && !manualEntities.has(importEntity)) {
                    const pos = positions.grid || defaultSourcePositions.grid;
                    autoNodes.push({
                        entity: importEntity, direction: 'source', max: 8,
                        ...defaultSourcePositions.grid, ...pos,
                    });
                }
            } else if (source.type === 'battery') {
                const dischargeEntity = source.power_config?.stat_rate_from || source.power_config?.stat_rate || source.stat_energy_from;
                if (dischargeEntity && !manualEntities.has(dischargeEntity)) {
                    const pos = positions.battery || defaultSourcePositions.battery;
                    autoNodes.push({
                        entity: dischargeEntity, direction: 'source', max: 5,
                        ...defaultSourcePositions.battery, ...pos,
                    });
                }
            }
        });

        // Device consumers from energy dashboard
        if (!autoConsumers) return [...manualNodes, ...autoNodes];
        const devices = prefs.device_consumption || [];
        let consumerIdx = 0;
        const defaultConsumerSpots = [
            { x: 30, y: 60 }, { x: 20, y: 72 }, { x: 70, y: 70 },
            { x: 35, y: 80 }, { x: 60, y: 65 }, { x: 75, y: 80 },
        ];

        devices.forEach(device => {
            const entity = device.stat_rate || device.stat_consumption;
            if (!entity || manualEntities.has(entity)) return;
            const pos = consumerPositions[entity] || consumerPositions[device.stat_consumption] || {};
            const defaultPos = defaultConsumerSpots[consumerIdx % defaultConsumerSpots.length];
            consumerIdx++;
            autoNodes.push({
                entity, direction: 'consumer', max: 3, size: 30,
                icon: 'mdi:flash', color: '#FB923C',
                name: device.name || entity.split('.').pop().replace(/_/g, ' '),
                x: defaultPos.x, y: defaultPos.y,
                ...pos,
            });
        });

        // Manual nodes take priority, auto nodes fill gaps
        return [...manualNodes, ...autoNodes];
    }

    _updateEnergy() {
        const container = this.shadowRoot.querySelector('.energy-layer');
        if (!container) return;
        const energyCfg = this._config.energy;
        if (!energyCfg || !energyCfg.home) {
            if (container.innerHTML) container.innerHTML = '';
            return;
        }

        // Throttle: only process every 30 seconds
        const now = Date.now();
        const defaultInterval = this._lowPerf ? 120 : 30;
        const interval = (energyCfg.update_interval ?? defaultInterval) * 1000;
        if (this._energyLastUpdate && now - this._energyLastUpdate < interval && !this._energyDirty) return;
        this._energyLastUpdate = now;

        // Kick off async prefs fetch if any auto mode enabled (once)
        const needsAutoFetch = energyCfg.auto || energyCfg.auto_sources || energyCfg.auto_consumers;
        if (needsAutoFetch && !this._energyPrefsFetched) {
            this._energyPrefsFetched = true;
            this._fetchEnergyPrefs().then(prefs => {
                this._energyPrefs = prefs;
                this._energyDirty = true; // flag to re-render on next update cycle
            });
            // On first call with no cache, show manual nodes only
            if (!this._energyPrefs && (!energyCfg.nodes || energyCfg.nodes.length === 0)) return;
        }

        const resolvedNodes = this._resolveEnergyNodes(energyCfg, this._energyPrefs);
        if (resolvedNodes.length === 0 && !energyCfg.home.entity) {
            if (container.innerHTML) container.innerHTML = '';
            return;
        }

        const card = this.shadowRoot.querySelector('.card');
        if (!card) return;
        const w = card.offsetWidth || 800;
        const h = card.offsetHeight || 533;

        // Helper: get value in kW, auto-converting from W if needed.
        // Only accepts power units (W, kW) — energy units (Wh, kWh) are
        // cumulative totals, not instantaneous readings, and would give
        // nonsensical flow values if used here.
        const getKw = (entityId, cfgUnit) => {
            const raw = this._getStateVal(entityId) ?? 0;
            if (cfgUnit) return { val: raw, unit: cfgUnit }; // manual unit override
            const stateObj = this._hass.states[entityId];
            const haUnit = stateObj?.attributes?.unit_of_measurement ?? '';
            if (haUnit === 'W') return { val: raw / 1000, unit: 'kW' };
            if (haUnit === 'kW') return { val: raw, unit: 'kW' };
            return { val: raw, unit: haUnit || 'kW' };
        };

        // Get home node config
        const homeCfg = energyCfg.home;
        const homeX = (homeCfg.x ?? 50) / 100 * w;
        const homeY = (homeCfg.y ?? 40) / 100 * h;
        const homeColor = homeCfg.color ?? '#A78BFA';
        const homeIcon = homeCfg.icon ?? 'mdi:home';

        // Home value: use entity if provided, otherwise calculate from nodes
        // Home consumption = sum of sources flowing in - (grid export if present)
        let homeVal;
        let homeUnit;
        if (homeCfg.entity) {
            const homeData = getKw(homeCfg.entity, homeCfg.unit);
            homeVal = homeData.val;
            homeUnit = homeData.unit;
        } else {
            // Auto-calculate: sum sources - sum consumers going out (like grid export)
            let totalSources = 0;
            resolvedNodes.forEach(n => {
                const nData = getKw(n.entity, n.unit);
                const v = Math.abs(nData.val);
                if (n.direction === 'source') totalSources += v;
            });
            homeVal = totalSources;
            homeUnit = homeCfg.unit ?? 'kW';
        }

        // Build SVG paths and dots, plus node HTML
        let svgPaths = '';
        let svgDots = '';
        let nodesHtml = '';

        resolvedNodes.forEach((node, idx) => {
            const nodeData = getKw(node.entity, node.unit);
            const val = nodeData.val;
            const absVal = Math.abs(val);
            const max = node.max ?? 10;
            const color = node.color ?? '#888';
            const icon = node.icon ?? 'mdi:flash';
            const unit = nodeData.unit;
            const label = node.name ?? '';
            const nx = (node.x ?? 50) / 100 * w;
            const ny = (node.y ?? 50) / 100 * h;
            const configIsSource = node.direction === 'source';
            // Flip direction based on sign: negative value = reverse flow
            // reverse: true inverts the sign convention for sensors that report positive for charging
            const effectiveVal = node.reverse ? -val : val;
            const isSource = effectiveVal >= 0 ? configIsSource : !configIsSource;
            const showWhen = node.show_when;
            const nodeSize = node.size ?? (configIsSource ? 44 : 30);

            // Visibility check (in edit mode, show hidden items at reduced opacity)
            let editHidden = false;
            if (showWhen !== undefined) {
                const state = this._hass.states[node.entity]?.state;
                if (!this._evaluateVisibility(showWhen, state)) {
                    if (!this._editMode) return;
                    editHidden = true;
                }
            }

            // Dim or hide when near zero (< 0.1 kW)
            const nearZero = absVal < 0.1 && !editHidden;
            if (nearZero) {
                if (node.hide_zero === true && !this._editMode) return;
                // Show very faint
                const dimIcon = icon.startsWith('mdi:')
                    ? `<ha-icon icon="${icon}" style="--mdc-icon-size: ${nodeSize * 0.45}px; color: #555;"></ha-icon>`
                    : `<span style="font-size:${nodeSize * 0.45}px; color: #555;">${icon}</span>`;
                nodesHtml += `
                  <div class="energy-node energy-off" style="top: ${node.y ?? 50}%; left: ${node.x ?? 50}%; opacity: 0.15;">
                    <div class="enode-circle" style="width:${nodeSize}px; height:${nodeSize}px; border-color: #444;">
                      ${dimIcon}
                    </div>
                  </div>`;
                return;
            }

            // Flow path direction: dots animate from start to end of path
            // source: node → home (producing), consumer: home → node (consuming)
            // When sign flips (isSource !== configIsSource), direction reverses
            const pathId = `epath-${idx}`;
            let x1, y1, x2, y2;
            if (isSource) {
                // Producing: dots flow from this node to home
                x1 = nx; y1 = ny; x2 = homeX; y2 = homeY;
            } else {
                // Consuming: dots flow from home to this node
                x1 = homeX; y1 = homeY; x2 = nx; y2 = ny;
            }

            // Curved path with perpendicular offset
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const curvature = node.curvature ?? 0.15;
            const cx = midX - dy * curvature;
            const cy = midY + dx * curvature;

            svgPaths += `<path id="${pathId}" d="M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.25"/>`;

            // Animated dots — count and speed based on power
            const intensity = Math.min(absVal / max, 1);
            const dotCount = this._lowPerf ? 1 : Math.max(1, Math.round(intensity * 4));
            const duration = 8 - intensity * 4; // 8s at idle, 4s at max

            for (let d = 0; d < dotCount; d++) {
                const delay = (d / dotCount) * duration;
                svgDots += `<circle r="${2 + intensity}" fill="${color}" opacity="${0.6 + intensity * 0.4}">
                    <animateMotion dur="${duration}s" begin="${delay}s" repeatCount="indefinite">
                      <mpath href="#${pathId}"/>
                    </animateMotion>
                  </circle>`;
            }

            // Node circle — battery gets special SOC icon
            let iconHtml;
            let extraValue = '';
            if (node.battery_entity) {
                const soc = this._getStateVal(node.battery_entity) ?? 0;
                const socRound = Math.round(soc);
                // Pick battery icon based on level
                let batIcon = 'mdi:battery';
                if (socRound <= 5) batIcon = 'mdi:battery-outline';
                else if (socRound <= 15) batIcon = 'mdi:battery-10';
                else if (socRound <= 25) batIcon = 'mdi:battery-20';
                else if (socRound <= 35) batIcon = 'mdi:battery-30';
                else if (socRound <= 45) batIcon = 'mdi:battery-40';
                else if (socRound <= 55) batIcon = 'mdi:battery-50';
                else if (socRound <= 65) batIcon = 'mdi:battery-60';
                else if (socRound <= 75) batIcon = 'mdi:battery-70';
                else if (socRound <= 85) batIcon = 'mdi:battery-80';
                else if (socRound <= 95) batIcon = 'mdi:battery-90';
                iconHtml = `<ha-icon icon="${batIcon}" style="--mdc-icon-size: ${nodeSize * 0.45}px; color: ${color};"></ha-icon>`;
                extraValue = `<span class="enode-soc">${socRound}%</span>`;
            } else if (icon.startsWith('mdi:')) {
                iconHtml = `<ha-icon icon="${icon}" style="--mdc-icon-size: ${nodeSize * 0.45}px; color: ${color};"></ha-icon>`;
            } else {
                iconHtml = `<span style="font-size:${nodeSize * 0.45}px;">${icon}</span>`;
            }

            const sizeClass = isSource ? 'enode-source' : 'enode-consumer';
            const editStyle = editHidden ? ' opacity: 0.3; outline: 1px dashed rgba(255,255,255,0.3);' : '';
            nodesHtml += `
              <div class="energy-node ${sizeClass}" style="top: ${node.y ?? 50}%; left: ${node.x ?? 50}%;${editStyle}">
                <div class="enode-circle" style="width:${nodeSize}px; height:${nodeSize}px; border-color: ${color};">
                  <div class="enode-glow" style="background: radial-gradient(circle, ${color}66 0%, transparent 70%);"></div>
                  ${iconHtml}
                </div>
                <span class="enode-value" style="border-color: ${color}44;">${extraValue}${absVal.toFixed(1)} ${unit}${isSource !== configIsSource ? (isSource ? ' &#x25B2;' : ' &#x25BC;') : ''}</span>
                ${label ? `<span class="enode-label">${label}</span>` : ''}
              </div>`;
        });

        // Home node
        const homeIconHtml = homeIcon.startsWith('mdi:')
            ? `<ha-icon icon="${homeIcon}" style="--mdc-icon-size: 24px; color: ${homeColor};"></ha-icon>`
            : `<span style="font-size:1.4rem;">${homeIcon}</span>`;

        const homeNodeHtml = `
          <div class="energy-node enode-home" style="top: ${homeCfg.y ?? 40}%; left: ${homeCfg.x ?? 50}%;">
            <div class="enode-circle" style="width:52px; height:52px; border-color: ${homeColor};">
              <div class="enode-glow" style="background: radial-gradient(circle, ${homeColor}55 0%, transparent 70%);"></div>
              ${homeIconHtml}
            </div>
            <span class="enode-value" style="border-color: ${homeColor}44;">${homeVal.toFixed(1)} ${homeUnit}</span>
            ${homeCfg.name ? `<span class="enode-label">${homeCfg.name}</span>` : ''}
          </div>`;

        // Build a cache key from sensor values + card dimensions to avoid re-rendering
        // when nothing has changed (re-rendering kills SVG animations)
        // Round to whole numbers so small sensor fluctuations don't restart animations
        const cacheKey = `${w}x${h}|${Math.round(homeVal)}|` + resolvedNodes.map(n => {
            const v = this._getStateVal(n.entity) ?? 0;
            const batt = n.battery_entity ? Math.round(this._getStateVal(n.battery_entity) ?? 0) : '';
            return `${n.entity}:${Math.round(v)}:${batt}`;
        }).join('|');

        if (this._energyCacheKey === cacheKey && !this._energyDirty) return;
        this._energyCacheKey = cacheKey;
        this._energyDirty = false;

        container.innerHTML = `
          <svg class="energy-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
            ${svgPaths}
            ${svgDots}
          </svg>
          ${homeNodeHtml}
          ${nodesHtml}`;
    }

    // --- TIPS ENGINE ---
    // Single Jinja2 template subscription returns sorted JSON list of active tips.
    // HA does all the work server-side; the card just renders the result.

    _buildTipsTemplate(rules) {
        // Wrap each rule in a try block via {% if %} so a broken rule doesn't kill the whole template.
        // Each active rule appends a dict to the tips list.
        const ruleBlocks = rules.map(rule => {
            const id = (rule.id || '').replace(/'/g, "\\'");
            const icon = (rule.icon || 'mdi:information').replace(/'/g, "\\'");
            const level = (rule.level || 'info').replace(/'/g, "\\'");
            const priority = parseInt(rule.priority ?? 5) || 5;
            const text = rule.text || '';
            // Strip {{ }} wrappers if present — users write Jinja with {{ }}
            // in YAML (it's the HA convention), but we embed into {% if %} blocks
            // where the delimiters are invalid.
            let when = (rule.when || 'false').trim();
            if (when.startsWith('{{') && when.endsWith('}}')) {
                when = when.slice(2, -2).trim();
            }

            // The text field can contain {{...}} interpolation that must be
            // evaluated by Jinja, not treated as a literal. Split on placeholders
            // and join with ~ (Jinja string concat) so each placeholder becomes
            // a real expression while the surrounding literal chunks are quoted
            // strings with single-quotes escaped.
            const textExpr = text
                ? text
                    .split(/(\{\{.*?\}\})/g)
                    .filter(p => p)
                    .map(p => p.startsWith('{{')
                        ? `(${p.slice(2, -2).trim()})`
                        : `'${p.replace(/'/g, "\\'")}'`)
                    .join(' ~ ')
                : "''";

            return `
{# Rule: ${id} #}
{% if ${when} %}
  {% set tips = tips + [{
    'id': '${id}',
    'icon': '${icon}',
    'level': '${level}',
    'priority': ${priority},
    'text': ${textExpr}
  }] %}
{% endif %}`;
        }).join('\n');

        return `{% set tips = [] %}${ruleBlocks}\n{{ tips | sort(attribute='priority', reverse=true) | tojson }}`;
    }

    _setupTips() {
        const tipsCfg = this._config.tips;
        if (!tipsCfg || !tipsCfg.rules || tipsCfg.rules.length === 0) {
            // No tips config — clean up any existing subscription and hide footer
            if (this._tipsUnsub) { try { this._tipsUnsub(); } catch (e) {} this._tipsUnsub = null; }
            const footer = this.shadowRoot.querySelector('.footer');
            const statusEl = this.shadowRoot.querySelector('.footer-content');
            if (statusEl) statusEl.innerHTML = '';
            if (footer) footer.setAttribute('data-status', 'normal');
            return;
        }

        // Build template once and subscribe — only re-subscribe if the template changes.
        // Track in-flight subscriptions with _tipsPending so rapid hass pushes during the
        // subscribe() round-trip don't create orphaned duplicate subscriptions.
        const newTemplate = this._buildTipsTemplate(tipsCfg.rules);
        if (newTemplate === this._tipsTemplateCache && (this._tipsUnsub || this._tipsPending)) return;

        // Clean up old subscription if rules changed
        if (this._tipsUnsub) { try { this._tipsUnsub(); } catch (e) {} this._tipsUnsub = null; }
        this._tipsTemplateCache = newTemplate;

        // Subscribe to render_template
        if (!this._hass?.connection?.subscribeMessage) return;

        this._tipsPending = true;
        this._hass.connection.subscribeMessage(
            (msg) => {
                try {
                    this._activeTips = JSON.parse(msg.result || '[]');
                } catch (e) {
                    console.warn('[fork-u-house] Tips JSON parse failed:', e, msg.result);
                    this._activeTips = [];
                }
                this._renderTips();
                this._setupTipRotation();
            },
            { type: 'render_template', template: newTemplate, timeout: 9 }
        ).then(unsub => {
            this._tipsPending = false;
            // If the template changed while we were subscribing, this subscription is
            // stale — abort it immediately so we don't leak it.
            if (this._tipsTemplateCache !== newTemplate) {
                try { unsub(); } catch (e) {}
                return;
            }
            this._tipsUnsub = unsub;
        }).catch(err => {
            this._tipsPending = false;
            console.warn('[fork-u-house] Tips subscription failed:', err);
            // Clear the loading text so it doesn't persist on failure
            this._activeTips = [];
            this._renderTips();
        });
    }

    _setupTipRotation() {
        const tipsCfg = this._config.tips || {};
        const display = tipsCfg.display || 'rotating';
        const seconds = tipsCfg.rotation_seconds ?? 8;

        // Clear any existing timer
        if (this._tipRotationTimer) {
            clearInterval(this._tipRotationTimer);
            this._tipRotationTimer = null;
        }

        // Only rotate if multiple tips and display mode is rotating
        if (display === 'rotating' && (this._activeTips?.length ?? 0) > 1) {
            this._tipRotationTimer = setInterval(() => {
                this._tipRotationIdx = (this._tipRotationIdx + 1) % this._activeTips.length;
                this._renderTips();
            }, seconds * 1000);
        }
    }

    _renderTips() {
        const tipsCfg = this._config.tips;
        if (!tipsCfg) return;

        const footer = this.shadowRoot.querySelector('.footer');
        const statusEl = this.shadowRoot.querySelector('.footer-content');
        if (!footer || !statusEl) return;

        const tips = this._activeTips || [];
        const display = tipsCfg.display || 'rotating';
        const hideEmpty = tipsCfg.hide_when_empty ?? true;
        const idleMessage = tipsCfg.idle_message;

        // No active tips
        if (tips.length === 0) {
            if (hideEmpty && !idleMessage) {
                footer.style.display = 'none';
                return;
            }
            footer.style.display = '';
            footer.setAttribute('data-status', 'normal');
            footer.classList.remove('tips-active');
            if (idleMessage) {
                statusEl.innerHTML = `<span class="tip-text">${idleMessage}</span>`;
            }
            return;
        }

        footer.style.display = '';
        footer.classList.add('tips-active');

        // Pick which tip(s) to show
        let visibleTips;
        if (display === 'stacked') {
            visibleTips = tips.slice(0, 3);
        } else if (display === 'single') {
            visibleTips = [tips[0]];
        } else {
            // rotating
            this._tipRotationIdx = this._tipRotationIdx % tips.length;
            visibleTips = [tips[this._tipRotationIdx]];
        }

        // Highest level among visible tips drives the footer styling
        const levelRank = { info: 0, warn: 1, danger: 2 };
        const topLevel = visibleTips.reduce((max, t) => {
            return (levelRank[t.level] ?? 0) > (levelRank[max] ?? 0) ? t.level : max;
        }, 'info');
        const levelMap = { info: 'normal', warn: 'warn', danger: 'danger' };
        footer.setAttribute('data-status', levelMap[topLevel] || 'normal');

        // Render
        const html = visibleTips.map(t => {
            const iconHtml = (t.icon || '').startsWith('mdi:')
                ? `<ha-icon icon="${t.icon}" class="tip-icon" style="--mdc-icon-size: 18px;"></ha-icon>`
                : `<span class="tip-icon-emoji">${t.icon || ''}</span>`;
            return `<div class="tip-row"><span class="tip-icon-wrap">${iconHtml}</span><span class="tip-text">${t.text}</span></div>`;
        }).join('');

        statusEl.innerHTML = html;
    }

    _handleGamingMode() {
        const partyEntity = this._config.party_mode_entity;
        const isGaming = partyEntity && this._hass.states[partyEntity]?.state === 'on';
        const card = this.shadowRoot.querySelector('.card');
        if (card) {
            isGaming ? card.classList.add('gaming-active') : card.classList.remove('gaming-active');
        }
        return isGaming;
    }

    _handleDayNight() {
        const sunEnt = this._config.sun_entity || 'sun.sun';
        const isNight = this._hass.states[sunEnt]?.state === 'below_horizon';
        const dimLayer = this.shadowRoot.querySelector('.dim-layer');
        if (dimLayer) dimLayer.style.opacity = isNight ? '0.1' : '0';
        return isNight;
    }

    // --- FOOTER MEDIAN ---
    _updateMedianPill(median) {
        // Just updates the median temperature pill in the footer.
        // All footer content/styling is now driven by the tips engine.
        const medianEl = this.shadowRoot.querySelector('.median-pill');
        if (medianEl) medianEl.innerHTML = `${this._t('home_median')}: <b>${median.toFixed(1)}°C</b>`;
    }

    _getStateVal(id) {
        if (!id || !this._hass.states[id]) return null;
        const v = parseFloat(this._hass.states[id].state);
        return isNaN(v) ? null : v;
    }

    _getWindData() {
        let speed = 10, bearing = 270;
        if(this._config.wind_speed_entity && this._hass.states[this._config.wind_speed_entity]) 
            speed = parseFloat(this._hass.states[this._config.wind_speed_entity].state);
        else if(this._hass.states[this._config.weather_entity]?.attributes?.wind_speed) 
            speed = parseFloat(this._hass.states[this._config.weather_entity].attributes.wind_speed);

        if(this._config.wind_direction_entity && this._hass.states[this._config.wind_direction_entity]) 
            bearing = parseFloat(this._hass.states[this._config.wind_direction_entity].state);
        else if(this._hass.states[this._config.weather_entity]?.attributes?.wind_bearing) 
            bearing = parseFloat(this._hass.states[this._config.weather_entity].attributes.wind_bearing);
            
        return { speed: isNaN(speed)?5:speed, bearing: isNaN(bearing)?270:bearing };
    }

    _getCloudCoverage() {
        const cloudEnt = this._config.cloud_coverage_entity;
        if (cloudEnt && this._hass.states[cloudEnt]) {
            const val = parseFloat(this._hass.states[cloudEnt].state);
            return isNaN(val) ? 0 : val;
        }
        return 0;
    }

    // --- RENDER (Prism Classic + Gaming Ambient) ---
    _render() {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; --fork-u-bg: #1e2024; --color-cold: #60A5FA; --color-opt: #34D399; --color-warm: #FBBF24; --color-hot: #F87171; }
          .card {
              position: relative; display: flex; flex-direction: column; width: 100%; height: 350px;
              overflow: hidden;
              text-shadow: rgba(0,0,0,0.4) 0 1px 0px;
              box-shadow: 0 4px 2px rgba(0,0,0,0.3);
              /* Please style borders and box shadow manually */
              /*
              background: var(--fork-u-bg);
              border-radius: 20px;
              font-family: 'Roboto', sans-serif;
              border: 1px solid rgba(255,255,255,0.1);
              */
              background: var(--card-background-color,var(--fork-u-bg));
              border-radius: var(--ha-card-border-radius,var(--ha-border-radius-lg,20px));
          }
          .gradient-layer {
              background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 40px);
              position: absolute; top: 0; left: 0; width: 100%; height: 100%;
              background-size: cover; background-position: center;
              z-index: 0; transition: all 0.5s ease;
          }
          .bg-image {
              position: absolute; top: 0; left: 0; width: 100%; height: 100%;
              background-size: cover; background-position: center;
              z-index: 0; transition: all 0.5s ease;
          }
          .dim-layer {
              position: absolute; top: 0; left: 0; width: 100%; height: 100%;
              background: #000; opacity: 0; z-index: 1; pointer-events: none; transition: opacity 2s ease;
          }
          
          /* GAMING AMBIENT LAYER */
          .ambient-layer {
              position: absolute; top: 0; left: 0; width: 100%; height: 100%;
              z-index: 1; pointer-events: none; opacity: 0; transition: opacity 1.5s ease;
          }
          .card.gaming-active .ambient-layer { opacity: 1; }
          
          .ambient-light {
             position: absolute; border-radius: 50%; filter: blur(70px);
             mix-blend-mode: color-dodge; animation-iteration-count: infinite; animation-timing-function: ease-in-out;
          }
          .blob-1 { top: 20%; left: 10%; width: 300px; height: 300px; background: radial-gradient(circle, rgba(120,50,255,0.8) 0%, rgba(0,0,0,0) 70%); animation: float-1 6s infinite alternate; }
          .blob-2 { bottom: 10%; right: 10%; width: 350px; height: 350px; background: radial-gradient(circle, rgba(255,0,150,0.7) 0%, rgba(0,0,0,0) 70%); animation: float-2 7s infinite alternate; }
          .blob-3 { top: 40%; left: 40%; width: 250px; height: 250px; background: radial-gradient(circle, rgba(0,255,255,0.5) 0%, rgba(0,0,0,0) 70%); animation: pulse-3 5s infinite; mix-blend-mode: overlay; }

          @keyframes float-1 { 0% { transform: translate(0,0) scale(1); opacity: 0.7; } 100% { transform: translate(20px, 30px) scale(1.1); opacity: 0.9; } }
          @keyframes float-2 { 0% { transform: translate(0,0) scale(1); opacity: 0.6; } 100% { transform: translate(-30px, -20px) scale(1.15); opacity: 0.8; } }
          @keyframes pulse-3 { 0% { transform: scale(0.9); opacity: 0.4; } 50% { transform: scale(1.2); opacity: 0.7; } 100% { transform: scale(0.9); opacity: 0.4; } }

          canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2; }
          
          .badges-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }
          .badge {
              position: absolute; transform: translate(-50%, -50%);
              padding: 6px 12px;
              border-radius: 16px;
              background: rgba(20, 20, 25, 0.75); 
              backdrop-filter: blur(8px);
              border: 1px solid rgba(255,255,255,0.15);
              box-shadow: 0 4px 8px rgba(0,0,0,0.4);
              display: flex; align-items: center; gap: 8px; pointer-events: auto;
          }
          .badge-dot { width: 8px; height: 8px; border-radius: 50%; }
          .is-cold .badge-dot { background: var(--color-cold); box-shadow: 0 0 5px var(--color-cold); }
          .is-optimal .badge-dot { background: var(--color-opt); box-shadow: 0 0 5px var(--color-opt); }
          .is-warm .badge-dot { background: var(--color-warm); box-shadow: 0 0 5px var(--color-warm); }
          .is-hot .badge-dot { background: var(--color-hot); box-shadow: 0 0 5px var(--color-hot); }
          .is-neutral .badge-dot { background: #888; box-shadow: 0 0 5px #888; }
          .badge-content { display: flex; flex-direction: column; line-height: 1; }
          .badge-name { font-size: 0.55rem; color: #aaa; text-transform: uppercase; margin-bottom: 2px; }
          .badge-val { font-size: 0.80rem; font-weight: 700; color: #fff; }

          /* ALERT BADGES */
          .alerts-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }
          .alert-badge {
              position: absolute; transform: translate(-50%, -50%);
              display: flex; align-items: center; gap: 6px; pointer-events: auto;
          }
          .alert-icon {
              width: 24px; height: 24px; border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              font-size: 0.7rem; color: #fff; font-weight: 700;
          }
          .alert-label {
              font-size: 0.55rem; color: #fff; text-transform: uppercase;
              background: rgba(20, 20, 25, 0.75); backdrop-filter: blur(8px);
              border: 1px solid rgba(255,255,255,0.15);
              padding: 2px 6px 2px 4px; border-radius: 10px;
              white-space: nowrap;
          }
          .alert-pulse { animation: alert-glow 1.5s ease-in-out infinite; }
          @keyframes alert-glow {
              0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.2); }
          }

          /* SPRINKLER ZONES */
          .sprinklers-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; }
          .sprinkler-zone {
              position: absolute; transform: translate(-50%, -50%);
              display: flex; flex-direction: column; align-items: center; gap: 2px;
          }
          .sprinkler-head { position: relative; display: flex; align-items: center; justify-content: center; }
          .sprinkler-icon { font-size: 1rem; animation: sprinkler-rotate 2s linear infinite; }
          .sprinkler-spray {
              position: absolute; width: 30px; height: 30px;
              border: 1px dashed; border-radius: 50%; opacity: 0;
              animation: sprinkler-spray 2s ease-out infinite;
          }
          .sprinkler-spray.spray-2 { animation-delay: 0.66s; }
          .sprinkler-spray.spray-3 { animation-delay: 1.33s; }
          .sprinkler-small .sprinkler-spray { width: 20px; height: 20px; }
          .sprinkler-small .sprinkler-icon { font-size: 0.7rem; }
          .sprinkler-large .sprinkler-spray { width: 44px; height: 44px; }
          .sprinkler-large .sprinkler-icon { font-size: 1.3rem; }
          .sprinkler-label {
              font-size: 0.5rem; color: #aaa; text-transform: uppercase;
              background: rgba(20, 20, 25, 0.6); padding: 1px 5px; border-radius: 6px;
              white-space: nowrap;
          }
          @keyframes sprinkler-rotate {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
          }
          @keyframes sprinkler-spray {
              0% { transform: scale(0.5); opacity: 0.6; }
              100% { transform: scale(1.8); opacity: 0; }
          }

          /* BIN NIGHT */
          .bins-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }
          .bin-badge {
              position: absolute; transform: translate(-50%, -50%);
              display: flex; flex-direction: column; align-items: center; gap: 2px;
          }
          .bin-svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
          .bin-label {
              font-size: 0.5rem; font-weight: 700; text-transform: uppercase;
              text-shadow: 0 1px 2px rgba(0,0,0,0.8);
              white-space: nowrap;
          }

          /* ENERGY FLOW */
          .energy-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 3; pointer-events: none; }
          .energy-svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
          .energy-node {
              position: absolute; transform: translate(-50%, -50%);
              display: flex; flex-direction: column; align-items: center; gap: 3px;
              pointer-events: none;
          }
          .enode-circle {
              border-radius: 50%;
              background: rgba(15, 15, 20, 0.85);
              backdrop-filter: blur(8px);
              border: 2px solid;
              display: flex; align-items: center; justify-content: center;
              box-shadow: 0 0 10px rgba(0,0,0,0.4);
              position: relative;
          }
          .enode-glow {
              position: absolute; width: 100%; height: 100%; border-radius: 50%;
          }
          .enode-source .enode-glow { animation: enode-source-pulse 2.5s ease-in-out infinite; }
          .enode-consumer .enode-glow { animation: enode-consumer-pulse 3s ease-in-out infinite; }
          .enode-home .enode-glow { animation: enode-source-pulse 3s ease-in-out infinite; }
          @keyframes enode-source-pulse {
              0%, 100% { transform: scale(0.8); opacity: 0.3; }
              50% { transform: scale(1.5); opacity: 0.6; }
          }
          @keyframes enode-consumer-pulse {
              0%, 100% { transform: scale(1.1); opacity: 0.2; }
              50% { transform: scale(0.9); opacity: 0.45; }
          }
          .enode-value {
              font-size: 0.6rem; font-weight: 700; color: #fff;
              background: rgba(15, 15, 20, 0.85);
              backdrop-filter: blur(6px);
              border: 1px solid rgba(255,255,255,0.1);
              padding: 2px 7px; border-radius: 10px; white-space: nowrap;
          }
          .enode-label {
              font-size: 0.42rem; color: #999; text-transform: uppercase; letter-spacing: 0.5px;
          }
          .enode-soc {
              font-size: 0.55rem; font-weight: 700; color: #fff; margin-right: 3px;
          }
          .energy-off .enode-circle { border-color: #444 !important; }
          .energy-off .enode-value { opacity: 0.4; }

          .footer {
              position: absolute; bottom: 0; left: 0; width: 100%; z-index: 3;
              background: rgba(10, 10, 15, 0.25); backdrop-filter: blur(15px);
              border-top: 1px solid rgba(255,255,255,0.05); padding: 12px 16px;
              display: flex; align-items: center; gap: 12px; box-sizing: border-box; transition: background 0.3s;
              min-height: 60px; /* Space for multi-line text */
          }
          .footer[data-status="warn"] { background: rgba(80, 50, 10, 0.65); border-top-color: var(--color-warm); }
          .footer[data-status="danger"] { background: rgba(80, 20, 20, 0.65); border-top-color: var(--color-hot); }

          .value-pill { 
              background: rgba(20, 20, 25, 0.75); 
              backdrop-filter: blur(8px);
              border: 1px solid rgba(255,255,255,0.15);
              box-shadow: 0 4px 8px rgba(0,0,0,0.4);
              padding: 2px 8px; 
              border-radius: 20px; 
              color: rgba(255, 255, 255, 0.6);
              white-space: nowrap;
              transition: all 0.2s ease;
          }
          pill-1 { 
              margin-left: -5px;
              margin-right: 5px;
          }
          .value-pill b { color: #fff; }
          .median-pill {
              display: none; /* Disabled mediana pill */
              /* Disabled mediana pill */
              background: rgba(20, 20, 25, 0.75); 
              backdrop-filter: blur(8px);
              border: 1px solid rgba(255,255,255,0.15);
              box-shadow: 0 4px 8px rgba(0,0,0,0.4);
              padding: 4px 8px; 
              border-radius: 20px; 
              font-size: 0.8rem; 
              color: rgba(255, 255, 255, 0.6);
              white-space: nowrap; 
              flex-shrink: 0; 
              align-self: flex-start; 
              margin-top: 2px;
              transition: all 0.2s ease;
          }
          .median-pill b { color: #fff; }
          
          /* Allow multi-line text for verbose AI messages */
          .footer-content {
              font-size: 0.85rem; color: #ccc;
              white-space: normal; line-height: 1.8;
              display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
              /*
              overflow: hidden;
              */
          }

          /* TIPS ENGINE */
          .footer.tips-active .footer-content {
              display: flex; flex-direction: column; gap: 4px;
              -webkit-line-clamp: unset;
          }
          .tip-row {
              display: flex; align-items: center; gap: 8px;
              font-size: 0.75rem; line-height: 1.4;
          }
          .tip-icon-wrap {
              display: inline-flex; align-items: center; justify-content: center;
              flex-shrink: 0;
          }
          .tip-icon, .tip-icon-emoji {
              font-size: 1rem;
          }
          .tip-text { color: #fff; }
          .footer[data-status="warn"] .tip-text { color: #FBBF24; }
          .footer[data-status="danger"] .tip-text { color: #F87171; }

          /* LOW PERFORMANCE MODE — disable expensive backdrop-filter blur */
          .card.low-perf .badge { backdrop-filter: none; background: rgba(20, 20, 25, 0.9); }
          .card.low-perf .alert-label { backdrop-filter: none; background: rgba(20, 20, 25, 0.9); }
          .card.low-perf .footer { backdrop-filter: none; background: rgba(10, 10, 15, 0.85); }
          .card.low-perf .enode-circle { backdrop-filter: none; background: rgba(15, 15, 20, 0.95); }
          .card.low-perf .enode-value { backdrop-filter: none; background: rgba(15, 15, 20, 0.95); }
          .card.low-perf .value-pill { backdrop-filter: none; background: rgba(20, 20, 25, 0.9); }
        </style>
        <div class="card${this._lowPerf ? ' low-perf' : ''}">
          <div class="bg-image"></div>
          <div class="gradient-layer"></div>
          <div class="dim-layer"></div>
          <div class="ambient-layer">
              <div class="ambient-light blob-1"></div>
              <div class="ambient-light blob-2"></div>
              <div class="ambient-light blob-3"></div>
          </div>
          <canvas id="weatherCanvas"></canvas>
          <div class="badges-layer"></div>
          <div class="alerts-layer"></div>
          <div class="sprinklers-layer"></div>
          <div class="bins-layer"></div>
          <div class="energy-layer"></div>
          <div class="footer" data-status="normal">
              <div class="median-pill">Dom: --</div>
              <div class="footer-content">${this._t('loading')}</div>
          </div>
        </div>
      `;
      this._canvas = this.shadowRoot.getElementById('weatherCanvas');
      this._ctx = this._canvas.getContext('2d');
      setTimeout(() => this._resizeCanvas(), 100);
      this.connectedCallback();
    }
  
    _resizeCanvas() {
      if (!this._canvas) return;
      const card = this.shadowRoot.querySelector('.card');
      if (card) { this._canvas.width = card.clientWidth; this._canvas.height = card.clientHeight; }
    }

    // --- ANIMATIONS ---
    _initStars() {
        this._stars = [];
        for (let i = 0; i < 60; i++) {
            this._stars.push({
                x: Math.random() * (this._canvas ? this._canvas.width : 300),
                y: Math.random() * (this._canvas ? this._canvas.height : 200),
                size: Math.random() * 1.5, opacity: Math.random(), speed: 0.01 + Math.random() * 0.02
            });
        }
    }

    _animate() {
      if (!this._ctx) return;

      // Cap to ~15fps in low-perf mode (skip frames if < 66ms since last)
      if (this._lowPerf) {
          const now = performance.now();
          if (this._lastAnimTime && now - this._lastAnimTime < 66) {
              this._animationFrame = requestAnimationFrame(() => this._animate());
              return;
          }
          this._lastAnimTime = now;
      }

      const wEnt = this._config.weather_entity;
      let wState = this._config.test_weather_state || (wEnt ? this._hass.states[wEnt]?.state : "");
      const { speed, bearing } = this._getWindData();
      const windDirX = (bearing > 180 || bearing < 0) ? -1 : 1;
      let moveSpeed = speed / 15; if (moveSpeed < 0.2) moveSpeed = 0.2; if (moveSpeed > 6) moveSpeed = 6;
      
      const sunEnt = this._config.sun_entity || 'sun.sun';
      const isNight = this._hass.states[sunEnt]?.state === 'below_horizon';
      const coverage = this._getCloudCoverage();

      this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

      if (isNight) this._drawStars(coverage);
      if (wState === 'fog' || (isNight && ['rainy','cloudy'].includes(wState))) this._drawFog(moveSpeed);

      if ((wState && !['clear-night','sunny'].includes(wState)) || coverage > 20) {
         let density = 1; if(coverage>50) density=1.5; if(coverage>80) density=2;
         this._drawClouds(windDirX, moveSpeed, density);
      }
      if (['rainy','pouring','lightning','lightning-rainy'].includes(wState)) {
          this._drawRain(wState === 'pouring' ? 2 : 1, windDirX, moveSpeed);
      } else if (['snowy','snowy-rainy'].includes(wState)) {
          this._drawSnow(windDirX, moveSpeed);
      } 
      if (['lightning','lightning-rainy'].includes(wState) || wState === 'lightning') this._handleLightning();
      
      if (this._flashOpacity > 0) {
          this._ctx.fillStyle = `rgba(255, 255, 255, ${this._flashOpacity})`;
          this._ctx.fillRect(0,0, this._canvas.width, this._canvas.height);
          this._flashOpacity -= 0.05;
      }

      // Auto-detect low performance: sample frame times for first 3 seconds
      if (this._perfAutoDetect && !this._lowPerf && this._perfSamples.length < 90) {
          const now = performance.now();
          if (this._perfLastFrame) {
              this._perfSamples.push(now - this._perfLastFrame);
          }
          this._perfLastFrame = now;

          // After ~60 frames, check average
          if (this._perfSamples.length === 60) {
              const avg = this._perfSamples.reduce((a, b) => a + b, 0) / this._perfSamples.length;
              // avg > 40ms means < 25fps — enable low perf
              if (avg > 40) {
                  this._lowPerf = true;
                  const card = this.shadowRoot.querySelector('.card');
                  if (card) card.classList.add('low-perf');
              }
          }
      }

      this._animationFrame = requestAnimationFrame(() => this._animate());
    }

    _drawStars(coverage) {
        const visibility = Math.max(0, 1 - (coverage / 80)); 
        if (visibility <= 0) return;
        this._ctx.fillStyle = "#FFF";
        this._stars.forEach(star => {
            this._ctx.globalAlpha = Math.abs(Math.sin(Date.now() * 0.001 * star.speed + star.x)) * star.opacity * visibility;
            this._ctx.beginPath();
            this._ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this._ctx.fill();
        });
        this._ctx.globalAlpha = 1.0;
    }

    _drawFog(speed) {
        // FIXED: Organic Fog (Puffs) instead of Rectangular Bar
        if (this._fogParticles.length < 10) {
            this._fogParticles.push({
                x: Math.random() * this._canvas.width,
                y: this._canvas.height - (Math.random() * 50),
                radius: 50 + Math.random() * 50,
                speed: (Math.random() * 0.2) + 0.05
            });
        }
        
        this._fogParticles.forEach(f => {
            f.x += f.speed * (speed * 0.5);
            if (f.x > this._canvas.width + 100) f.x = -100;
            
            const g = this._ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
            g.addColorStop(0, 'rgba(200, 200, 210, 0.15)');
            g.addColorStop(1, 'rgba(200, 200, 210, 0)');
            
            this._ctx.fillStyle = g;
            this._ctx.beginPath();
            this._ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
            this._ctx.fill();
        });
    }

    _drawClouds(dirX, baseSpeed, density) {
        const target = Math.floor(5 * density);
        if (this._clouds.length < target) {
             const newCloud = this._createCloud(false); newCloud.x = dirX > 0 ? -200 : this._canvas.width + 200;
             this._clouds.push(newCloud);
        }
        if (this._clouds.length > target) this._clouds.pop();
        this._clouds.forEach((cloud, index) => {
            cloud.x += baseSpeed * 0.3 * dirX; 
            if ((dirX > 0 && cloud.x > this._canvas.width + 200) || (dirX < 0 && cloud.x < -200)) { this._clouds.splice(index, 1); return; }
            this._ctx.save(); this._ctx.translate(cloud.x, cloud.y); this._ctx.scale(cloud.scale, cloud.scale);
            cloud.puffs.forEach(puff => {
                const gradient = this._ctx.createRadialGradient(puff.xOffset, puff.yOffset, 0, puff.xOffset, puff.yOffset, puff.radius);
                gradient.addColorStop(0, `rgba(255, 255, 255, ${puff.opacity * 0.8})`); gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
                this._ctx.fillStyle = gradient; this._ctx.beginPath(); this._ctx.arc(puff.xOffset, puff.yOffset, puff.radius, 0, Math.PI * 2); this._ctx.fill();
            });
            this._ctx.restore();
        });
    }
    _createCloud(randomX) {
        const puffs = []; const numPuffs = 4 + Math.floor(Math.random() * 4); const cloudWidth = 100 + Math.random() * 80;
        for (let j = 0; j < numPuffs; j++) puffs.push({ xOffset: (Math.random() * cloudWidth) - (cloudWidth/2), yOffset: (Math.random() * 30) - 15, radius: 25 + Math.random() * 20, opacity: 0.1 + Math.random() * 0.2 });
        return { x: randomX ? Math.random() * (this._canvas ? this._canvas.width : 300) : -150, y: Math.random() * 100, scale: 0.8 + Math.random() * 0.4, puffs: puffs };
    }

    _drawRain(intensity, windDirX, windSpeed) {
      if (this._particles.length < 150 * intensity) this._particles.push({ x: Math.random() * this._canvas.width, y: -20, speed: 15 + windSpeed, length: 15 + Math.random() * 10 });
      this._ctx.strokeStyle = 'rgba(174, 194, 224, 0.6)'; this._ctx.lineWidth = 1; this._ctx.beginPath();
      const angleX = windDirX * (windSpeed * 1.5);
      for (let i = 0; i < this._particles.length; i++) {
          const p = this._particles[i];
          this._ctx.moveTo(p.x, p.y); this._ctx.lineTo(p.x + angleX, p.y + p.length);
          p.y += p.speed; p.x += angleX;
          if (p.y > this._canvas.height || p.x > this._canvas.width + 50 || p.x < -50) { this._particles.splice(i, 1); i--; }
      }
      this._ctx.stroke();
    }

    _drawSnow(windDirX, windSpeed) {
      if (this._particles.length < 100) this._particles.push({ x: Math.random() * this._canvas.width, y: -10, speed: 1 + Math.random(), radius: 1.5 + Math.random() });
      this._ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; this._ctx.beginPath();
      for (let i = 0; i < this._particles.length; i++) {
          const p = this._particles[i];
          this._ctx.moveTo(p.x, p.y); this._ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          p.y += p.speed; p.x += (Math.sin(p.y * 0.03) * 0.5) + (windDirX * windSpeed * 0.5);
          if (p.y > this._canvas.height || p.x > this._canvas.width + 50 || p.x < -50) { this._particles.splice(i, 1); i--; }
      }
      this._ctx.fill();
    }
    
    _handleLightning() {
        this._lightningTimer++;
        if (this._lightningTimer > 200 && Math.random() > 0.98) { this._triggerLightning(); this._lightningTimer = 0; }
        if (this._lightningBolt && this._lightningBolt.life > 0) { this._drawBolt(this._lightningBolt); this._lightningBolt.life--; }
    }
    _triggerLightning() {
        const startX = Math.random() * this._canvas.width; const path = [{x: startX, y: 0}]; let currX = startX, currY = 0;
        while(currY < this._canvas.height * 0.8) { currY += Math.random() * 40 + 20; currX += (Math.random() * 60) - 30; path.push({x: currX, y: currY}); }
        this._lightningBolt = { path, life: 10 }; this._flashOpacity = 0.5;
    }
    _drawBolt(bolt) {
        this._ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; this._ctx.lineWidth = 2; this._ctx.beginPath();
        this._ctx.moveTo(bolt.path[0].x, bolt.path[0].y); for(let p of bolt.path) this._ctx.lineTo(p.x, p.y); this._ctx.stroke();
    }
  }
  
  customElements.define('fork-u-house-card', ForkUHouseCard);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "fork-u-house-card", name: "Fork U-House Card V11.0", description: "AI Storyteller Edition" });
