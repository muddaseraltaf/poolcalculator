// ============================================================================
// POOL SHOCK CALCULATION ENGINE  (single source of truth for all pages)
// ----------------------------------------------------------------------------
// All dosing math lives here so every page is provably consistent and testable.
//
// Core relationship (US units):
//   To raise Free Chlorine (FC) by 1 ppm in 10,000 US gallons you need roughly
//   0.013 lb of *pure* available chlorine (derivation: 1 ppm = 1 mg/L; 10,000
//   gal = 37,854 L; 37,854 mg = 0.0834 lb of pure Cl... but pool convention and
//   manufacturer labels calibrate to ~0.013 lb pure-equivalent per ppm per 10k
//   because "available chlorine" is measured as active oxidizing capacity).
//   Product weight = pure-equivalent / (product % available chlorine).
//
// We calibrate against the widely published reference points that competitors
// and manufacturers use, and cover those with unit tests:
//   - Cal-hypo 68%: ~2 oz raises FC ~1 ppm in 10,000 gal.
//   - Cal-hypo 73%: ~1 lb raises FC ~7-8 ppm in 10,000 gal (standard "1 lb/10k
//     shock" ≈ 7.5 ppm bump).
//   - Liquid chlorine 12.5%: ~10.7 fl oz raises FC ~1 ppm in 10,000 gal.
// ============================================================================

export type ProductForm = 'granular' | 'liquid';

export interface ShockProduct {
  id: string;
  label: string;
  form: ProductForm;
  /** Fraction 0-1 of available chlorine (trade %). */
  availableChlorine: number;
  saltwaterSafe: boolean;
  /** Adds cyanuric acid (stabilizer) to the water over time. */
  addsCya: boolean;
  /** Adds calcium hardness to the water. */
  addsCalcium: boolean;
  notes: string;
}

// Product library. Percentages are the common retail concentrations.
export const PRODUCTS: Record<string, ShockProduct> = {
  'cal-hypo-68': {
    id: 'cal-hypo-68',
    label: 'Cal-Hypo granular (68%)',
    form: 'granular',
    availableChlorine: 0.68,
    saltwaterSafe: false,
    addsCya: false,
    addsCalcium: true,
    notes: 'Fast, powerful, unstabilized. Adds calcium hardness. Pre-dissolve for vinyl/fiberglass to avoid bleaching.',
  },
  'cal-hypo-73': {
    id: 'cal-hypo-73',
    label: 'Cal-Hypo granular (73%)',
    form: 'granular',
    availableChlorine: 0.73,
    saltwaterSafe: false,
    addsCya: false,
    addsCalcium: true,
    notes: 'Strongest common cal-hypo. Great for algae and openings. Adds calcium.',
  },
  'dichlor-56': {
    id: 'dichlor-56',
    label: 'Dichlor granular (56%)',
    form: 'granular',
    availableChlorine: 0.56,
    saltwaterSafe: true,
    addsCya: true,
    addsCalcium: false,
    notes: 'Stabilized (adds CYA). Dissolves fast, near pH-neutral. Good for spas, but watch CYA buildup.',
  },
  'dichlor-62': {
    id: 'dichlor-62',
    label: 'Dichlor granular (62%)',
    form: 'granular',
    availableChlorine: 0.62,
    saltwaterSafe: true,
    addsCya: true,
    addsCalcium: false,
    notes: 'Higher-strength stabilized granular. Adds CYA with every dose.',
  },
  'liquid-10': {
    id: 'liquid-10',
    label: 'Liquid chlorine (10%)',
    form: 'liquid',
    availableChlorine: 0.10,
    saltwaterSafe: true,
    addsCya: false,
    addsCalcium: false,
    notes: 'No calcium, no CYA. Ideal for saltwater and high-CYA pools. Loses strength with age/heat.',
  },
  'liquid-12': {
    id: 'liquid-12',
    label: 'Liquid chlorine (12.5%)',
    form: 'liquid',
    availableChlorine: 0.125,
    saltwaterSafe: true,
    addsCya: false,
    addsCalcium: false,
    notes: 'Standard pool-grade strength. No calcium or CYA added. Use fresh stock.',
  },
  'bleach-6': {
    id: 'bleach-6',
    label: 'Household bleach (6%)',
    form: 'liquid',
    availableChlorine: 0.06,
    saltwaterSafe: true,
    addsCya: false,
    addsCalcium: false,
    notes: 'Unscented plain bleach only. Weak vs pool chlorine, so volumes are large. Fine in a pinch.',
  },
};

export const SCENARIOS = {
  weekly: { id: 'weekly', label: 'Weekly maintenance', targetFc: 10 },
  opening: { id: 'opening', label: 'Opening the pool', targetFc: 15 },
  cloudy: { id: 'cloudy', label: 'Cloudy water', targetFc: 20 },
  green: { id: 'green', label: 'Green / algae', targetFc: 30 },
  storm: { id: 'storm', label: 'After a storm', targetFc: 20 },
  party: { id: 'party', label: 'After heavy use / party', targetFc: 15 },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;

// --- Physical constants -----------------------------------------------------
// Pure available chlorine (lb) to raise FC by 1 ppm per 1 gallon.
// Calibrated so cal-hypo 68% needs ~2 oz / ppm / 10,000 gal (0.125 lb).
//   0.125 lb product * 0.68 = 0.085 lb pure per ppm per 10k gal
//   => per gallon: 0.085 / 10000 = 8.5e-6 lb pure /ppm/gal
const LB_PURE_PER_PPM_PER_GAL = 8.5e-6;

const OZ_PER_LB = 16;
const FLOZ_PER_GAL = 128;
// Liquid calibration: fl oz of product per ppm FC per gallon, at 100% strength.
// Solve so 12.5% liquid -> 10.7 fl oz per ppm per 10,000 gal:
//   10.7 = C * 1 * 10000 / 0.125  =>  C = 10.7 * 0.125 / 10000 = 1.3375e-4
const LIQUID_FLOZ_CONST = 1.3375e-4;
// Bulk density: granular pool shock ≈ 0.85 g/mL ≈ 7.1 lb per dry gallon.
// 1 US cup = 8 fl oz; a cup of granular shock ≈ 7.1 lb / 16 cups/gal ≈ 0.44 lb.
const LB_PER_CUP_GRANULAR = 0.44;

export interface ShockInput {
  volumeGallons: number;
  currentFc?: number; // measured free chlorine ppm (optional)
  totalChlorine?: number; // measured total chlorine ppm (optional, for breakpoint)
  targetFc?: number; // explicit target; else derived from scenario
  scenario?: ScenarioId;
  productId: string;
  bagWeightLb?: number; // for bag-count output (granular)
  bottleSizeFloz?: number; // for bottle-count output (liquid)
}

export interface ShockResult {
  productLabel: string;
  targetFc: number;
  deltaFc: number; // ppm we are actually raising
  breakpointFc: number | null; // 10x combined chlorine, if measurable
  combinedChlorine: number | null;
  // Amounts (granular reports weight; liquid reports volume)
  pounds: number | null; // granular only
  ounces: number | null; // granular only
  cups: number | null; // granular only
  flOunces: number | null; // liquid only
  gallons: number | null; // liquid only
  bags: number | null;
  bottles: number | null;
  warnings: string[];
  waitToSwim: string;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function calculateShock(input: ShockInput): ShockResult {
  const product = PRODUCTS[input.productId];
  if (!product) throw new Error(`Unknown product: ${input.productId}`);

  const warnings: string[] = [];
  const volume = Math.max(0, input.volumeGallons || 0);

  // Determine combined chlorine + breakpoint target when we have both readings.
  let combinedChlorine: number | null = null;
  let breakpointFc: number | null = null;
  if (
    typeof input.totalChlorine === 'number' &&
    typeof input.currentFc === 'number' &&
    input.totalChlorine >= input.currentFc
  ) {
    combinedChlorine = round(input.totalChlorine - input.currentFc, 2);
    breakpointFc = round(combinedChlorine * 10, 1); // 10x rule
  }

  // Resolve the target FC: explicit > breakpoint > scenario preset > weekly.
  const scenarioTarget = input.scenario
    ? SCENARIOS[input.scenario].targetFc
    : SCENARIOS.weekly.targetFc;
  let targetFc =
    input.targetFc ?? Math.max(breakpointFc ?? 0, scenarioTarget);

  const currentFc = Math.max(0, input.currentFc ?? 0);
  let deltaFc = Math.max(0, targetFc - currentFc);

  if (deltaFc === 0) {
    warnings.push(
      'Your current free chlorine already meets the target — no shock needed right now.'
    );
  }

  // Product-specific warnings.
  if (!product.saltwaterSafe) {
    warnings.push(
      `${product.label} adds calcium and is not ideal for saltwater pools or for repeated use where calcium hardness is already high.`
    );
  }
  if (product.addsCya) {
    warnings.push(
      'This product is stabilized and raises cyanuric acid (CYA) with every dose — avoid for frequent shocking to prevent CYA lock.'
    );
  }

  // Dose math. Granular is dosed by weight, liquid by volume, so each form is
  // calibrated to its own published reference point rather than a shared base.
  let pounds: number | null = null;
  let ounces: number | null = null;
  let cups: number | null = null;
  let flOunces: number | null = null;
  let gallons: number | null = null;
  let bags: number | null = null;
  let bottles: number | null = null;

  if (product.form === 'granular') {
    // Pure available chlorine needed, converted to product weight by its %.
    const pureLb = LB_PURE_PER_PPM_PER_GAL * deltaFc * volume;
    const productLb = product.availableChlorine
      ? pureLb / product.availableChlorine
      : 0;
    pounds = round(productLb, 3);
    ounces = round(productLb * OZ_PER_LB, 1);
    cups = round(productLb / LB_PER_CUP_GRANULAR, 1);
    if (input.bagWeightLb && input.bagWeightLb > 0) {
      bags = round(productLb / input.bagWeightLb, 2);
    }
  } else {
    // Liquid dosed by volume. Calibrated so 12.5% needs ~10.7 fl oz per ppm per
    // 10,000 gal; volume scales inversely with concentration.
    const floz =
      product.availableChlorine > 0
        ? (LIQUID_FLOZ_CONST * deltaFc * volume) / product.availableChlorine
        : 0;
    flOunces = round(floz, 1);
    gallons = round(floz / FLOZ_PER_GAL, 3);
    if (input.bottleSizeFloz && input.bottleSizeFloz > 0) {
      bottles = round(floz / input.bottleSizeFloz, 2);
    }
  }

  // Wait-to-swim guidance keyed off target FC.
  let waitToSwim: string;
  if (targetFc >= 20) {
    waitToSwim =
      'Wait until free chlorine falls back to 1–5 ppm before swimming — often 24 hours or more for a high shock.';
  } else if (targetFc >= 10) {
    waitToSwim =
      'Wait until free chlorine drops to 1–5 ppm — typically 8–24 hours. Re-test before swimming.';
  } else {
    waitToSwim =
      'Wait until free chlorine is back at 1–5 ppm before swimming. Always re-test first.';
  }

  return {
    productLabel: product.label,
    targetFc: round(targetFc, 1),
    deltaFc: round(deltaFc, 1),
    breakpointFc,
    combinedChlorine,
    pounds,
    ounces,
    cups,
    flOunces,
    gallons,
    bags,
    bottles,
    warnings,
    waitToSwim,
  };
}

// Volume helpers -------------------------------------------------------------
export type PoolShape = 'rectangle' | 'round' | 'oval';

export function poolVolumeGallons(
  shape: PoolShape,
  dims: { length?: number; width?: number; diameter?: number; avgDepth: number }
): number {
  const { length = 0, width = 0, diameter = 0, avgDepth } = dims;
  let cubicFeet = 0;
  if (shape === 'rectangle') cubicFeet = length * width * avgDepth;
  else if (shape === 'round')
    cubicFeet = Math.PI * (diameter / 2) ** 2 * avgDepth;
  else if (shape === 'oval')
    cubicFeet = Math.PI * (length / 2) * (width / 2) * avgDepth;
  return round(cubicFeet * 7.48052, 0); // 7.48 gal per cubic foot
}
