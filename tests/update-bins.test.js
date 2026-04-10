import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountCard } from './test-utils.js';

afterEach(() => { vi.useRealTimers(); });

const THU_1PM = '2025-01-09T13:00:00'; // Thursday afternoon
const THU_7PM = '2025-01-09T19:00:00'; // Thursday evening
const WED_6PM = '2025-01-08T18:00:00'; // Wednesday 6pm (night before Thursday collection)
const WED_3PM = '2025-01-08T15:00:00'; // Wednesday 3pm (too early for night-before display)
const FRI_1PM = '2025-01-10T13:00:00'; // Friday (day after)

function setDate(iso) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('_updateBins — basic rendering', () => {
  it('renders a bin on collection day', () => {
    setDate(THU_1PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday', color: '#e0e000', label: 'Recycling' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(1);
  });

  it('does not render a bin on a non-collection day', () => {
    setDate(FRI_1PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(0);
  });

  it('renders label when provided', () => {
    setDate(THU_1PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday', label: 'Recycling' }] },
    });
    el._updateBins();
    const label = el.shadowRoot.querySelector('.bin-label');
    expect(label.textContent).toBe('Recycling');
  });

  it('omits label span when not set', () => {
    setDate(THU_1PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelector('.bin-label')).toBeNull();
  });

  it('positions via top/left', () => {
    setDate(THU_1PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday', x: 10, y: 90 }] },
    });
    el._updateBins();
    const badge = el.shadowRoot.querySelector('.bin-badge');
    expect(badge.style.top).toBe('90%');
    expect(badge.style.left).toBe('10%');
  });

  it('does nothing when bins list is empty', () => {
    setDate(THU_1PM);
    const el = mountCard({ config: { bins: [] } });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(0);
  });

  it('renders multiple bins on the same day', () => {
    setDate(THU_1PM);
    const el = mountCard({
      config: {
        bins: [
          { day: 'thursday', label: 'Recycling', x: 10, y: 80 },
          { day: 'thursday', label: 'General', x: 30, y: 80 },
        ],
      },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(2);
  });
});

describe('_updateBins — "5pm night before" visibility', () => {
  it('shows a Thursday bin from 5pm Wednesday', () => {
    setDate(WED_6PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday', label: 'Recycling' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(1);
  });

  it('does NOT show a Thursday bin before 5pm Wednesday', () => {
    setDate(WED_3PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday', label: 'Recycling' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(0);
  });

  it('still shows a bin on the collection day evening', () => {
    setDate(THU_7PM);
    const el = mountCard({
      config: { bins: [{ day: 'thursday' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(1);
  });
});

describe('_updateBins — cadence integration', () => {
  it('respects fortnightly cadence on the "off" week', () => {
    // Anchor: Thursday 2025-01-09
    // Off week: Thursday 2025-01-16
    setDate('2025-01-16T13:00:00');
    const el = mountCard({
      config: { bins: [{ day: 'thursday', cadence: 'fortnightly', anchor_date: '2025-01-09' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(0);
  });

  it('respects fortnightly cadence on the "on" week', () => {
    setDate('2025-01-23T13:00:00');
    const el = mountCard({
      config: { bins: [{ day: 'thursday', cadence: 'fortnightly', anchor_date: '2025-01-09' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(1);
  });

  it('respects monthly cadence (same occurrence-of-weekday)', () => {
    // Anchor = 2nd Thursday of Jan; check 1st Thursday of Feb → should NOT show
    setDate('2025-02-06T13:00:00');
    const el = mountCard({
      config: { bins: [{ day: 'thursday', cadence: 'monthly', anchor_date: '2025-01-09' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(0);
  });

  it('matches monthly cadence on correct occurrence', () => {
    // 2nd Thursday of Feb 2025 = Feb 13
    setDate('2025-02-13T13:00:00');
    const el = mountCard({
      config: { bins: [{ day: 'thursday', cadence: 'monthly', anchor_date: '2025-01-09' }] },
    });
    el._updateBins();
    expect(el.shadowRoot.querySelectorAll('.bin-badge')).toHaveLength(1);
  });
});
