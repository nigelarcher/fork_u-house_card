import { describe, it, expect } from 'vitest';
import { getProto } from './test-utils.js';

const proto = getProto();
const isBinDay = (bin, date) => proto._isBinCollectionDay(bin, date);

// Helper: pretend today is a given date (local time, no TZ drama).
const d = (iso) => new Date(iso + 'T12:00:00');

describe('_isBinCollectionDay — day-of-week match', () => {
  it('returns false when the day-of-week does not match', () => {
    // Monday 2025-01-06, bin collected on Thursday
    expect(isBinDay({ day: 'thursday' }, d('2025-01-06'))).toBe(false);
  });

  it('returns true on matching weekday with default weekly cadence', () => {
    // Thursday 2025-01-09
    expect(isBinDay({ day: 'thursday' }, d('2025-01-09'))).toBe(true);
  });

  it('is case-insensitive on day name', () => {
    expect(isBinDay({ day: 'Thursday' }, d('2025-01-09'))).toBe(true);
    expect(isBinDay({ day: 'THURSDAY' }, d('2025-01-09'))).toBe(true);
  });
});

describe('_isBinCollectionDay — weekly cadence', () => {
  it('matches every Thursday', () => {
    expect(isBinDay({ day: 'thursday', cadence: 'weekly' }, d('2025-01-09'))).toBe(true);
    expect(isBinDay({ day: 'thursday', cadence: 'weekly' }, d('2025-01-16'))).toBe(true);
    expect(isBinDay({ day: 'thursday', cadence: 'weekly' }, d('2025-01-23'))).toBe(true);
  });
});

describe('_isBinCollectionDay — fortnightly cadence', () => {
  const bin = { day: 'thursday', cadence: 'fortnightly', anchor_date: '2025-01-09' };

  it('matches on the anchor date', () => {
    expect(isBinDay(bin, d('2025-01-09'))).toBe(true);
  });

  it('matches 2 weeks later', () => {
    expect(isBinDay(bin, d('2025-01-23'))).toBe(true);
  });

  it('matches 4 weeks later', () => {
    expect(isBinDay(bin, d('2025-02-06'))).toBe(true);
  });

  it('does not match 1 week later (off week)', () => {
    expect(isBinDay(bin, d('2025-01-16'))).toBe(false);
  });

  it('does not match 3 weeks later (off week)', () => {
    expect(isBinDay(bin, d('2025-01-30'))).toBe(false);
  });

  it('matches 2 weeks before the anchor (backwards modulo)', () => {
    expect(isBinDay(bin, d('2024-12-26'))).toBe(true);
  });

  it('falls back to "every occurrence" when anchor is missing', () => {
    expect(isBinDay({ day: 'thursday', cadence: 'fortnightly' }, d('2025-01-16'))).toBe(true);
  });

  it('falls back to "every occurrence" when anchor is invalid', () => {
    expect(isBinDay({ day: 'thursday', cadence: 'fortnightly', anchor_date: 'garbage' }, d('2025-01-16'))).toBe(true);
  });
});

describe('_isBinCollectionDay — monthly cadence', () => {
  // Monthly = same occurrence-of-weekday in the month
  // 2025-01-09 is the 2nd Thursday of January
  const bin = { day: 'thursday', cadence: 'monthly', anchor_date: '2025-01-09' };

  it('matches on the anchor date', () => {
    expect(isBinDay(bin, d('2025-01-09'))).toBe(true);
  });

  it('matches the 2nd Thursday of the next month', () => {
    // 2nd Thursday of Feb 2025 = Feb 13
    expect(isBinDay(bin, d('2025-02-13'))).toBe(true);
  });

  it('matches the 2nd Thursday of a later month', () => {
    // 2nd Thursday of May 2025 = May 8
    expect(isBinDay(bin, d('2025-05-08'))).toBe(true);
  });

  it('does not match the 1st Thursday of the next month', () => {
    // 1st Thursday of Feb 2025 = Feb 6
    expect(isBinDay(bin, d('2025-02-06'))).toBe(false);
  });

  it('does not match the 3rd Thursday of the next month', () => {
    // 3rd Thursday of Feb 2025 = Feb 20
    expect(isBinDay(bin, d('2025-02-20'))).toBe(false);
  });
});
