import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeCard, haState } from './test-utils.js';

// Default fixtures
const BASE_PATH = '/img/';

function card({ date, config = {}, states = {}, sun = 'above_horizon' } = {}) {
  if (date) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(date));
  }
  const merged = {
    image_path: BASE_PATH,
    weather_entity: 'weather.home',
    season_entity: 'sensor.season',
    sun_entity: 'sun.sun',
    ...config,
  };
  const mergedStates = {
    'sun.sun': haState(sun),
    'sensor.season': haState('summer'),
    'weather.home': haState('sunny'),
    ...states,
  };
  return makeCard({ config: merged, states: mergedStates });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('_calculateImage — Priority 1: Gaming Mode', () => {
  it('returns the gaming image when party_mode is on', () => {
    const el = card({
      date: '2025-06-15T12:00:00',
      config: { party_mode_entity: 'input_boolean.gaming', gaming_image: 'synthwave' },
      states: { 'input_boolean.gaming': haState('on') },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}gaming_synthwave.png`);
  });

  it('ignores gaming when party_mode is off', () => {
    const el = card({
      date: '2025-06-15T12:00:00',
      config: { party_mode_entity: 'input_boolean.gaming', gaming_image: 'synthwave' },
      states: { 'input_boolean.gaming': haState('off') },
    });
    expect(el._calculateImage()).not.toContain('gaming_');
  });

  it('ignores gaming when gaming_image is not configured', () => {
    const el = card({
      date: '2025-06-15T12:00:00',
      config: { party_mode_entity: 'input_boolean.gaming' },
      states: { 'input_boolean.gaming': haState('on') },
    });
    expect(el._calculateImage()).not.toContain('gaming_');
  });
});

describe('_calculateImage — Priority 2: Christmas Calendar', () => {
  it('returns xmas_dec{N}_day.png on Dec 15 daytime', () => {
    const el = card({ date: '2025-12-15T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}xmas_dec15_day.png`);
  });

  it('returns xmas_dec{N}_night.png on Dec 15 nighttime', () => {
    const el = card({ date: '2025-12-15T22:00:00', sun: 'below_horizon' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}xmas_dec15_night.png`);
  });

  it('returns xmas calendar on Dec 1', () => {
    const el = card({ date: '2025-12-01T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}xmas_dec1_day.png`);
  });

  it('returns xmas calendar on Dec 26', () => {
    const el = card({ date: '2025-12-26T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}xmas_dec26_day.png`);
  });

  it('does NOT return xmas calendar on Dec 27', () => {
    const el = card({ date: '2025-12-27T12:00:00' });
    expect(el._calculateImage()).not.toContain('xmas_dec');
  });

  it('sets traditional fallback on even day', () => {
    const el = card({ date: '2025-12-14T12:00:00' });
    el._calculateImage();
    expect(el._xmasFallback).toBe(`${BASE_PATH}xmas_day.png`);
  });

  it('sets australian fallback on odd day', () => {
    const el = card({ date: '2025-12-15T12:00:00' });
    el._calculateImage();
    expect(el._xmasFallback).toBe(`${BASE_PATH}xmas_australian_day.png`);
  });
});

describe('_calculateImage — Priority 3: Birthdays', () => {
  it('returns themed birthday image on matching date', () => {
    const el = card({
      date: '2025-03-15T12:00:00',
      config: { birthdays: [{ name: 'boy_bday', date: '03-15' }] },
      states: { 'sensor.season': haState('autumn') },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_boy_bday_autumn_day.png`);
  });

  it('does not match on non-birthday dates', () => {
    const el = card({
      date: '2025-03-16T12:00:00',
      config: { birthdays: [{ name: 'boy_bday', date: '03-15' }] },
    });
    expect(el._calculateImage()).not.toContain('boy_bday');
  });

  it('uses night suffix after sundown', () => {
    const el = card({
      date: '2025-03-15T20:00:00',
      sun: 'below_horizon',
      config: { birthdays: [{ name: 'boy_bday', date: '03-15' }] },
      states: { 'sensor.season': haState('autumn') },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_boy_bday_autumn_night.png`);
  });
});

describe('_calculateImage — Priority 4: Themed Days', () => {
  // Note: Lunar New Year range (Jan 20 — Feb 12) overlaps with Australia Day
  // (Jan 26) and Back to School (Jan 27–31), so the overlaps resolve in code order.
  const themed = [
    // [date, expected_suffix]
    ['2025-12-31', 'new_years'],
    ['2025-01-01', 'new_years'],
    ['2025-01-26', 'australia_day'],
    ['2025-01-28', 'back_to_school'],
    ['2025-01-21', 'lunar_new_year'], // between gaps
    ['2025-02-14', 'valentines_day'],
    ['2025-03-17', 'st_patricks_day'],
    ['2025-04-25', 'anzac_day'],
    ['2025-06-05', 'environment_day'],
    ['2025-09-08', 'wedding_anniversary'],
  ];

  it.each(themed)('%s → themed_%s_day.png', (date, name) => {
    const el = card({ date: `${date}T12:00:00` });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_${name}_day.png`);
  });

  it("Mothers Day 2025 (2nd Sunday May = May 11)", () => {
    const el = card({ date: '2025-05-11T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_mothers_day_day.png`);
  });

  it("Fathers Day 2025 (1st Sunday Sep = Sep 7)", () => {
    const el = card({ date: '2025-09-07T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_fathers_day_day.png`);
  });

  it('AFL Grand Final 2025 (last Sat Sep = Sep 27)', () => {
    const el = card({ date: '2025-09-27T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_afl_grand_final_day.png`);
  });

  it('Neighbour Day 2025 (last Sun March = March 30)', () => {
    const el = card({ date: '2025-03-30T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_neighbour_day_day.png`);
  });

  it('Melbourne Cup 2025 (1st Tue Nov = Nov 4)', () => {
    const el = card({ date: '2025-11-04T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_melbourne_cup_day.png`);
  });

  it('State of Origin game 1 2025 (1st Wed June = June 4)', () => {
    const el = card({ date: '2025-06-04T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_state_of_origin_day.png`);
  });

  it('State of Origin game 2 2025 (3rd Wed June = June 18)', () => {
    const el = card({ date: '2025-06-18T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_state_of_origin_day.png`);
  });

  it('State of Origin game 3 2025 (2nd Wed July = July 9)', () => {
    const el = card({ date: '2025-07-09T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_state_of_origin_day.png`);
  });

  it('2nd Wed of June is NOT State of Origin (only 1st and 3rd)', () => {
    const el = card({ date: '2025-06-11T12:00:00' });
    expect(el._calculateImage()).not.toContain('state_of_origin');
  });

  // Range boundary coverage
  it('Back to School range lower bound (Jan 27)', () => {
    const el = card({ date: '2025-01-27T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_back_to_school_day.png`);
  });

  it('Back to School range upper bound (Jan 31)', () => {
    const el = card({ date: '2025-01-31T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_back_to_school_day.png`);
  });

  it('Lunar New Year upper bound (Feb 12)', () => {
    const el = card({ date: '2025-02-12T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_lunar_new_year_day.png`);
  });

  it('Feb 13 is neither Lunar New Year nor Valentine\'s', () => {
    const el = card({ date: '2025-02-13T12:00:00' });
    expect(el._calculateImage()).not.toContain('lunar');
    expect(el._calculateImage()).not.toContain('valentines');
  });

  // Night variants for themed days
  it('ANZAC Day at night returns night variant', () => {
    const el = card({ date: '2025-04-25T20:00:00', sun: 'below_horizon' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_anzac_day_night.png`);
  });

  it('Halloween at night returns night variant', () => {
    const el = card({ date: '2025-10-31T22:00:00', sun: 'below_horizon' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}halloween_night.png`);
  });

  // Multi-year coverage for computed dates
  it('Mothers Day 2024 (May 12)', () => {
    const el = card({ date: '2024-05-12T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_mothers_day_day.png`);
  });

  it('AFL Grand Final 2024 (Sep 28)', () => {
    const el = card({ date: '2024-09-28T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_afl_grand_final_day.png`);
  });

  it('Easter 2025 Good Friday (Apr 18)', () => {
    const el = card({ date: '2025-04-18T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_easter_day.png`);
  });

  it('Easter 2025 Easter Sunday (Apr 20)', () => {
    const el = card({ date: '2025-04-20T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_easter_day.png`);
  });

  it('Easter 2025 Easter Monday (Apr 21)', () => {
    const el = card({ date: '2025-04-21T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_easter_day.png`);
  });

  it('Day before Good Friday 2025 (Apr 17) is NOT easter', () => {
    const el = card({ date: '2025-04-17T12:00:00' });
    expect(el._calculateImage()).not.toContain('easter');
  });

  it('Halloween window (Oct 25 – Oct 31)', () => {
    const el = card({ date: '2025-10-31T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}halloween_day.png`);
  });

  it('Halloween lower bound (Oct 25)', () => {
    const el = card({ date: '2025-10-25T12:00:00' });
    expect(el._calculateImage()).toBe(`${BASE_PATH}halloween_day.png`);
  });

  it('Oct 24 is NOT halloween', () => {
    const el = card({ date: '2025-10-24T12:00:00' });
    expect(el._calculateImage()).not.toContain('halloween');
  });
});

describe('_calculateImage — Priority 6: Weather variants', () => {
  // Only returned if the matching img_{season}_{variant}_{time} flag is true
  it('returns rainy summer variant when enabled', () => {
    const el = card({
      date: '2025-02-15T12:00:00', // summer in AU
      config: { img_summer_rainy_day: true },
      states: { 'weather.home': haState('rainy') },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}summer_rainy_day.png`);
  });

  it('maps "pouring" to "rainy" variant', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      config: { img_summer_rainy_day: true },
      states: { 'weather.home': haState('pouring') },
    });
    expect(el._calculateImage()).toContain('rainy');
  });

  it('maps "lightning-rainy" to "lightning" variant', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      config: { img_summer_lightning_day: true },
      states: { 'weather.home': haState('lightning-rainy') },
    });
    expect(el._calculateImage()).toContain('lightning');
  });

  it('maps "snowy-rainy" to "snowy" variant', () => {
    const el = card({
      date: '2025-07-15T12:00:00',
      config: { img_winter_snowy_day: true },
      states: { 'sensor.season': haState('winter'), 'weather.home': haState('snowy-rainy') },
    });
    expect(el._calculateImage()).toContain('snowy');
  });

  it('falls through to season when variant flag is not enabled', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      states: { 'weather.home': haState('rainy') },
    });
    // Season fallback: summer_day.png
    expect(el._calculateImage()).toBe(`${BASE_PATH}summer_day.png`);
  });

  it('maps hail → hail variant', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      config: { img_summer_hail_day: true },
      states: { 'weather.home': haState('hail') },
    });
    expect(el._calculateImage()).toContain('hail');
  });

  it('maps fog → fog variant', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      config: { img_summer_fog_day: true },
      states: { 'weather.home': haState('fog') },
    });
    expect(el._calculateImage()).toContain('fog');
  });
});

describe('_calculateImage — Priority 7: Season fallback', () => {
  it.each([
    ['summer', 'above_horizon', 'summer_day.png'],
    ['summer', 'below_horizon', 'summer_night.png'],
    ['winter', 'above_horizon', 'winter_day.png'],
    ['spring', 'above_horizon', 'spring_day.png'],
    ['autumn', 'above_horizon', 'autumn_day.png'],
  ])('season=%s sun=%s → %s', (season, sun, expected) => {
    const el = card({
      date: '2025-02-15T12:00:00',
      sun,
      states: { 'sensor.season': haState(season) },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}${expected}`);
  });

  it('translates Polish season names', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      states: { 'sensor.season': haState('lato') }, // Polish for "summer"
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}summer_day.png`);
  });

  it('defaults to summer if season entity is missing', () => {
    const el = card({
      date: '2025-02-15T12:00:00',
      states: {}, // no sensor.season
    });
    // No season state → default 'summer'
    const result = el._calculateImage();
    expect(result).toContain('summer');
  });

  it('uses default image_path when not configured', () => {
    const el = makeCard({
      config: { weather_entity: 'weather.home', season_entity: 'sensor.season' },
      states: {
        'sun.sun': haState('above_horizon'),
        'sensor.season': haState('summer'),
        'weather.home': haState('sunny'),
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-02-15T12:00:00'));
    expect(el._calculateImage()).toContain('/local/community/fork_u-house_card/images/');
  });
});

describe('_calculateImage — priority chain ordering', () => {
  // Gaming should beat everything else
  it('gaming beats xmas calendar', () => {
    const el = card({
      date: '2025-12-15T12:00:00',
      config: { party_mode_entity: 'input_boolean.g', gaming_image: 'synthwave' },
      states: { 'input_boolean.g': haState('on') },
    });
    expect(el._calculateImage()).toContain('gaming_');
  });

  // Xmas beats birthdays (Dec 23 special case: both could trigger)
  it('xmas calendar beats birthdays in December', () => {
    const el = card({
      date: '2025-12-23T12:00:00',
      config: { birthdays: [{ name: 'girl_bday', date: '12-23' }] },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}xmas_dec23_day.png`);
  });

  // Birthdays beat themed days (if a birthday landed on a themed day)
  it('birthday beats themed day when overlapping', () => {
    const el = card({
      date: '2025-04-25T12:00:00', // ANZAC Day
      config: { birthdays: [{ name: 'kid', date: '04-25' }] },
      states: { 'sensor.season': haState('autumn') },
    });
    expect(el._calculateImage()).toContain('themed_kid_');
  });

  // Themed day beats weather variant
  it('themed day beats weather variant', () => {
    const el = card({
      date: '2025-04-25T12:00:00', // ANZAC Day
      config: { img_autumn_rainy_day: true },
      states: {
        'sensor.season': haState('autumn'),
        'weather.home': haState('rainy'),
      },
    });
    expect(el._calculateImage()).toBe(`${BASE_PATH}themed_anzac_day_day.png`);
  });
});
