import { describe, it, expect } from 'vitest';
import { getProto } from './test-utils.js';

const proto = getProto();
const build = (rules) => proto._buildTipsTemplate(rules);

describe('_buildTipsTemplate', () => {
  it('returns a template that initializes an empty tips list', () => {
    const tpl = build([]);
    expect(tpl).toContain('{% set tips = [] %}');
  });

  it('ends with a sorted tojson expression', () => {
    const tpl = build([]);
    expect(tpl).toContain("tips | sort(attribute='priority', reverse=true) | tojson");
  });

  it('wraps each rule in its own {% if %} block', () => {
    const tpl = build([
      { id: 'a', when: 'true', text: 'hello' },
      { id: 'b', when: 'false', text: 'world' },
    ]);
    const ifCount = (tpl.match(/\{% if /g) || []).length;
    expect(ifCount).toBe(2);
    expect(tpl).toContain('{# Rule: a #}');
    expect(tpl).toContain('{# Rule: b #}');
  });

  it('embeds rule metadata', () => {
    const tpl = build([{ id: 'storm', icon: 'mdi:weather-lightning', level: 'warning', priority: 8, when: 'true', text: 'Storm incoming' }]);
    expect(tpl).toContain("'id': 'storm'");
    expect(tpl).toContain("'icon': 'mdi:weather-lightning'");
    expect(tpl).toContain("'level': 'warning'");
    expect(tpl).toContain("'priority': 8");
    // Plain text becomes a single-quoted string literal with no interpolation
    expect(tpl).toContain("'text': 'Storm incoming'");
  });

  it('defaults icon, level, priority when missing', () => {
    const tpl = build([{ id: 'x', when: 'true', text: 'bare' }]);
    expect(tpl).toContain("'icon': 'mdi:information'");
    expect(tpl).toContain("'level': 'info'");
    expect(tpl).toContain("'priority': 5");
  });

  it('escapes single quotes in plain text', () => {
    const tpl = build([{ id: 'x', when: 'true', text: "it's raining" }]);
    expect(tpl).toContain("'text': 'it\\'s raining'");
  });

  it('escapes single quotes in id, icon, and level', () => {
    const tpl = build([{ id: "x'y", icon: "mdi:'bad", level: "it's", when: 'true', text: 't' }]);
    expect(tpl).toContain("'id': 'x\\'y'");
    expect(tpl).toContain("'icon': 'mdi:\\'bad'");
    expect(tpl).toContain("'level': 'it\\'s'");
  });

  it('uses the rule.when expression verbatim when no {{ }} wrapper', () => {
    const tpl = build([{ id: 'x', when: "states('sensor.temp') | float > 30", text: 'hot' }]);
    expect(tpl).toContain("{% if states('sensor.temp') | float > 30 %}");
  });

  it('strips {{ }} wrapper from when (HA YAML convention)', () => {
    const tpl = build([{ id: 'x', when: "{{ now().hour >= 17 }}", text: 't' }]);
    expect(tpl).toContain("{% if now().hour >= 17 %}");
    // Must NOT produce the invalid nested form
    expect(tpl).not.toContain("{% if {{");
  });

  it('strips {{ }} with extra whitespace', () => {
    const tpl = build([{ id: 'x', when: "  {{ is_state('sun.sun','below_horizon') }}  ", text: 't' }]);
    expect(tpl).toContain("{% if is_state('sun.sun','below_horizon') %}");
  });

  it('does not strip {{ }} from mid-expression (only full wrappers)', () => {
    // A when like "a {{ b }} c" shouldn't be stripped — that's not a full wrapper
    const tpl = build([{ id: 'x', when: "a {{ b }} c", text: 't' }]);
    expect(tpl).toContain("{% if a {{ b }} c %}");
  });

  it('coerces non-numeric priority to integer', () => {
    const tpl = build([{ id: 'x', priority: '7', when: 'true', text: 't' }]);
    expect(tpl).toContain("'priority': 7");
  });

  it('falls back to 5 when priority is unparseable', () => {
    const tpl = build([{ id: 'x', priority: 'banana', when: 'true', text: 't' }]);
    expect(tpl).toContain("'priority': 5");
  });

  it('handles empty rules array without error', () => {
    const tpl = build([]);
    expect(tpl).toMatch(/\{% set tips = \[\] %\}\s*\n\{\{/);
  });
});

describe('_buildTipsTemplate — Jinja text interpolation', () => {
  // Regression coverage for a bug where the entire text field was wrapped in
  // literal single quotes, causing {{...}} placeholders to be treated as
  // literal strings by HA's template engine instead of being evaluated.
  // Correct behaviour: split on {{...}}, emit placeholders as parenthesised
  // expressions, quote literal chunks, and join with Jinja's ~ concat operator.

  it('text with a single placeholder becomes a ~ concatenation', () => {
    const tpl = build([{ id: 'x', when: 'true', text: "It is {{ states('sensor.temp') }} degrees" }]);
    // Should contain the three-part concat, NOT the raw {{...}} wrapped in quotes
    expect(tpl).toContain("'text': 'It is ' ~ (states('sensor.temp')) ~ ' degrees'");
    // Ensure the buggy old form does NOT appear
    expect(tpl).not.toContain("'text': 'It is {{");
  });

  it('text that is ONLY a placeholder renders as a bare expression', () => {
    const tpl = build([{ id: 'x', when: 'true', text: '{{ now().hour }}' }]);
    expect(tpl).toContain("'text': (now().hour)");
  });

  it('text with multiple placeholders emits all of them', () => {
    const tpl = build([{
      id: 'x',
      when: 'true',
      text: "{{ a }} and {{ b }} and {{ c }}",
    }]);
    expect(tpl).toContain("'text': (a) ~ ' and ' ~ (b) ~ ' and ' ~ (c)");
  });

  it('placeholder with single quotes inside is emitted verbatim (not escaped)', () => {
    // Apostrophes inside the placeholder belong to the Jinja expression
    // (e.g. states('sensor.x')) and must NOT be escaped.
    const tpl = build([{
      id: 'x',
      when: 'true',
      text: "Temp: {{ states('sensor.indoor') }}",
    }]);
    expect(tpl).toContain("(states('sensor.indoor'))");
    // The unescaped apostrophes in states('sensor.indoor') must survive
    expect(tpl).not.toContain("states(\\'sensor.indoor\\')");
  });

  it('literal chunk containing an apostrophe next to a placeholder is escaped correctly', () => {
    const tpl = build([{
      id: 'x',
      when: 'true',
      text: "it's {{ temp }} outside",
    }]);
    // The literal "it's " retains its escape; the placeholder stays unquoted
    expect(tpl).toContain("'it\\'s ' ~ (temp) ~ ' outside'");
  });

  it('text containing a Jinja function call with arguments works', () => {
    const tpl = build([{
      id: 'x',
      when: 'true',
      text: "AQI is {{ states('sensor.aqi') | int(0) }}",
    }]);
    expect(tpl).toContain("'AQI is ' ~ (states('sensor.aqi') | int(0))");
  });

  it('empty text defaults to empty string literal', () => {
    const tpl = build([{ id: 'x', when: 'true', text: '' }]);
    expect(tpl).toContain("'text': ''");
  });

  it('missing text field defaults to empty string literal', () => {
    const tpl = build([{ id: 'x', when: 'true' }]);
    expect(tpl).toContain("'text': ''");
  });

  it('strips leading/trailing whitespace inside {{ }}', () => {
    // {{ states('x') }} and {{states('x')}} should both produce (states('x'))
    const tpl1 = build([{ id: 'a', when: 'true', text: '{{ foo }}' }]);
    const tpl2 = build([{ id: 'a', when: 'true', text: '{{foo}}' }]);
    expect(tpl1).toContain("'text': (foo)");
    expect(tpl2).toContain("'text': (foo)");
  });

  it('placeholder at the start of the text', () => {
    const tpl = build([{ id: 'x', when: 'true', text: '{{ v }} units' }]);
    expect(tpl).toContain("'text': (v) ~ ' units'");
  });

  it('placeholder at the end of the text', () => {
    const tpl = build([{ id: 'x', when: 'true', text: 'Value: {{ v }}' }]);
    expect(tpl).toContain("'text': 'Value: ' ~ (v)");
  });

  it('does NOT wrap the whole text field in literal quotes (regression)', () => {
    // The exact buggy shape: 'text': '...{{...}}...' — should never appear
    const tpl = build([{ id: 'x', when: 'true', text: 'x {{ y }} z' }]);
    expect(tpl).not.toMatch(/'text':\s*'[^']*\{\{[^']*\}\}[^']*'/);
  });
});
