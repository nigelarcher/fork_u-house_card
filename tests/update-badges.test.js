import { describe, it, expect } from 'vitest';
import { mountCard, haState } from './test-utils.js';

// _updateBadges takes a roomsData array where `value` and `valid` are
// already computed (normally by _updateData). Tests pass this directly.

function rd(overrides = {}) {
  return {
    name: 'Lounge',
    entity: 'sensor.lounge',
    x: 50,
    y: 50,
    value: 22,
    valid: true,
    ...overrides,
  };
}

describe('_updateBadges — basic rendering', () => {
  it('renders one badge per valid room', () => {
    const el = mountCard();
    el._updateBadges([rd({ name: 'A' }), rd({ name: 'B', value: 25 })]);
    const badges = el.shadowRoot.querySelectorAll('.badges-layer .badge');
    expect(badges).toHaveLength(2);
  });

  it('skips invalid rooms (valid: false)', () => {
    const el = mountCard();
    el._updateBadges([rd({ name: 'A' }), rd({ name: 'B', valid: false })]);
    const badges = el.shadowRoot.querySelectorAll('.badges-layer .badge');
    expect(badges).toHaveLength(1);
    expect(badges[0].querySelector('.badge-name').textContent).toBe('A');
  });

  it('renders the room name and formatted value', () => {
    const el = mountCard();
    el._updateBadges([rd({ name: 'Kitchen', value: 21.7 })]);
    const badge = el.shadowRoot.querySelector('.badge');
    expect(badge.querySelector('.badge-name').textContent).toBe('Kitchen');
    expect(badge.querySelector('.badge-val').textContent).toBe('21.7°');
  });

  it('honours custom unit', () => {
    const el = mountCard();
    el._updateBadges([rd({ unit: '%', value: 55 })]);
    expect(el.shadowRoot.querySelector('.badge-val').textContent).toBe('55.0%');
  });

  it('positions the badge via top/left style', () => {
    const el = mountCard();
    el._updateBadges([rd({ x: 30, y: 70 })]);
    const badge = el.shadowRoot.querySelector('.badge');
    expect(badge.style.top).toBe('70%');
    expect(badge.style.left).toBe('30%');
  });
});

describe('_updateBadges — colour classes', () => {
  it('applies is-cold class for low temperatures', () => {
    const el = mountCard();
    el._updateBadges([rd({ value: 10 })]);
    expect(el.shadowRoot.querySelector('.badge').classList.contains('is-cold')).toBe(true);
  });

  it('applies is-optimal class for mid temperatures', () => {
    const el = mountCard();
    el._updateBadges([rd({ value: 20 })]);
    expect(el.shadowRoot.querySelector('.badge').classList.contains('is-optimal')).toBe(true);
  });

  it('applies is-warm class', () => {
    const el = mountCard();
    el._updateBadges([rd({ value: 27 })]);
    expect(el.shadowRoot.querySelector('.badge').classList.contains('is-warm')).toBe(true);
  });

  it('applies is-hot class', () => {
    const el = mountCard();
    el._updateBadges([rd({ value: 35 })]);
    expect(el.shadowRoot.querySelector('.badge').classList.contains('is-hot')).toBe(true);
  });

  it('applies is-neutral for non-temperature units', () => {
    const el = mountCard();
    el._updateBadges([rd({ unit: '%', value: 60 })]);
    expect(el.shadowRoot.querySelector('.badge').classList.contains('is-neutral')).toBe(true);
  });
});

describe('_updateBadges — show_when visibility', () => {
  it('hides badges whose show_when evaluates false', () => {
    const el = mountCard({ states: { 'sensor.lounge': haState('off') } });
    el._updateBadges([rd({ show_when: 'on' })]);
    expect(el.shadowRoot.querySelectorAll('.badge')).toHaveLength(0);
  });

  it('shows badges whose show_when evaluates true', () => {
    const el = mountCard({ states: { 'sensor.lounge': haState('on') } });
    el._updateBadges([rd({ show_when: 'on' })]);
    expect(el.shadowRoot.querySelectorAll('.badge')).toHaveLength(1);
  });

  it('respects operator rules', () => {
    const el = mountCard({ states: { 'sensor.lounge': haState('25') } });
    el._updateBadges([rd({ show_when: { gt: 20 } })]);
    expect(el.shadowRoot.querySelectorAll('.badge')).toHaveLength(1);

    el._updateBadges([rd({ show_when: { gt: 30 } })]);
    expect(el.shadowRoot.querySelectorAll('.badge')).toHaveLength(0);
  });
});

describe('_updateBadges — edit mode', () => {
  it('shows hidden badges with opacity overlay in edit mode', () => {
    const el = mountCard({
      states: { 'sensor.lounge': haState('off') },
      editMode: true,
    });
    el._updateBadges([rd({ show_when: 'on' })]);
    const badge = el.shadowRoot.querySelector('.badge');
    expect(badge).not.toBeNull();
    expect(badge.style.opacity).toBe('0.3');
    expect(badge.style.outline).toContain('dashed');
  });
});

describe('_updateBadges — re-render idempotence', () => {
  it('does not rewrite innerHTML when content is unchanged', () => {
    const el = mountCard();
    el._updateBadges([rd()]);
    const container = el.shadowRoot.querySelector('.badges-layer');
    const firstRender = container.innerHTML;
    el._updateBadges([rd()]);
    expect(container.innerHTML).toBe(firstRender);
  });
});
