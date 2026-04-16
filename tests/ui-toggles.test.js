import { describe, it, expect } from 'vitest';
import { mountCard, haState } from './test-utils.js';

describe('_handleGamingMode', () => {
  it('adds .gaming-active to .card when party entity is on', () => {
    const el = mountCard({
      config: { party_mode_entity: 'input_boolean.g' },
      states: { 'input_boolean.g': haState('on') },
    });
    expect(el._handleGamingMode()).toBe(true);
    expect(el.shadowRoot.querySelector('.card').classList.contains('gaming-active')).toBe(true);
  });

  it('removes .gaming-active when party entity is off', () => {
    const el = mountCard({
      config: { party_mode_entity: 'input_boolean.g' },
      states: { 'input_boolean.g': haState('off') },
    });
    el.shadowRoot.querySelector('.card').classList.add('gaming-active');
    expect(el._handleGamingMode()).toBe(false);
    expect(el.shadowRoot.querySelector('.card').classList.contains('gaming-active')).toBe(false);
  });

  it('returns falsy and does nothing when party_mode_entity is not configured', () => {
    const el = mountCard();
    expect(el._handleGamingMode()).toBeFalsy();
    expect(el.shadowRoot.querySelector('.card').classList.contains('gaming-active')).toBe(false);
  });
});

describe('_handleDayNight', () => {
  it('sets dim-layer opacity to 0.1 when sun is below horizon', () => {
    const el = mountCard({
      states: { 'sun.sun': haState('below_horizon') },
    });
    expect(el._handleDayNight()).toBe(true);
    expect(el.shadowRoot.querySelector('.dim-layer').style.opacity).toBe('0.1');
  });

  it('sets dim-layer opacity to 0 when sun is above horizon', () => {
    const el = mountCard({
      states: { 'sun.sun': haState('above_horizon') },
    });
    expect(el._handleDayNight()).toBe(false);
    expect(el.shadowRoot.querySelector('.dim-layer').style.opacity).toBe('0');
  });

  it('respects a custom sun_entity', () => {
    const el = mountCard({
      config: { sun_entity: 'sun.custom' },
      states: { 'sun.custom': haState('below_horizon') },
    });
    expect(el._handleDayNight()).toBe(true);
  });

  it('treats missing sun entity as daytime', () => {
    const el = mountCard();
    expect(el._handleDayNight()).toBe(false);
  });
});

describe('_updateMedianPill', () => {
  it('writes the home median into .median-pill with one decimal', () => {
    const el = mountCard({ config: { language: 'en' } });
    el._updateMedianPill(21.55);
    const pill = el.shadowRoot.querySelector('.median-pill');
    expect(pill.textContent).toContain('Home');
    expect(pill.textContent).toContain('21.6°C');
  });

  it('uses the translated label for Polish', () => {
    const el = mountCard({ config: { language: 'pl' } });
    el._updateMedianPill(18);
    const pill = el.shadowRoot.querySelector('.median-pill');
    expect(pill.textContent).toContain('Dom');
    expect(pill.textContent).toContain('18.0°C');
  });

  it('is a no-op when .median-pill is missing', () => {
    const el = mountCard();
    el.shadowRoot.querySelector('.median-pill')?.remove();
    expect(() => el._updateMedianPill(20)).not.toThrow();
  });
});
