import { describe, it, expect } from 'vitest';
import { mountCard, haState } from './test-utils.js';

describe('_updateAlerts — basic visibility', () => {
  it('renders an alert when the entity state matches show_when (default "on")', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.door', icon: '!' }] },
      states: { 'binary_sensor.door': haState('on') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelectorAll('.alert-badge')).toHaveLength(1);
  });

  it('does not render an alert when state does not match', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.door', icon: '!' }] },
      states: { 'binary_sensor.door': haState('off') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelectorAll('.alert-badge')).toHaveLength(0);
  });

  it('does not render an alert when the entity is missing (non-edit mode)', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.missing', icon: '!' }] },
      states: {},
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelectorAll('.alert-badge')).toHaveLength(0);
  });

  it('supports custom show_when rules', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'sensor.battery', icon: 'mdi:battery', show_when: { lt: 20 } }] },
      states: { 'sensor.battery': haState('15') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelectorAll('.alert-badge')).toHaveLength(1);

    el._hass.states['sensor.battery'] = haState('50');
    el._updateAlerts();
    expect(el.shadowRoot.querySelectorAll('.alert-badge')).toHaveLength(0);
  });
});

describe('_updateAlerts — icon rendering', () => {
  it('renders emoji icons inline', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a', icon: '🔥' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    const iconEl = el.shadowRoot.querySelector('.alert-icon');
    expect(iconEl.textContent).toBe('🔥');
    expect(iconEl.querySelector('ha-icon')).toBeNull();
  });

  it('renders mdi: icons as ha-icon elements', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a', icon: 'mdi:alert' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    const haIcon = el.shadowRoot.querySelector('.alert-icon ha-icon');
    expect(haIcon).not.toBeNull();
    expect(haIcon.getAttribute('icon')).toBe('mdi:alert');
  });

  it('defaults icon to "!" when not specified', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelector('.alert-icon').textContent).toBe('!');
  });
});

describe('_updateAlerts — styling', () => {
  it('applies background when color is set', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a', color: '#ff0000' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    const icon = el.shadowRoot.querySelector('.alert-icon');
    expect(icon.getAttribute('style')).toContain('background: #ff0000');
  });

  it('has transparent background when color is unset', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    const icon = el.shadowRoot.querySelector('.alert-icon');
    expect(icon.getAttribute('style')).toContain('background: transparent');
  });

  it('adds pulse class by default', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelector('.alert-badge').classList.contains('alert-pulse')).toBe(true);
  });

  it('omits pulse class when pulse: false', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a', pulse: false }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelector('.alert-badge').classList.contains('alert-pulse')).toBe(false);
  });

  it('renders the label span when label is set', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a', label: 'Door open' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    const label = el.shadowRoot.querySelector('.alert-label');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe('Door open');
  });

  it('omits the label span when label is empty', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a' }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelector('.alert-label')).toBeNull();
  });

  it('positions via top/left', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a', x: 25, y: 80 }] },
      states: { 'binary_sensor.a': haState('on') },
    });
    el._updateAlerts();
    const badge = el.shadowRoot.querySelector('.alert-badge');
    expect(badge.style.top).toBe('80%');
    expect(badge.style.left).toBe('25%');
  });
});

describe('_updateAlerts — edit mode', () => {
  it('shows hidden alerts with opacity in edit mode', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a' }] },
      states: { 'binary_sensor.a': haState('off') },
      editMode: true,
    });
    el._updateAlerts();
    const badge = el.shadowRoot.querySelector('.alert-badge');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('style')).toContain('opacity: 0.3');
  });

  it('suppresses pulse animation on edit-hidden alerts', () => {
    const el = mountCard({
      config: { alerts: [{ entity: 'binary_sensor.a' }] },
      states: { 'binary_sensor.a': haState('off') },
      editMode: true,
    });
    el._updateAlerts();
    expect(el.shadowRoot.querySelector('.alert-badge').classList.contains('alert-pulse')).toBe(false);
  });
});
