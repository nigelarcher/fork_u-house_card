import { describe, it, expect } from 'vitest';
import { makeCard } from './test-utils.js';

// _getBadgeColor uses only this._config — state is passed via the room arg.
function card(config = {}) {
  return makeCard({ config });
}

describe('_getBadgeColor — default temperature thresholds', () => {
  // Default thresholds: [18, 24, 30, 35]
  //  < 18  → is-cold
  //  < 24  → is-optimal
  //  < 30  → is-warm
  //  ≥ 30  → is-hot
  const el = card();

  it('cold zone (< 18°)', () => {
    expect(el._getBadgeColor({ value: 15 }).colorClass).toBe('is-cold');
  });

  it('optimal zone (18–23.9°)', () => {
    expect(el._getBadgeColor({ value: 20 }).colorClass).toBe('is-optimal');
  });

  it('warm zone (24–29.9°)', () => {
    expect(el._getBadgeColor({ value: 27 }).colorClass).toBe('is-warm');
  });

  it('hot zone (≥ 30°)', () => {
    expect(el._getBadgeColor({ value: 35 }).colorClass).toBe('is-hot');
  });

  it('boundary: 18° is optimal (not cold)', () => {
    expect(el._getBadgeColor({ value: 18 }).colorClass).toBe('is-optimal');
  });

  it('boundary: 24° is warm (not optimal)', () => {
    expect(el._getBadgeColor({ value: 24 }).colorClass).toBe('is-warm');
  });
});

describe('_getBadgeColor — global temp_thresholds override', () => {
  it('uses configured thresholds', () => {
    const el = card({ temp_thresholds: [10, 15, 20, 25] });
    expect(el._getBadgeColor({ value: 8 }).colorClass).toBe('is-cold');
    expect(el._getBadgeColor({ value: 12 }).colorClass).toBe('is-optimal');
    expect(el._getBadgeColor({ value: 17 }).colorClass).toBe('is-warm');
    expect(el._getBadgeColor({ value: 22 }).colorClass).toBe('is-hot');
  });
});

describe('_getBadgeColor — per-room custom thresholds and colors', () => {
  const el = card();

  it('uses custom color for value below first threshold', () => {
    const result = el._getBadgeColor({
      value: 5,
      thresholds: [10, 20, 30],
      colors: ['#111', '#222', '#333', '#444'],
    });
    expect(result.colorStyle).toContain('#111');
  });

  it('uses custom color for middle zone', () => {
    const result = el._getBadgeColor({
      value: 15,
      thresholds: [10, 20, 30],
      colors: ['#111', '#222', '#333', '#444'],
    });
    expect(result.colorStyle).toContain('#222');
  });

  it('uses custom color for third zone', () => {
    const result = el._getBadgeColor({
      value: 25,
      thresholds: [10, 20, 30],
      colors: ['#111', '#222', '#333', '#444'],
    });
    expect(result.colorStyle).toContain('#333');
  });

  it('uses custom color for value above last threshold', () => {
    const result = el._getBadgeColor({
      value: 50,
      thresholds: [10, 20, 30],
      colors: ['#111', '#222', '#333', '#444'],
    });
    expect(result.colorStyle).toContain('#444');
  });

  it('returns empty colorClass when using custom colors', () => {
    const result = el._getBadgeColor({
      value: 15,
      thresholds: [10, 20, 30],
      colors: ['#111', '#222', '#333', '#444'],
    });
    expect(result.colorClass).toBe('');
  });

  it('falls back through shorter color array (fewer colors than zones)', () => {
    const result = el._getBadgeColor({
      value: 50,
      thresholds: [10, 20, 30],
      colors: ['#111'], // only one color
    });
    // All zones should fall back to #111
    expect(result.colorStyle).toContain('#111');
  });
});

describe('_getBadgeColor — non-temperature units', () => {
  const el = card();

  it('returns is-neutral for non-° unit', () => {
    const result = el._getBadgeColor({ value: 50, unit: '%' });
    expect(result.colorClass).toBe('is-neutral');
    expect(result.colorStyle).toBe('');
  });

  it('still honors custom thresholds even with non-temperature unit', () => {
    const result = el._getBadgeColor({
      value: 50,
      unit: '%',
      thresholds: [25, 50, 75],
      colors: ['#a', '#b', '#c', '#d'],
    });
    // Custom thresholds take precedence over unit check
    expect(result.colorStyle).toContain('#c');
  });
});
