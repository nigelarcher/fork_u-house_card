import { describe, it, expect } from 'vitest';
import { mountCard, haState } from './test-utils.js';

describe('_updateSprinklers', () => {
  it('renders nothing when no sprinklers configured', () => {
    const el = mountCard();
    el._updateSprinklers();
    expect(el.shadowRoot.querySelectorAll('.sprinkler-zone')).toHaveLength(0);
  });

  it('renders a zone when the switch is on', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.front_lawn' }] },
      states: { 'switch.front_lawn': haState('on') },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelectorAll('.sprinkler-zone')).toHaveLength(1);
  });

  it('does not render a zone when the switch is off', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.front_lawn' }] },
      states: { 'switch.front_lawn': haState('off') },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelectorAll('.sprinkler-zone')).toHaveLength(0);
  });

  it('does not render a zone when the entity is missing', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.missing' }] },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelectorAll('.sprinkler-zone')).toHaveLength(0);
  });

  it('applies size class', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.a', size: 'large' }] },
      states: { 'switch.a': haState('on') },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelector('.sprinkler-zone').classList.contains('sprinkler-large')).toBe(true);
  });

  it('defaults to size medium', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.a' }] },
      states: { 'switch.a': haState('on') },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelector('.sprinkler-zone').classList.contains('sprinkler-medium')).toBe(true);
  });

  it('applies custom color to spray elements', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.a', color: '#00ff00' }] },
      states: { 'switch.a': haState('on') },
    });
    el._updateSprinklers();
    const spray = el.shadowRoot.querySelector('.sprinkler-spray');
    expect(spray.getAttribute('style')).toContain('border-color: #00ff00');
  });

  it('renders label when provided', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.a', label: 'Lawn' }] },
      states: { 'switch.a': haState('on') },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelector('.sprinkler-label').textContent).toBe('Lawn');
  });

  it('honours show_when with operator rules', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'sensor.moisture', show_when: { lt: 30 } }] },
      states: { 'sensor.moisture': haState('20') },
    });
    el._updateSprinklers();
    expect(el.shadowRoot.querySelectorAll('.sprinkler-zone')).toHaveLength(1);
  });

  it('shows hidden zones with opacity in edit mode', () => {
    const el = mountCard({
      config: { sprinklers: [{ entity: 'switch.a' }] },
      states: { 'switch.a': haState('off') },
      editMode: true,
    });
    el._updateSprinklers();
    const zone = el.shadowRoot.querySelector('.sprinkler-zone');
    expect(zone).not.toBeNull();
    expect(zone.getAttribute('style')).toContain('opacity: 0.3');
  });
});
