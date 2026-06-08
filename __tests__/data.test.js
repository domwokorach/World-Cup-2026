const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadWC2026() {
  const code = fs.readFileSync(path.resolve(__dirname, '../js/data.js'), 'utf8');
  const script = new vm.Script(code + '\nWC2026;');
  const sandbox = { console, Date, setTimeout };
  vm.createContext(sandbox);
  return script.runInContext(sandbox);
}

test('data.js exports WC2026 with fixtures', () => {
  const WC2026 = loadWC2026();
  expect(WC2026).toBeDefined();
  expect(Array.isArray(WC2026.FIXTURES)).toBe(true);
  expect(WC2026.FIXTURES.length).toBeGreaterThan(0);
});

test('setTimezone updates timezone', () => {
  const WC2026 = loadWC2026();
  const orig = WC2026.getTimezone();
  WC2026.setTimezone('utc');
  expect(WC2026.getTimezone().id).toBe('utc');
  WC2026.setTimezone(orig.id);
});
