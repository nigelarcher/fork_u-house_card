import { describe, it, expect } from 'vitest';
import { getProto } from './test-utils.js';

const proto = getProto();

describe('_getNthSundayOfMonth', () => {
  const fn = (y, m, n) => proto._getNthSundayOfMonth(y, m, n);

  it('finds 1st Sunday of September 2024 (Fathers Day AU)', () => {
    expect(fn(2024, 9, 1)).toBe(1); // Sep 1 2024 is a Sunday
  });

  it('finds 1st Sunday of September 2025 (Fathers Day AU)', () => {
    expect(fn(2025, 9, 1)).toBe(7);
  });

  it('finds 2nd Sunday of May 2024 (Mothers Day AU)', () => {
    expect(fn(2024, 5, 2)).toBe(12);
  });

  it('finds 2nd Sunday of May 2025 (Mothers Day AU)', () => {
    expect(fn(2025, 5, 2)).toBe(11);
  });

  it('finds 2nd Sunday of May 2026 (Mothers Day AU)', () => {
    expect(fn(2026, 5, 2)).toBe(10);
  });
});

describe('_getNthDayOfMonth', () => {
  const fn = (y, m, dow, n) => proto._getNthDayOfMonth(y, m, dow, n);

  it('finds 1st Tuesday of November 2024 (Melbourne Cup)', () => {
    expect(fn(2024, 11, 2, 1)).toBe(5);
  });

  it('finds 1st Tuesday of November 2025 (Melbourne Cup)', () => {
    expect(fn(2025, 11, 2, 1)).toBe(4);
  });

  it('finds 1st Wednesday of June 2024 (State of Origin game 1)', () => {
    expect(fn(2024, 6, 3, 1)).toBe(5);
  });

  it('finds 3rd Wednesday of June 2024 (State of Origin game 2)', () => {
    expect(fn(2024, 6, 3, 3)).toBe(19);
  });

  it('finds 2nd Wednesday of July 2024 (State of Origin game 3)', () => {
    expect(fn(2024, 7, 3, 2)).toBe(10);
  });
});

describe('_getLastDayOfMonth', () => {
  const fn = (y, m, dow) => proto._getLastDayOfMonth(y, m, dow);

  it('finds last Sunday of March 2024 (Neighbour Day)', () => {
    expect(fn(2024, 3, 0)).toBe(31);
  });

  it('finds last Sunday of March 2025 (Neighbour Day)', () => {
    expect(fn(2025, 3, 0)).toBe(30);
  });

  it('finds last Saturday of September 2024 (AFL Grand Final)', () => {
    expect(fn(2024, 9, 6)).toBe(28);
  });

  it('finds last Saturday of September 2025 (AFL Grand Final)', () => {
    expect(fn(2025, 9, 6)).toBe(27);
  });

  it('finds last Saturday of September 2026', () => {
    expect(fn(2026, 9, 6)).toBe(26);
  });
});

describe('_getEasterSunday', () => {
  const fn = (y) => proto._getEasterSunday(y);

  // Verified against the Church of England / Wikipedia Easter date tables.
  const knownEasterDates = [
    [2020, 4, 12],
    [2021, 4, 4],
    [2022, 4, 17],
    [2023, 4, 9],
    [2024, 3, 31],
    [2025, 4, 20],
    [2026, 4, 5],
    [2027, 3, 28],
    [2028, 4, 16],
    [2029, 4, 1],
    [2030, 4, 21],
  ];

  it.each(knownEasterDates)('Easter %i falls on %i/%i', (year, month, day) => {
    expect(fn(year)).toEqual({ month, day });
  });
});
