import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mountCard } from './test-utils.js';

// ---------------------------------------------------------------------------
// Helper: build a mounted card with tips config and a fake hass.connection
// that records subscribeMessage calls so we can inspect and simulate pushes.
// ---------------------------------------------------------------------------
function tipsCard({
  rules = [],
  display = 'rotating',
  hide_when_empty = true,
  idle_message,
  rotation_seconds,
  states = {},
} = {}) {
  const tips = { rules, display, hide_when_empty };
  if (idle_message !== undefined) tips.idle_message = idle_message;
  if (rotation_seconds !== undefined) tips.rotation_seconds = rotation_seconds;

  const el = mountCard({ config: { tips }, states });

  // Initialize tips state that setConfig normally handles
  el._activeTips = [];
  el._tipRotationIdx = 0;
  el._tipsTemplateCache = null;
  el._tipRotationTimer = null;
  el._tipsUnsub = null;
  el._tipsPending = false;

  // Wire up a fake hass.connection.subscribeMessage that:
  //  - records the call args
  //  - captures the callback so tests can simulate HA pushing data
  //  - returns a promise that resolves with an unsub function
  const calls = [];
  const unsubFns = [];
  el._hass.connection = {
    subscribeMessage: vi.fn((callback, payload) => {
      const unsub = vi.fn();
      calls.push({ callback, payload, unsub });
      unsubFns.push(unsub);
      return Promise.resolve(unsub);
    }),
  };

  return { el, calls, unsubFns };
}

// Simulate HA pushing a tips result to the subscribeMessage callback.
function pushTips(calls, tips) {
  const json = JSON.stringify(tips);
  calls[calls.length - 1].callback({ result: json });
}

// ---------------------------------------------------------------------------
// _setupTips — subscription lifecycle
// ---------------------------------------------------------------------------
describe('_setupTips — subscription lifecycle', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('subscribes to render_template when rules are configured', async () => {
    const { el, calls } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'hi' }],
    });
    el._setupTips();
    expect(calls).toHaveLength(1);
    expect(calls[0].payload.type).toBe('render_template');
    expect(calls[0].payload.template).toContain("{% if true %}");
  });

  it('does not subscribe when rules array is empty', () => {
    const { el, calls } = tipsCard({ rules: [] });
    el._setupTips();
    expect(calls).toHaveLength(0);
  });

  it('does not subscribe when tips config is absent', () => {
    const el = mountCard({ config: {} });
    el._hass.connection = { subscribeMessage: vi.fn(() => Promise.resolve(vi.fn())) };
    el._setupTips();
    expect(el._hass.connection.subscribeMessage).not.toHaveBeenCalled();
  });

  it('does not re-subscribe if template has not changed', () => {
    const { el, calls } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'hi' }],
    });
    el._setupTips();
    // Simulate the first subscription resolving
    el._tipsUnsub = calls[0].unsub;
    el._tipsPending = false;

    el._setupTips();
    // Should not have opened a second subscription
    expect(calls).toHaveLength(1);
  });

  it('re-subscribes when rules change', async () => {
    const { el, calls } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'v1' }],
    });
    el._setupTips();
    el._tipsUnsub = calls[0].unsub;
    el._tipsPending = false;

    // Change the rules
    el._config.tips.rules = [{ id: 'b', when: 'false', text: 'v2' }];
    el._tipsTemplateCache = 'old-template'; // force mismatch
    el._setupTips();

    expect(calls).toHaveLength(2);
    // The old subscription should have been cleaned up
    expect(calls[0].unsub).toHaveBeenCalled();
  });

  it('sets _activeTips from the HA callback result', () => {
    const { el, calls } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'hi' }],
    });
    el._setupTips();
    pushTips(calls, [{ id: 'a', text: 'hi', icon: 'mdi:info', level: 'info', priority: 5 }]);
    expect(el._activeTips).toHaveLength(1);
    expect(el._activeTips[0].id).toBe('a');
  });

  it('sets _activeTips to [] on malformed JSON', () => {
    const { el, calls } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'hi' }],
    });
    el._setupTips();
    // Push invalid JSON
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    calls[0].callback({ result: 'not valid json{' });
    expect(el._activeTips).toEqual([]);
    warn.mockRestore();
  });

  it('sets _activeTips to [] when result is empty string', () => {
    const { el, calls } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'hi' }],
    });
    el._setupTips();
    calls[0].callback({ result: '' });
    expect(el._activeTips).toEqual([]);
  });

  it('cleans up footer when rules become empty', () => {
    const { el } = tipsCard({ rules: [] });
    // Simulate prior tips subscription state
    el._tipsUnsub = vi.fn();
    el._setupTips();
    expect(el._tipsUnsub).toBeNull();
    const footer = el.shadowRoot.querySelector('.footer');
    expect(footer.getAttribute('data-status')).toBe('normal');
  });

  it('does not subscribe when hass.connection is missing', () => {
    const { el } = tipsCard({
      rules: [{ id: 'a', when: 'true', text: 'hi' }],
    });
    el._hass.connection = undefined;
    expect(() => el._setupTips()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _renderTips — DOM rendering
// ---------------------------------------------------------------------------
describe('_renderTips — no active tips', () => {
  it('hides footer when no tips and hide_when_empty is true (default)', () => {
    const { el } = tipsCard();
    el._activeTips = [];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').style.display).toBe('none');
  });

  it('shows idle_message when no tips but idle_message configured', () => {
    const { el } = tipsCard({ idle_message: 'All clear' });
    el._activeTips = [];
    el._renderTips();
    const footer = el.shadowRoot.querySelector('.footer');
    expect(footer.style.display).not.toBe('none');
    expect(footer.getAttribute('data-status')).toBe('normal');
    expect(footer.querySelector('.footer-content').textContent).toContain('All clear');
  });

  it('shows empty footer when hide_when_empty is false and no idle_message', () => {
    const { el } = tipsCard({ hide_when_empty: false });
    el._activeTips = [];
    el._renderTips();
    const footer = el.shadowRoot.querySelector('.footer');
    expect(footer.style.display).not.toBe('none');
    expect(footer.getAttribute('data-status')).toBe('normal');
    expect(footer.classList.contains('tips-active')).toBe(false);
  });
});

describe('_renderTips — single display mode', () => {
  it('renders only the first tip', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [
      { id: 'a', text: 'First', icon: 'mdi:a', level: 'info' },
      { id: 'b', text: 'Second', icon: 'mdi:b', level: 'warn' },
    ];
    el._renderTips();
    const rows = el.shadowRoot.querySelectorAll('.tip-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.tip-text').textContent).toBe('First');
  });
});

describe('_renderTips — stacked display mode', () => {
  it('renders up to 3 tips', () => {
    const { el } = tipsCard({ display: 'stacked' });
    el._activeTips = [
      { id: 'a', text: 'One', icon: '', level: 'info' },
      { id: 'b', text: 'Two', icon: '', level: 'info' },
      { id: 'c', text: 'Three', icon: '', level: 'info' },
      { id: 'd', text: 'Four', icon: '', level: 'info' },
    ];
    el._renderTips();
    expect(el.shadowRoot.querySelectorAll('.tip-row')).toHaveLength(3);
  });

  it('renders fewer than 3 if fewer tips exist', () => {
    const { el } = tipsCard({ display: 'stacked' });
    el._activeTips = [{ id: 'a', text: 'One', icon: '', level: 'info' }];
    el._renderTips();
    expect(el.shadowRoot.querySelectorAll('.tip-row')).toHaveLength(1);
  });
});

describe('_renderTips — rotating display mode', () => {
  it('renders one tip at the current rotation index', () => {
    const { el } = tipsCard({ display: 'rotating' });
    el._activeTips = [
      { id: 'a', text: 'First', icon: '', level: 'info' },
      { id: 'b', text: 'Second', icon: '', level: 'info' },
    ];
    el._tipRotationIdx = 0;
    el._renderTips();
    expect(el.shadowRoot.querySelectorAll('.tip-row')).toHaveLength(1);
    expect(el.shadowRoot.querySelector('.tip-text').textContent).toBe('First');

    el._tipRotationIdx = 1;
    el._renderTips();
    expect(el.shadowRoot.querySelector('.tip-text').textContent).toBe('Second');
  });

  it('wraps rotation index to valid range', () => {
    const { el } = tipsCard({ display: 'rotating' });
    el._activeTips = [
      { id: 'a', text: 'A', icon: '', level: 'info' },
      { id: 'b', text: 'B', icon: '', level: 'info' },
    ];
    el._tipRotationIdx = 5; // out of bounds
    el._renderTips();
    // 5 % 2 = 1
    expect(el.shadowRoot.querySelector('.tip-text').textContent).toBe('B');
  });
});

describe('_renderTips — icon rendering', () => {
  it('renders mdi: icons as ha-icon elements', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', icon: 'mdi:alert', level: 'info' }];
    el._renderTips();
    const haIcon = el.shadowRoot.querySelector('ha-icon');
    expect(haIcon).not.toBeNull();
    expect(haIcon.getAttribute('icon')).toBe('mdi:alert');
  });

  it('renders emoji icons as text spans', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', icon: '🔥', level: 'info' }];
    el._renderTips();
    const emoji = el.shadowRoot.querySelector('.tip-icon-emoji');
    expect(emoji).not.toBeNull();
    expect(emoji.textContent).toBe('🔥');
    expect(el.shadowRoot.querySelector('ha-icon')).toBeNull();
  });

  it('handles missing icon gracefully', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', level: 'info' }];
    el._renderTips();
    // Should render without error
    expect(el.shadowRoot.querySelectorAll('.tip-row')).toHaveLength(1);
  });
});

describe('_renderTips — level-based footer styling', () => {
  it('sets data-status to normal for info-level tips', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', icon: '', level: 'info' }];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').getAttribute('data-status')).toBe('normal');
  });

  it('sets data-status to warn for warn-level tips', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', icon: '', level: 'warn' }];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').getAttribute('data-status')).toBe('warn');
  });

  it('sets data-status to danger for danger-level tips', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', icon: '', level: 'danger' }];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').getAttribute('data-status')).toBe('danger');
  });

  it('uses the highest level among visible tips (stacked)', () => {
    const { el } = tipsCard({ display: 'stacked' });
    el._activeTips = [
      { id: 'a', text: 'ok', icon: '', level: 'info' },
      { id: 'b', text: 'bad', icon: '', level: 'danger' },
      { id: 'c', text: 'meh', icon: '', level: 'warn' },
    ];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').getAttribute('data-status')).toBe('danger');
  });

  it('adds tips-active class to footer when tips are present', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [{ id: 'a', text: 't', icon: '', level: 'info' }];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').classList.contains('tips-active')).toBe(true);
  });

  it('removes tips-active class when tips disappear', () => {
    const { el } = tipsCard({ display: 'single', idle_message: 'idle' });
    el._activeTips = [{ id: 'a', text: 't', icon: '', level: 'info' }];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').classList.contains('tips-active')).toBe(true);

    el._activeTips = [];
    el._renderTips();
    expect(el.shadowRoot.querySelector('.footer').classList.contains('tips-active')).toBe(false);
  });
});

describe('_renderTips — early exit', () => {
  it('is a no-op when tips config is absent', () => {
    const el = mountCard({ config: {} });
    el._activeTips = [{ id: 'a', text: 't', icon: '', level: 'info' }];
    expect(() => el._renderTips()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _setupTipRotation — interval timer management
// ---------------------------------------------------------------------------
describe('_setupTipRotation', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('creates an interval when display is rotating and multiple tips exist', () => {
    const { el } = tipsCard({ display: 'rotating', rotation_seconds: 5 });
    el._activeTips = [
      { id: 'a', text: 'A', icon: '', level: 'info' },
      { id: 'b', text: 'B', icon: '', level: 'info' },
    ];
    el._tipRotationIdx = 0;
    el._renderTips(); // initial render

    el._setupTipRotation();
    expect(el._tipRotationTimer).not.toBeNull();

    // Advance timer by 5s — should rotate to next tip
    vi.advanceTimersByTime(5000);
    expect(el._tipRotationIdx).toBe(1);

    // Another 5s — wraps back to 0
    vi.advanceTimersByTime(5000);
    expect(el._tipRotationIdx).toBe(0);
  });

  it('does not create an interval for single display mode', () => {
    const { el } = tipsCard({ display: 'single' });
    el._activeTips = [
      { id: 'a', text: 'A', icon: '', level: 'info' },
      { id: 'b', text: 'B', icon: '', level: 'info' },
    ];
    el._setupTipRotation();
    expect(el._tipRotationTimer).toBeNull();
  });

  it('does not create an interval for stacked display mode', () => {
    const { el } = tipsCard({ display: 'stacked' });
    el._activeTips = [
      { id: 'a', text: 'A', icon: '', level: 'info' },
      { id: 'b', text: 'B', icon: '', level: 'info' },
    ];
    el._setupTipRotation();
    expect(el._tipRotationTimer).toBeNull();
  });

  it('does not create an interval with only one tip', () => {
    const { el } = tipsCard({ display: 'rotating' });
    el._activeTips = [{ id: 'a', text: 'A', icon: '', level: 'info' }];
    el._setupTipRotation();
    expect(el._tipRotationTimer).toBeNull();
  });

  it('clears previous interval before creating a new one', () => {
    const { el } = tipsCard({ display: 'rotating', rotation_seconds: 5 });
    el._activeTips = [
      { id: 'a', text: 'A', icon: '', level: 'info' },
      { id: 'b', text: 'B', icon: '', level: 'info' },
    ];
    el._setupTipRotation();
    const firstTimer = el._tipRotationTimer;

    el._setupTipRotation();
    expect(el._tipRotationTimer).not.toBe(firstTimer);
  });

  it('defaults to 8 second rotation when rotation_seconds not set', () => {
    const { el } = tipsCard({ display: 'rotating' });
    el._activeTips = [
      { id: 'a', text: 'A', icon: '', level: 'info' },
      { id: 'b', text: 'B', icon: '', level: 'info' },
    ];
    el._tipRotationIdx = 0;
    el._setupTipRotation();

    vi.advanceTimersByTime(7999);
    expect(el._tipRotationIdx).toBe(0); // not yet

    vi.advanceTimersByTime(1);
    expect(el._tipRotationIdx).toBe(1); // exactly 8s
  });
});
