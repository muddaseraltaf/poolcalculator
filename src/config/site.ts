// Central site configuration — single source of truth for brand + SEO defaults.
export const SITE = {
  name: 'Pool Shock Calculator',
  shortName: 'PoolShockCalculator',
  domain: 'www.poolshockcalculator.com',
  url: 'https://www.poolshockcalculator.com',
  tagline: 'Know exactly how much shock your pool needs.',
  description:
    'Free pool shock calculator. Enter your pool volume, current chlorine, and shock product to get the exact dose in pounds, ounces, cups, and bags — with breakpoint chlorination and wait time.',
  email: 'hello@poolshockcalculator.com',
  locale: 'en_US',
  lang: 'en',
  // Brand-authored E-E-A-T: no invented person. Methodology + cited sources instead.
  publisher: 'The Pool Shock Calculator Team',
  // Data currency shown on tool pages; bump only on a meaningful update.
  dataUpdated: '2026-07-18',
} as const;

export const NAV = [
  { label: 'Calculator', href: '/' },
  { label: 'Green Pool', href: '/green-pool/' },
  { label: 'Cloudy Water', href: '/cloudy-pool/' },
  { label: 'Pool Opening', href: '/pool-opening/' },
  { label: 'Hot Tub', href: '/hot-tub-spa/' },
  { label: 'Methodology', href: '/methodology/' },
] as const;

export const FOOTER_LINKS = [
  { label: 'About', href: '/about/' },
  { label: 'Methodology', href: '/methodology/' },
  { label: 'Contact', href: '/contact/' },
  { label: 'Privacy', href: '/privacy/' },
  { label: 'Terms', href: '/terms/' },
] as const;
