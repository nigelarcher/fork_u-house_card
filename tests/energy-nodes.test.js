import { describe, it, expect } from 'vitest';
import { getProto } from './test-utils.js';

const proto = getProto();
const resolve = (cfg, prefs) => proto._resolveEnergyNodes(cfg, prefs);

// Minimal HA energy prefs fixtures
const solarSource = { type: 'solar', stat_energy_from: 'sensor.solar_power' };
const gridSource = {
  type: 'grid',
  stat_energy_from: 'sensor.grid_import',
  power_config: { stat_rate_from: 'sensor.grid_power' },
};
const batterySource = {
  type: 'battery',
  stat_energy_from: 'sensor.battery_power',
};

describe('_resolveEnergyNodes — manual only', () => {
  it('returns manual nodes unchanged when auto is off', () => {
    const cfg = { nodes: [{ entity: 'sensor.a', direction: 'source' }] };
    expect(resolve(cfg, null)).toEqual(cfg.nodes);
  });

  it('returns manual nodes when prefs is null even with auto on', () => {
    const cfg = { auto: true, nodes: [{ entity: 'sensor.a', direction: 'source' }] };
    expect(resolve(cfg, null)).toEqual(cfg.nodes);
  });

  it('returns empty array when no manual nodes and no prefs', () => {
    expect(resolve({}, null)).toEqual([]);
  });
});

describe('_resolveEnergyNodes — auto source discovery', () => {
  it('discovers a solar source', () => {
    const cfg = { auto: true };
    const prefs = { energy_sources: [solarSource] };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].entity).toBe('sensor.solar_power');
    expect(nodes[0].direction).toBe('source');
  });

  it('discovers a grid source (import only)', () => {
    const cfg = { auto: true };
    const prefs = { energy_sources: [gridSource] };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].entity).toBe('sensor.grid_power');
    expect(nodes[0].direction).toBe('source');
  });

  it('discovers a battery source', () => {
    const cfg = { auto: true };
    const prefs = { energy_sources: [batterySource] };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].entity).toBe('sensor.battery_power');
  });

  it('discovers all three source types at once', () => {
    const cfg = { auto_sources: true };
    const prefs = { energy_sources: [solarSource, gridSource, batterySource] };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(3);
    expect(nodes.map(n => n.entity).sort()).toEqual([
      'sensor.battery_power',
      'sensor.grid_power',
      'sensor.solar_power',
    ]);
  });

  it('applies default icon and color to discovered solar source', () => {
    const nodes = resolve({ auto: true }, { energy_sources: [solarSource] });
    expect(nodes[0].icon).toBe('mdi:solar-power');
    expect(nodes[0].color).toBe('#FBBF24');
  });

  it('respects custom node_positions override', () => {
    const cfg = {
      auto: true,
      node_positions: { solar: { x: 99, y: 99, icon: 'mdi:custom' } },
    };
    const nodes = resolve(cfg, { energy_sources: [solarSource] });
    expect(nodes[0].x).toBe(99);
    expect(nodes[0].y).toBe(99);
    expect(nodes[0].icon).toBe('mdi:custom');
  });
});

describe('_resolveEnergyNodes — manual vs auto priority', () => {
  it('manual node with matching entity suppresses auto discovery', () => {
    const cfg = {
      auto: true,
      nodes: [{ entity: 'sensor.solar_power', direction: 'source', x: 10, y: 10 }],
    };
    const nodes = resolve(cfg, { energy_sources: [solarSource] });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].x).toBe(10);
  });

  it('manual node with "replaces" suppresses auto discovery of that type', () => {
    const cfg = {
      auto: true,
      nodes: [{ entity: 'sensor.custom_solar', replaces: 'solar', direction: 'source' }],
    };
    const nodes = resolve(cfg, { energy_sources: [solarSource] });
    expect(nodes).toHaveLength(1);
    expect(nodes[0].entity).toBe('sensor.custom_solar');
  });

  it('manual and auto coexist for different types', () => {
    const cfg = {
      auto: true,
      nodes: [{ entity: 'sensor.custom', replaces: 'grid', direction: 'source' }],
    };
    const nodes = resolve(cfg, { energy_sources: [solarSource, gridSource] });
    expect(nodes).toHaveLength(2);
    const entities = nodes.map(n => n.entity).sort();
    expect(entities).toEqual(['sensor.custom', 'sensor.solar_power']);
  });
});

describe('_resolveEnergyNodes — auto consumer discovery', () => {
  it('discovers device consumers', () => {
    const cfg = { auto_consumers: true };
    const prefs = {
      energy_sources: [],
      device_consumption: [
        { stat_consumption: 'sensor.dishwasher', name: 'Dishwasher' },
        { stat_consumption: 'sensor.dryer', name: 'Dryer' },
      ],
    };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(2);
    expect(nodes.every(n => n.direction === 'consumer')).toBe(true);
    expect(nodes[0].name).toBe('Dishwasher');
  });

  it('skips consumers already configured manually by entity', () => {
    const cfg = {
      auto_consumers: true,
      nodes: [{ entity: 'sensor.dishwasher', direction: 'consumer' }],
    };
    const prefs = {
      energy_sources: [],
      device_consumption: [{ stat_consumption: 'sensor.dishwasher', name: 'Dishwasher' }],
    };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(1);
  });

  it('auto_consumers: false skips consumer discovery', () => {
    const cfg = { auto_sources: true, auto_consumers: false };
    const prefs = {
      energy_sources: [solarSource],
      device_consumption: [{ stat_consumption: 'sensor.dw', name: 'DW' }],
    };
    const nodes = resolve(cfg, prefs);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].direction).toBe('source');
  });

  it('applies custom consumer_positions by entity', () => {
    const cfg = {
      auto_consumers: true,
      consumer_positions: { 'sensor.dw': { x: 77, y: 77 } },
    };
    const prefs = {
      energy_sources: [],
      device_consumption: [{ stat_consumption: 'sensor.dw', name: 'DW' }],
    };
    const nodes = resolve(cfg, prefs);
    expect(nodes[0].x).toBe(77);
    expect(nodes[0].y).toBe(77);
  });
});
