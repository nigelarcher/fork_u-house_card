import { describe, it, expect } from 'vitest';
import { getProto } from './test-utils.js';

const proto = getProto();

// _evaluateVisibility recursively calls this._evaluateVisibility, so bind a
// minimal `this` that carries the method reference.
const self = { _evaluateVisibility: proto._evaluateVisibility };
const evalVis = (rule, value) => self._evaluateVisibility(rule, value);

describe('_evaluateVisibility — null/undefined rule', () => {
  it('returns true when rule is undefined (always visible)', () => {
    expect(evalVis(undefined, 'anything')).toBe(true);
  });

  it('returns true when rule is null', () => {
    expect(evalVis(null, 'anything')).toBe(true);
  });
});

describe('_evaluateVisibility — exact value match', () => {
  it('matches string equal', () => {
    expect(evalVis('on', 'on')).toBe(true);
  });

  it('does not match different string', () => {
    expect(evalVis('on', 'off')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(evalVis('ON', 'on')).toBe(true);
    expect(evalVis('on', 'ON')).toBe(true);
  });

  it('matches number to string', () => {
    expect(evalVis(42, '42')).toBe(true);
    expect(evalVis(42, '43')).toBe(false);
  });
});

describe('_evaluateVisibility — array membership', () => {
  it('matches when value is in array', () => {
    expect(evalVis(['red', 'green', 'blue'], 'green')).toBe(true);
  });

  it('does not match when value not in array', () => {
    expect(evalVis(['red', 'green', 'blue'], 'yellow')).toBe(false);
  });

  it('is case-insensitive in array', () => {
    expect(evalVis(['Red', 'Green'], 'red')).toBe(true);
  });

  it('matches numeric values in array', () => {
    expect(evalVis([1, 2, 3], '2')).toBe(true);
    expect(evalVis([1, 2, 3], '4')).toBe(false);
  });
});

describe('_evaluateVisibility — operator objects', () => {
  it('gt: passes when value greater', () => {
    expect(evalVis({ gt: 10 }, '15')).toBe(true);
  });

  it('gt: fails when value equal', () => {
    expect(evalVis({ gt: 10 }, '10')).toBe(false);
  });

  it('gt: fails when value less', () => {
    expect(evalVis({ gt: 10 }, '5')).toBe(false);
  });

  it('lt: passes when value less', () => {
    expect(evalVis({ lt: 10 }, '5')).toBe(true);
  });

  it('lt: fails when value equal', () => {
    expect(evalVis({ lt: 10 }, '10')).toBe(false);
  });

  it('gte: passes when equal', () => {
    expect(evalVis({ gte: 10 }, '10')).toBe(true);
  });

  it('gte: passes when greater', () => {
    expect(evalVis({ gte: 10 }, '11')).toBe(true);
  });

  it('gte: fails when less', () => {
    expect(evalVis({ gte: 10 }, '9')).toBe(false);
  });

  it('lte: passes when equal', () => {
    expect(evalVis({ lte: 10 }, '10')).toBe(true);
  });

  it('lte: fails when greater', () => {
    expect(evalVis({ lte: 10 }, '11')).toBe(false);
  });

  it('eq: passes on equality', () => {
    expect(evalVis({ eq: 42 }, '42')).toBe(true);
  });

  it('eq: fails on inequality', () => {
    expect(evalVis({ eq: 42 }, '43')).toBe(false);
  });

  it('neq: passes when different', () => {
    expect(evalVis({ neq: 0 }, '5')).toBe(true);
  });

  it('neq: fails when equal', () => {
    expect(evalVis({ neq: 0 }, '0')).toBe(false);
  });

  it('range: passes inside (inclusive)', () => {
    expect(evalVis({ range: [10, 20] }, '15')).toBe(true);
    expect(evalVis({ range: [10, 20] }, '10')).toBe(true);
    expect(evalVis({ range: [10, 20] }, '20')).toBe(true);
  });

  it('range: fails outside', () => {
    expect(evalVis({ range: [10, 20] }, '9')).toBe(false);
    expect(evalVis({ range: [10, 20] }, '21')).toBe(false);
  });

  it('combines multiple operators (AND semantics)', () => {
    expect(evalVis({ gt: 10, lt: 20 }, '15')).toBe(true);
    expect(evalVis({ gt: 10, lt: 20 }, '5')).toBe(false);
    expect(evalVis({ gt: 10, lt: 20 }, '25')).toBe(false);
  });

  it('returns false when value is non-numeric and rule has operator', () => {
    expect(evalVis({ gt: 10 }, 'not-a-number')).toBe(false);
    expect(evalVis({ gt: 10 }, '')).toBe(false);
  });
});

describe('_evaluateVisibility — HA-reformatted array-of-operator-objects', () => {
  // HA's YAML loader can reformat `show_when: {gt: 10, lt: 20}` into
  // `show_when: [{gt: 10}, {lt: 20}]`. The code detects this and merges.
  it('merges [{gt: 10}, {lt: 20}] into a single AND rule', () => {
    expect(evalVis([{ gt: 10 }, { lt: 20 }], '15')).toBe(true);
    expect(evalVis([{ gt: 10 }, { lt: 20 }], '5')).toBe(false);
    expect(evalVis([{ gt: 10 }, { lt: 20 }], '25')).toBe(false);
  });

  it('handles single-element operator array', () => {
    expect(evalVis([{ gte: 5 }], '5')).toBe(true);
    expect(evalVis([{ gte: 5 }], '4')).toBe(false);
  });

  it('does not treat plain object arrays as operator arrays', () => {
    // Array of non-operator strings should still be treated as membership
    expect(evalVis(['gt', 'lt'], 'gt')).toBe(true);
  });
});
