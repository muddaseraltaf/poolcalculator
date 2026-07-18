// Accuracy + edge-case tests for the shock engine.
// Run with: node --experimental-strip-types --test src/lib/shock-engine.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateShock,
  poolVolumeGallons,
  PRODUCTS,
  SCENARIOS,
} from './shock-engine.ts';

// --- Reference calibration cases -------------------------------------------

test('cal-hypo 68%: ~2 oz raises FC ~1 ppm in 10,000 gal', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    currentFc: 0,
    targetFc: 1,
    productId: 'cal-hypo-68',
  });
  // Expect close to 2 oz (0.125 lb). Allow +/- 15%.
  assert.ok(r.ounces > 1.7 && r.ounces < 2.3, `got ${r.ounces} oz`);
});

test('standard 1 lb cal-hypo 73% / 10k gal ≈ 7-8 ppm bump region', () => {
  // Inverse check: raising ~7.5 ppm should need ~1 lb.
  const r = calculateShock({
    volumeGallons: 10000,
    currentFc: 0,
    targetFc: 7.5,
    productId: 'cal-hypo-73',
  });
  assert.ok(r.pounds > 0.85 && r.pounds < 1.15, `got ${r.pounds} lb`);
});

test('liquid 12.5%: ~10-11 fl oz raises FC ~1 ppm in 10,000 gal', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    currentFc: 0,
    targetFc: 1,
    productId: 'liquid-12',
  });
  assert.ok(
    r.flOunces! > 9 && r.flOunces! < 12,
    `got ${r.flOunces} fl oz`
  );
});

// --- Breakpoint chlorination logic -----------------------------------------

test('breakpoint = 10x combined chlorine and drives target', () => {
  const r = calculateShock({
    volumeGallons: 20000,
    currentFc: 2,
    totalChlorine: 2.5, // CC = 0.5
    productId: 'cal-hypo-68',
    scenario: 'weekly', // weekly target 10; breakpoint = 5 -> weekly wins
  });
  assert.equal(r.combinedChlorine, 0.5);
  assert.equal(r.breakpointFc, 5);
  assert.equal(r.targetFc, 10); // max(breakpoint 5, weekly 10)
});

test('high combined chlorine pushes target above scenario preset', () => {
  const r = calculateShock({
    volumeGallons: 20000,
    currentFc: 3,
    totalChlorine: 5, // CC = 2 -> breakpoint 20
    productId: 'cal-hypo-68',
    scenario: 'weekly', // 10, but breakpoint 20 should win
  });
  assert.equal(r.breakpointFc, 20);
  assert.equal(r.targetFc, 20);
});

// --- Scenario presets -------------------------------------------------------

test('green pool scenario targets 30 ppm', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    currentFc: 0,
    scenario: 'green',
    productId: 'cal-hypo-73',
  });
  assert.equal(r.targetFc, SCENARIOS.green.targetFc);
  assert.equal(r.deltaFc, 30);
});

// --- Edge cases -------------------------------------------------------------

test('target already met -> zero dose + warning', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    currentFc: 12,
    targetFc: 10,
    productId: 'cal-hypo-68',
  });
  assert.equal(r.deltaFc, 0);
  assert.equal(r.pounds, 0);
  assert.ok(r.warnings.some((w) => w.includes('no shock needed')));
});

test('zero volume yields zero dose (no crash)', () => {
  const r = calculateShock({
    volumeGallons: 0,
    scenario: 'green',
    productId: 'cal-hypo-68',
  });
  assert.equal(r.pounds, 0);
});

test('negative current FC is floored to 0', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    currentFc: -5,
    targetFc: 10,
    productId: 'cal-hypo-68',
  });
  assert.equal(r.deltaFc, 10);
});

test('unknown product throws', () => {
  assert.throws(() =>
    calculateShock({ volumeGallons: 10000, productId: 'nope' })
  );
});

test('saltwater-unsafe product emits calcium warning', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    scenario: 'weekly',
    productId: 'cal-hypo-68',
  });
  assert.ok(r.warnings.some((w) => w.toLowerCase().includes('calcium')));
});

test('dichlor emits CYA warning', () => {
  const r = calculateShock({
    volumeGallons: 10000,
    scenario: 'weekly',
    productId: 'dichlor-56',
  });
  assert.ok(r.warnings.some((w) => w.includes('CYA')));
});

test('dose scales linearly with volume', () => {
  const a = calculateShock({
    volumeGallons: 10000,
    currentFc: 0,
    targetFc: 10,
    productId: 'cal-hypo-68',
  });
  const b = calculateShock({
    volumeGallons: 20000,
    currentFc: 0,
    targetFc: 10,
    productId: 'cal-hypo-68',
  });
  assert.ok(Math.abs(b.pounds - 2 * a.pounds) < 1e-6);
});

test('bag and bottle counts compute when sizes provided', () => {
  const granular = calculateShock({
    volumeGallons: 30000,
    currentFc: 0,
    scenario: 'green',
    productId: 'cal-hypo-73',
    bagWeightLb: 1,
  });
  assert.ok(granular.bags && granular.bags > 0);

  const liquid = calculateShock({
    volumeGallons: 30000,
    currentFc: 0,
    scenario: 'green',
    productId: 'liquid-12',
    bottleSizeFloz: 128,
  });
  assert.ok(liquid.bottles && liquid.bottles > 0);
});

// --- Volume helper ----------------------------------------------------------

test('rectangle volume: 32x16x5 ft ≈ 19,150 gal', () => {
  const v = poolVolumeGallons('rectangle', {
    length: 32,
    width: 16,
    avgDepth: 5,
  });
  assert.ok(Math.abs(v - 19150) < 100, `got ${v}`);
});

test('round volume: 24 ft diameter x 4 ft ≈ 13,530 gal', () => {
  const v = poolVolumeGallons('round', { diameter: 24, avgDepth: 4 });
  assert.ok(Math.abs(v - 13540) < 150, `got ${v}`);
});

test('every product in library is dosable in its native unit', () => {
  for (const id of Object.keys(PRODUCTS)) {
    const r = calculateShock({
      volumeGallons: 15000,
      currentFc: 1,
      scenario: 'opening',
      productId: id,
    });
    const amount = PRODUCTS[id].form === 'granular' ? r.pounds : r.flOunces;
    assert.ok(amount !== null && amount >= 0, `${id} produced no amount`);
  }
});

test('granular reports weight not volume; liquid reports volume not weight', () => {
  const g = calculateShock({
    volumeGallons: 10000,
    scenario: 'green',
    productId: 'cal-hypo-73',
  });
  assert.ok(g.pounds !== null && g.flOunces === null);

  const l = calculateShock({
    volumeGallons: 10000,
    scenario: 'green',
    productId: 'liquid-12',
  });
  assert.ok(l.flOunces !== null && l.pounds === null);
});
