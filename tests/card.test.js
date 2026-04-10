import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CARD_PATH = resolve(__dirname, '..', 'fork_u-house_card.js');
const HACS_PATH = resolve(__dirname, '..', 'hacs.json');

beforeAll(async () => {
  // The card is a plain script (not a module) that calls customElements.define
  // at load time. Evaluate it once into the jsdom global scope.
  const src = readFileSync(CARD_PATH, 'utf8');
  // eslint-disable-next-line no-new-func
  new Function(src).call(globalThis);
});

describe('custom element registration', () => {
  it('registers <fork-u-house-card>', () => {
    expect(customElements.get('fork-u-house-card')).toBeTypeOf('function');
  });

  it('can be constructed without throwing', () => {
    const el = document.createElement('fork-u-house-card');
    expect(el).toBeInstanceOf(HTMLElement);
    expect(el.shadowRoot).not.toBeNull();
  });
});

describe('getStubConfig', () => {
  it('returns an object with required fields', () => {
    const Ctor = customElements.get('fork-u-house-card');
    const stub = Ctor.getStubConfig();
    expect(stub).toBeTypeOf('object');
    expect(stub.weather_entity).toBeTypeOf('string');
    expect(Array.isArray(stub.rooms)).toBe(true);
    expect(stub.rooms.length).toBeGreaterThan(0);
  });
});

describe('setConfig', () => {
  it('accepts the stub config', () => {
    const el = document.createElement('fork-u-house-card');
    const Ctor = customElements.get('fork-u-house-card');
    expect(() => el.setConfig(Ctor.getStubConfig())).not.toThrow();
  });

  it('throws when rooms is missing', () => {
    const el = document.createElement('fork-u-house-card');
    expect(() => el.setConfig({})).toThrow(/rooms/);
  });

  it('throws when rooms is not an array', () => {
    const el = document.createElement('fork-u-house-card');
    expect(() => el.setConfig({ rooms: 'nope' })).toThrow(/rooms/);
  });
});

describe('hacs.json', () => {
  const hacs = JSON.parse(readFileSync(HACS_PATH, 'utf8'));

  it('has a semver version field', () => {
    expect(hacs.version).toBeTypeOf('string');
    expect(hacs.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares the card filename that actually exists', () => {
    expect(hacs.filename).toBe('fork_u-house_card.js');
  });
});
