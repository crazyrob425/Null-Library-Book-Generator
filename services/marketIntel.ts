/**
 * marketIntel.ts — October 2026 KDP market intelligence.
 *
 * Researched constants grounding the app's market reports, pricing advice,
 * and genre targeting. Source: deep-research dossier, Oct 17 2026
 * (~/workspace/research_notes/book-packaging-marketing-playbook-20261017-1506/).
 *
 * RE-VERIFY before acting on: KDP category-limit policy (sources conflict),
 * permafree price-matching behavior, KU per-page rate (moves quarterly).
 */

// ── KDP royalty mechanics (Amazon.com) ──────────────────────────────────────
export const KDP_ROYALTY = {
  /** 70% tier band. Widened 2026-07-07 (first change since 2007). */
  tier70: { min: 2.99, max: 12.99, effectiveDate: '2026-07-07', previousMax: 9.99 },
  /** 35% tier: everything outside the 70% band. No delivery fee. */
  tier35: { rate: 0.35 },
  /** Delivery fee applies at 70% only, deducted BEFORE the royalty %. */
  deliveryFeePerMb: 0.15,
  /** Paperback royalty cliff (eff. 2025-06-10). */
  paperback: { below999: 0.5, atOrAbove999: 0.6, cliff: 9.99 },
  /** 70% ebook must be priced ≥20% below its print edition. */
} as const;

/** Kindle Unlimited: pays per page read; KDP Select = 90-day exclusivity + 5 promo days. */
export const KINDLE_UNLIMITED = {
  pageRateLow: 0.004,
  pageRateHigh: 0.005,
  note: 'Rate moves quarterly; Q2 2026 hit a five-year low (~$0.0042), Sep 2026 ~$0.0054.',
} as const;

// ── Ranked genre opportunity lanes (new pen name, 2026) ─────────────────────
export interface GenreLane {
  id: string;
  name: string;
  tropes: string[];
  pov: string;
  heat: 'sweet' | 'sweet-to-moderate' | 'explicit';
  wordCount: [number, number];
  price: number;
  distribution: 'KU' | 'wide';
  reasoning: string;
}

export const GENRE_LANES: GenreLane[] = [
  {
    id: 'dark-romantasy',
    name: 'Dark Romantasy',
    tropes: ['enemies-to-lovers', 'morally gray MMC', 'forced proximity', 'fated mates'],
    pov: 'dual first-person',
    heat: 'explicit',
    wordCount: [95000, 110000],
    price: 4.99,
    distribution: 'KU',
    reasoning:
      '#1 growth pocket: romantasy + dark romance both surging; 18–35 female BookTok engine; ' +
      'length maximizes KU page-read revenue; $4.99 hits 70% royalty at genre-normal pricing.',
  },
  {
    id: 'small-town-contemporary',
    name: 'Small-Town Contemporary Romance',
    tropes: ['single dad', 'found family', 'second chance'],
    pov: 'dual POV',
    heat: 'sweet-to-moderate',
    wordCount: [70000, 85000],
    price: 3.99,
    distribution: 'KU',
    reasoning:
      'Evergreen demand, lower competition than dark romantasy, fastest to produce, series-friendly.',
  },
  {
    id: 'cozy-fantasy',
    name: 'Cozy Fantasy',
    tropes: ['low-stakes', 'warm community', 'gentle romance'],
    pov: 'third-person limited',
    heat: 'sweet',
    wordCount: [80000, 95000],
    price: 4.99,
    distribution: 'KU',
    reasoning:
      'Emerging 2025–26 trend, less saturated than romantasy, cross-sells to fantasy + romance readers.',
  },
  {
    id: 'cozy-mystery',
    name: 'Cozy Mystery Series',
    tropes: ['amateur sleuth', 'hobby', 'pet sidekick'],
    pov: 'first-person',
    heat: 'sweet',
    wordCount: [60000, 70000],
    price: 3.99,
    distribution: 'wide',
    reasoning:
      'Fast production cadence, loyal series readers; wide works well (library/Kobo promos); low content-policy risk.',
  },
  {
    id: 'psychological-thriller',
    name: 'Psychological Thriller',
    tropes: ['suburban secrets', 'unreliable narrator'],
    pov: 'first-person',
    heat: 'sweet',
    wordCount: [80000, 90000],
    price: 4.99,
    distribution: 'KU',
    reasoning:
      'Largest print-unit category, strong KU readership; thinner trope competition than romance.',
  },
];

/** Match a free-text genre to the closest lane (case-insensitive substring). */
export function getLaneForGenre(genre: string): GenreLane | undefined {
  const g = genre.toLowerCase();
  return (
    GENRE_LANES.find((l) => g.includes(l.id.replace(/-/g, ' '))) ??
    GENRE_LANES.find((l) => l.name.toLowerCase().split(' ').some((w) => g.includes(w) && w.length > 4))
  );
}

// ── Series pricing ladder ───────────────────────────────────────────────────
export const SERIES_PRICING_LADDER = {
  book1: 'Loss leader: $0.99 or permafree',
  book2Plus: '$3.99–$5.99',
  boxSet: '$9.99',
  permafreeWarning:
    'FRAGILE: Sep 2026 price-match wave flipped 26/37 permafree titles back to paid. ' +
    'Amazon "may" price-match is discretionary — do not build a launch plan that depends on it.',
} as const;

// ── Packaging rules of thumb ────────────────────────────────────────────────
export const PACKAGING_RULES = {
  cover: 'Thumbnail-first: legible at 100×150px; title > author > taglines; ≤3 fonts; match top-20 genre covers.',
  blurb:
    '150–200 words; hook + tension + stakes in the first ~400 chars (mobile fold); ' +
    'trope bullets + comp titles + CTA.',
  categories: '3 per format; 7 keyword slots × 50 chars; never repeat words across slots or from the title.',
  title: 'Title+subtitle ≤199 chars on KDP; fiction rarely needs a subtitle (series "Book 1 of X" excepted).',
} as const;

// ── KDP AI disclosure (load-bearing compliance) ─────────────────────────────
export const AI_DISCLOSURE_POLICY = {
  rule:
    'AI-GENERATED text, images, or translations (including covers, even after heavy editing) ' +
    'MUST be disclosed via KDP\'s private AI-content checkbox. AI-ASSISTED content needs no disclosure.',
  consequence: 'Undisclosed AI-generated content = title removal; repeat offenses = account suspension.',
  hardBans: ['plagiarism', 'keyword stuffing', 'wrong categories', 'bonus-content stuffing', 'incentivized reviews'],
} as const;

// ── Grounding block injected into market-report prompts ─────────────────────
export const MARKET_INTEL_GROUNDING = `
**Current KDP market facts (Oct 2026 — treat as authoritative):**
- 70% ebook royalty band: $2.99–$12.99 (widened 2026-07-07; first change since 2007). 35% outside it. $0.15/MB delivery fee at 70%.
- Paperback royalty: 50% below $9.99, 60% at $9.99+ (cliff since 2025-06-10).
- Kindle Unlimited pays ~$0.004–$0.005 per page read; KDP Select = 90-day exclusivity.
- Romance ≈ $1.44B/yr, 40–57% of self-pub Kindle sales; romantasy (romance+fantasy) ≈ 48% of self-pub ebook sales. Readers: ~84% women, >50% aged 18–44, concentrated on BookTok/Bookstagram/Goodreads.
- Ranked 2026 pen-name lanes: (1) Dark romantasy — enemies-to-lovers + morally gray MMC, dual 1st-person, explicit, 95–110k, KU $4.99. (2) Small-town contemporary — single dad + found family + second chance, dual POV, sweet-to-moderate, 70–85k, KU $3.99. (3) Cozy fantasy — low-stakes + community + gentle romance, 80–95k, KU $4.99. (4) Cozy mystery series — amateur sleuth + hobby + pet, 60–70k, wide $3.99–$4.99. (5) Psychological thriller — suburban secrets + unreliable narrator, 80–90k, KU $4.99.
- Series pricing ladder: book 1 at $0.99/permafree (permafree is fragile — Sep 2026 price-match wave), books 2+ at $3.99–$5.99, box set $9.99.
- Packaging: thumbnail-first covers (legible at 100×150), blurbs 150–200 words with hook in first ~400 chars, 3 categories + 7 keyword slots (≤50 chars, no repeated words).
- Bestseller rank = sales velocity relative to category (hourly); reviews do NOT directly move rank.
- AI-generated text/images/covers MUST be disclosed via KDP's private AI checkbox (even after heavy editing); AI-assisted needs none; undisclosed = title removal, repeat = suspension.
`;
