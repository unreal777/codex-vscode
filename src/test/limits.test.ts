// 0.14.1: messages at 80% and 90% of a Codex limit window (core/limits.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { limitAlerts, LimitFired, windowName } from '../core/limits';

const snap = (used: number, mins = 10080, limitId = 'codex') => ({ limitId, primary: { usedPercent: used, windowDurationMins: mins, resetsAt: 1 }, secondary: null });

test('80 fires once, 90 fires once, nothing between or after', () => {
  let fired: LimitFired = {};
  let r = limitAlerts(snap(79), fired); fired = r.fired;
  assert.deepEqual(r.alerts, []);
  r = limitAlerts(snap(80), fired); fired = r.fired;
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].level, 80);
  assert.equal(r.alerts[0].text, 'Codex limit: 80% of the weekly window used.');
  r = limitAlerts(snap(85), fired); fired = r.fired;
  assert.deepEqual(r.alerts, [], 'no second 80');
  r = limitAlerts(snap(90), fired); fired = r.fired;
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].level, 90);
  r = limitAlerts(snap(97), fired);
  assert.deepEqual(r.alerts, [], 'no second 90');
});

test('a jump from under 80 to 95 sends only the 90 message, and 80 is then counted as sent', () => {
  const r = limitAlerts(snap(95), {});
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].level, 90);
  assert.deepEqual(r.fired['codex|10080'], [80, 90]);
});

test('after a reset (usage falls below a level) that level can fire again', () => {
  let fired: LimitFired = limitAlerts(snap(92), {}).fired;
  fired = limitAlerts(snap(3), fired).fired;
  assert.deepEqual(fired['codex|10080'], []);
  assert.equal(limitAlerts(snap(81), fired).alerts[0].level, 80);
});

test('the primary and secondary windows are counted apart, and so are two limits', () => {
  const both = { limitId: 'codex', primary: { usedPercent: 81, windowDurationMins: 300 }, secondary: { usedPercent: 50, windowDurationMins: 10080 } };
  const r = limitAlerts(both, {});
  assert.equal(r.alerts.length, 1);
  assert.equal(r.alerts[0].text, 'Codex limit: 81% of the 5h window used.');
  const other = limitAlerts(snap(81, 10080, 'codex_other'), r.fired);
  assert.equal(other.alerts.length, 1, 'another limit id has its own memory');
});

test('no snapshot, a missing window or a missing usage: nothing happens', () => {
  assert.deepEqual(limitAlerts(null, {}).alerts, []);
  assert.deepEqual(limitAlerts({ primary: null, secondary: null }, {}).alerts, []);
  assert.deepEqual(limitAlerts({ primary: { usedPercent: NaN as unknown as number } }, {}).alerts, []);
});

test('the number is capped to 0..100 and the memory keeps at most 20 windows', () => {
  assert.equal(limitAlerts(snap(140), {}).alerts[0].text, 'Codex limit: 100% of the weekly window used.');
  let fired: LimitFired = {};
  for (let i = 0; i < 25; i++) fired = limitAlerts(snap(85, 60 * (i + 1)), fired).fired;
  assert.equal(Object.keys(fired).length, 20);
});

test('windowName: hours, days, weekly', () => {
  assert.equal(windowName(300), '5h window');
  assert.equal(windowName(10080), 'weekly window');
  assert.equal(windowName(2880), '2d window');
  assert.equal(windowName(null), 'usage');
});
