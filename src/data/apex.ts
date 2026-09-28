/**
 * APEX AutoCare — central business configuration.
 *
 * Every price, duration, zone and operating rule lives here. Components and the
 * scheduling engine read from this file; `scripts/generate-seed-sql.ts` turns the
 * same data into `supabase/seed.sql`, so the database catalogue can never drift
 * from what the UI quotes.
 *
 * This file must stay dependency-free (no path aliases, no runtime imports) so the
 * seed generator can run it directly under Node.
 */

// ─── Imagery ────────────────────────────────────────────────────────────────

export interface ImageAsset {
  src: string;
  srcSet: string;
  alt: string;
}

const WIDTHS = [560, 960, 1600] as const;

export function image(name: string, alt: string): ImageAsset {
  return {
    src: `/images/${name}-960.webp`,
    srcSet: WIDTHS.map((w) => `/images/${name}-${w}.webp ${w}w`).join(', '),
    alt,
  };
}

// ─── Brand & base ───────────────────────────────────────────────────────────

export const BRAND = {
  name: 'APEX AutoCare',
  mark: 'APEX°',
  city: 'Lekki, Lagos',
  base: 'APEX Bay · Ikate, Lekki',
  coordinates: `06°26'28"N 03°29'13"E`,
  whatsapp: '+234 800 000 2739',
  currency: 'NGN',
} as const;

// ─── Vehicles ───────────────────────────────────────────────────────────────

export type VehicleClassId = 'sedan' | 'suv' | 'coupe' | 'pickup' | 'luxury';

export interface VehicleClass {
  id: VehicleClassId;
  label: string;
  /** Base detailing minutes for this body size before service/add-on deltas. */
  baseMinutes: number;
  /** Multiplies the base service price (bigger surface = more product + labour). */
  priceMultiplier: number;
  examples: string;
  surfaceM2: number;
  image: ImageAsset;
  /** Headlight positions on the image, as % of width/height (for flare effects). */
  headlights: [number, number][];
}

export const VEHICLE_CLASSES: VehicleClass[] = [
  {
    id: 'sedan',
    label: 'Sedan',
    baseMinutes: 90,
    priceMultiplier: 1,
    examples: 'Camry · Accord · C-Class',
    surfaceM2: 14.2,
    image: image('vehicle-sedan', 'Dark saloon car in a black studio, lit along its roofline'),
    headlights: [[66, 50]],
  },
  {
    id: 'coupe',
    label: 'Coupe',
    baseMinutes: 100,
    priceMultiplier: 1.1,
    examples: 'C63 Coupe · M4 · 911',
    surfaceM2: 13.1,
    image: image('vehicle-coupe', 'Silhouette of a black coupe with a rim-lit roofline on a black background'),
    headlights: [[8, 64]],
  },
  {
    id: 'suv',
    label: 'SUV',
    baseMinutes: 120,
    priceMultiplier: 1.25,
    examples: 'GV70 · RX 350 · X5',
    surfaceM2: 18.6,
    image: image('vehicle-suv', 'Matte black Genesis GV70 SUV in a dark studio, front three-quarter view'),
    headlights: [[15, 38], [53, 37]],
  },
  {
    id: 'pickup',
    label: 'Pickup',
    baseMinutes: 135,
    priceMultiplier: 1.3,
    examples: 'Hilux · Ranger · F-150',
    surfaceM2: 21.4,
    image: image('vehicle-pickup', 'Black Ford F-150 Raptor pickup parked in long grass at dusk'),
    headlights: [[43, 51], [26, 50]],
  },
  {
    id: 'luxury',
    label: 'Luxury',
    baseMinutes: 150,
    priceMultiplier: 1.5,
    examples: 'Range Rover · G-Wagon · LX 600',
    surfaceM2: 20.8,
    image: image('vehicle-luxury', 'Black Range Rover on a wet gravel track, headlights on'),
    headlights: [[36, 45], [69, 46]],
  },
];

// ─── Services ───────────────────────────────────────────────────────────────

export type ZoneRegion = 'exterior' | 'interior' | 'wheels' | 'glass' | 'engine';

export interface Service {
  id: string;
  name: string;
  short: string;
  description: string;
  basePrice: number;
  /** Minutes added on top of the vehicle's base minutes. */
  extraMinutes: number;
  regions: ZoneRegion[];
  tag?: string;
}

export const SERVICES: Service[] = [
  {
    id: 'signature-reset',
    name: 'Signature Reset',
    short: 'Full refresh, inside and out',
    description: 'Snow-foam pre-wash, two-bucket contact wash, interior vacuum and wipe-down, wheel faces, streak-free glass.',
    basePrice: 45000,
    extraMinutes: 0,
    regions: ['exterior', 'interior', 'wheels', 'glass'],
    tag: 'Most booked',
  },
  {
    id: 'interior-recovery',
    name: 'Interior Recovery',
    short: 'Deep cabin restoration',
    description: 'Steam extraction of seats and carpets, leather clean and condition, vents, trims and headliner spot-treat.',
    basePrice: 65000,
    extraMinutes: 45,
    regions: ['interior', 'glass'],
  },
  {
    id: 'exterior-correction',
    name: 'Exterior Correction',
    short: 'Swirl removal and gloss',
    description: 'Iron and tar decontamination, clay bar, single-stage machine polish to lift swirls and restore depth.',
    basePrice: 110000,
    extraMinutes: 90,
    regions: ['exterior', 'wheels', 'glass'],
  },
  {
    id: 'ceramic-shield',
    name: 'Ceramic Shield',
    short: '24-month ceramic protection',
    description: 'Full paint prep, panel wipe and a 24-month ceramic coating. Wheel faces and glass coated too.',
    basePrice: 240000,
    extraMinutes: 150,
    regions: ['exterior', 'wheels', 'glass'],
    tag: 'Longest job',
  },
];

export interface Addon {
  id: string;
  name: string;
  description: string;
  price: number;
  minutes: number;
  region: ZoneRegion;
}

export const ADDONS: Addon[] = [
  { id: 'engine-bay', name: 'Engine Bay Detail', description: 'Degrease, safe rinse, dress plastics.', price: 15000, minutes: 25, region: 'engine' },
  { id: 'pet-hair', name: 'Pet-Hair Recovery', description: 'Rubber-blade and air-lift extraction from fabric and carpet.', price: 12000, minutes: 30, region: 'interior' },
  { id: 'headlight-restoration', name: 'Headlight Restoration', description: 'Wet-sand, polish and UV-seal cloudy lenses.', price: 18000, minutes: 35, region: 'glass' },
  { id: 'odor-treatment', name: 'Odour Treatment', description: 'Enzyme clean plus ozone cycle for smoke, food and damp.', price: 10000, minutes: 20, region: 'interior' },
  { id: 'wheel-deep', name: 'Wheel & Caliper Deep Clean', description: 'Wheels off the ground, barrels and calipers de-ironed.', price: 14000, minutes: 25, region: 'wheels' },
];

// ─── Anatomy (DetailingExplodedView) ────────────────────────────────────────

export interface AnatomyRegion {
  id: ZoneRegion;
  label: string;
  /** Hotspot position on the SUV hero image, % of width/height. */
  at: [number, number];
  treats: string[];
  image: ImageAsset;
  /** What tapping "add" puts into the booking. */
  suggest: { kind: 'service' | 'addon'; id: string };
}

export const ANATOMY: AnatomyRegion[] = [
  {
    id: 'exterior',
    label: 'Exterior',
    at: [84, 44],
    treats: ['Snow-foam and two-bucket wash', 'Iron and tar decontamination', 'Machine polish on correction jobs', 'Sealant or ceramic top layer'],
    image: image('detail-polish', 'Detailer machine-polishing the wheel arch of a red SUV'),
    suggest: { kind: 'service', id: 'exterior-correction' },
  },
  {
    id: 'interior',
    label: 'Interior',
    at: [75, 21],
    treats: ['Steam extraction of seats and carpet', 'Leather clean and condition', 'Vents, rails and trims', 'Odour neutralised'],
    image: image('detail-interior', 'Close-up of a quilted tan leather car seat'),
    suggest: { kind: 'service', id: 'interior-recovery' },
  },
  {
    id: 'wheels',
    label: 'Wheels',
    at: [62, 60],
    treats: ['Non-acid wheel cleaner', 'Barrels and calipers', 'Tyre dressing, satin finish', 'Arch liners rinsed'],
    image: image('detail-wheel', 'Close-up of a black five-spoke alloy wheel'),
    suggest: { kind: 'addon', id: 'wheel-deep' },
  },
  {
    id: 'glass',
    label: 'Glass & Lights',
    at: [47, 17],
    treats: ['Streak-free glass, inside and out', 'Water-spot removal', 'Headlight lens restoration', 'Hydrophobic glass coat on Ceramic'],
    image: image('detail-headlights', 'Yellow LED headlight signature glowing on a dark BMW'),
    suggest: { kind: 'addon', id: 'headlight-restoration' },
  },
  {
    id: 'engine',
    label: 'Engine Bay',
    at: [32, 27],
    treats: ['Low-pressure degrease', 'Electrics shielded first', 'Plastics and rubbers dressed', 'Dust and leaf debris cleared'],
    image: image('detail-engine', 'Dark green Land Rover Defender bonnet and grille with headlights on'),
    suggest: { kind: 'addon', id: 'engine-bay' },
  },
];

// ─── Service zones & travel ─────────────────────────────────────────────────

export interface ServiceZone {
  id: string;
  name: string;
  /** Base one-way travel from APEX Bay, minutes, off-peak. */
  travelMinutes: number;
  /** Multiplier applied during weekday peak windows (bridge / expressway traffic). */
  peakFactor: number;
  surcharge: number;
  /** Compass bearing from base, degrees (0 = north). Used by LocationRadar. */
  bearing: number;
  distanceKm: number;
  serviced: boolean;
  note?: string;
}

export const ZONES: ServiceZone[] = [
  { id: 'ikate', name: 'Ikate / Elegushi', travelMinutes: 10, peakFactor: 1.2, surcharge: 0, bearing: 20, distanceKm: 1.4, serviced: true },
  { id: 'lekki-phase-1', name: 'Lekki Phase 1', travelMinutes: 15, peakFactor: 1.3, surcharge: 0, bearing: 262, distanceKm: 4.1, serviced: true },
  { id: 'osapa', name: 'Osapa London', travelMinutes: 15, peakFactor: 1.3, surcharge: 0, bearing: 96, distanceKm: 3.3, serviced: true },
  { id: 'chevron', name: 'Chevron / Conservation', travelMinutes: 20, peakFactor: 1.4, surcharge: 0, bearing: 88, distanceKm: 5.6, serviced: true },
  { id: 'victoria-island', name: 'Victoria Island', travelMinutes: 30, peakFactor: 1.5, surcharge: 5000, bearing: 268, distanceKm: 10.8, serviced: true },
  { id: 'ikoyi', name: 'Ikoyi', travelMinutes: 30, peakFactor: 1.5, surcharge: 5000, bearing: 292, distanceKm: 9.2, serviced: true },
  { id: 'ajah', name: 'Ajah', travelMinutes: 35, peakFactor: 1.5, surcharge: 7500, bearing: 100, distanceKm: 13.9, serviced: true },
  { id: 'sangotedo', name: 'Sangotedo', travelMinutes: 45, peakFactor: 1.4, surcharge: 10000, bearing: 92, distanceKm: 19.5, serviced: true },
  { id: 'yaba', name: 'Yaba / Surulere', travelMinutes: 75, peakFactor: 1.6, surcharge: 0, bearing: 302, distanceKm: 18.4, serviced: false, note: 'Third Mainland crossing breaks our 60-minute dispatch radius.' },
  { id: 'ikeja', name: 'Ikeja / GRA', travelMinutes: 95, peakFactor: 1.6, surcharge: 0, bearing: 328, distanceKm: 26.3, serviced: false, note: 'Outside the mobile run — a unit would lose half a day on the road.' },
];

/** Ring radii (km) drawn on the radar; the last serviced ring is the dispatch limit. */
export const RADAR_RINGS_KM = [5, 10, 20, 30];
export const DISPATCH_RADIUS_KM = 20;

// ─── Operations ─────────────────────────────────────────────────────────────

export const OPS = {
  timezone: 'Africa/Lagos',
  /** Lagos is UTC+1 all year (no DST). */
  utcOffsetMinutes: 60,
  setupMinutes: 20,
  inspectionMinutes: 15,
  /** Restock / water refill buffer after a unit gets back to base. */
  turnaroundMinutes: 10,
  /** Earliest a unit may leave base, latest it must be back. */
  dispatchStart: 7 * 60,
  dispatchEnd: 19 * 60 + 30,
  firstStart: 8 * 60,
  lastStart: 17 * 60,
  slotStep: 30,
  /** Weekday peak windows (appointment start, minutes from midnight). */
  peakWindows: [
    [7 * 60, 10 * 60],
    [16 * 60, 19 * 60 + 30],
  ] as [number, number][],
  horizonDays: 14,
  minLeadMinutes: 120,
  depositRate: 0.3,
  priceRounding: 500,
  travelRounding: 5,
  /** Free reschedule/cancel up to this many hours before arrival. */
  freeChangeHours: 12,
} as const;

// ─── Mobile units ───────────────────────────────────────────────────────────

export interface MobileUnit {
  id: string;
  code: string;
  name: string;
  callsign: string;
  crew: string;
  homeZone: string;
}

export const UNITS: MobileUnit[] = [
  { id: 'unit-01', code: '01', name: 'Mobile Unit 01', callsign: 'APEX-01', crew: 'Tunde · Kelechi', homeZone: 'ikate' },
  { id: 'unit-02', code: '02', name: 'Mobile Unit 02', callsign: 'APEX-02', crew: 'Sade · Ibrahim', homeZone: 'ikate' },
  { id: 'unit-03', code: '03', name: 'Mobile Unit 03', callsign: 'APEX-03', crew: 'Chidi · Mariam', homeZone: 'ikate' },
];

// ─── Demo seed ──────────────────────────────────────────────────────────────

/**
 * Canonical demo jobs, keyed by weekday (0 = Sunday). Friday–Sunday carry more work
 * so the orbit visibly tightens at the weekend; every day still leaves several
 * feasible windows (enforced by `src/lib/scheduling.test.ts`).
 */
export interface SeedJob {
  unit: 0 | 1 | 2;
  start: string;
  vehicle: VehicleClassId;
  label: string;
  service: string;
  addons?: string[];
  zone: string;
  customer: string;
  pendingDeposit?: boolean;
}

export const SEED_WEEK: Record<number, SeedJob[]> = {
  // Sunday
  0: [
    { unit: 0, start: '09:00', vehicle: 'luxury', label: 'Lexus LX 600', service: 'signature-reset', zone: 'ikoyi', customer: 'Adaeze O.' },
    { unit: 0, start: '14:30', vehicle: 'suv', label: 'Toyota Prado', service: 'interior-recovery', addons: ['odor-treatment'], zone: 'lekki-phase-1', customer: 'Tobi A.' },
    { unit: 1, start: '08:00', vehicle: 'sedan', label: 'Mercedes C300', service: 'signature-reset', zone: 'osapa', customer: 'Femi K.' },
    { unit: 1, start: '11:30', vehicle: 'suv', label: 'BMW X5', service: 'exterior-correction', zone: 'chevron', customer: 'Zainab B.' },
    { unit: 2, start: '10:00', vehicle: 'pickup', label: 'Toyota Hilux', service: 'signature-reset', addons: ['engine-bay'], zone: 'ajah', customer: 'Chuka E.' },
  ],
  // Monday
  1: [
    { unit: 0, start: '10:30', vehicle: 'suv', label: 'Lexus RX 350', service: 'signature-reset', zone: 'lekki-phase-1', customer: 'Ifeoma N.' },
    { unit: 1, start: '11:00', vehicle: 'luxury', label: 'Range Rover Sport', service: 'exterior-correction', zone: 'victoria-island', customer: 'Seyi D.' },
    { unit: 2, start: '14:00', vehicle: 'sedan', label: 'Honda Accord', service: 'interior-recovery', addons: ['pet-hair'], zone: 'ikate', customer: 'Bola A.' },
  ],
  // Tuesday
  2: [
    { unit: 0, start: '11:00', vehicle: 'coupe', label: 'BMW M4', service: 'exterior-correction', zone: 'ikoyi', customer: 'Kemi F.' },
    { unit: 1, start: '10:30', vehicle: 'suv', label: 'Toyota Highlander', service: 'signature-reset', zone: 'osapa', customer: 'Emeka U.' },
    { unit: 2, start: '13:30', vehicle: 'sedan', label: 'Toyota Camry', service: 'signature-reset', addons: ['headlight-restoration'], zone: 'chevron', customer: 'Nneka I.' },
  ],
  // Wednesday
  3: [
    { unit: 0, start: '10:30', vehicle: 'luxury', label: 'Mercedes-Benz G 63', service: 'ceramic-shield', zone: 'victoria-island', customer: 'Dapo L.' },
    { unit: 1, start: '11:00', vehicle: 'sedan', label: 'Lexus ES 350', service: 'interior-recovery', zone: 'lekki-phase-1', customer: 'Halima S.' },
    { unit: 2, start: '14:30', vehicle: 'pickup', label: 'Ford Ranger', service: 'signature-reset', zone: 'sangotedo', customer: 'Ayo M.' },
  ],
  // Thursday
  4: [
    { unit: 0, start: '10:30', vehicle: 'suv', label: 'Porsche Cayenne', service: 'exterior-correction', zone: 'ikoyi', customer: 'Tolu B.' },
    { unit: 1, start: '12:00', vehicle: 'sedan', label: 'Toyota Corolla', service: 'signature-reset', zone: 'ikate', customer: 'Ugo C.' },
    { unit: 2, start: '10:30', vehicle: 'suv', label: 'Kia Sorento', service: 'interior-recovery', addons: ['pet-hair', 'odor-treatment'], zone: 'ajah', customer: 'Funmi R.' },
  ],
  // Friday
  5: [
    { unit: 0, start: '08:00', vehicle: 'suv', label: 'Lexus GX 460', service: 'signature-reset', zone: 'lekki-phase-1', customer: 'Amaka P.' },
    { unit: 0, start: '13:30', vehicle: 'luxury', label: 'Range Rover Vogue', service: 'exterior-correction', zone: 'ikoyi', customer: 'Obinna J.' },
    { unit: 1, start: '10:30', vehicle: 'pickup', label: 'Toyota Hilux', service: 'signature-reset', zone: 'chevron', customer: 'Musa G.' },
    { unit: 1, start: '16:30', vehicle: 'sedan', label: 'Mercedes E350', service: 'signature-reset', zone: 'lekki-phase-1', customer: 'Yemi T.' },
    { unit: 2, start: '14:00', vehicle: 'coupe', label: 'Mercedes-AMG C63', service: 'ceramic-shield', zone: 'osapa', customer: 'Kunle W.', pendingDeposit: true },
  ],
  // Saturday
  6: [
    { unit: 0, start: '08:00', vehicle: 'suv', label: 'BMW X6', service: 'signature-reset', zone: 'lekki-phase-1', customer: 'Ronke H.' },
    { unit: 0, start: '11:30', vehicle: 'luxury', label: 'Lexus LX 570', service: 'exterior-correction', zone: 'ikoyi', customer: 'Victor N.' },
    { unit: 1, start: '08:30', vehicle: 'sedan', label: 'Toyota Camry', service: 'interior-recovery', addons: ['pet-hair'], zone: 'ikate', customer: 'Esther O.' },
    { unit: 1, start: '13:00', vehicle: 'suv', label: 'Mercedes GLE', service: 'signature-reset', addons: ['engine-bay'], zone: 'victoria-island', customer: 'Gbenga A.' },
    { unit: 1, start: '17:00', vehicle: 'sedan', label: 'Honda Civic', service: 'signature-reset', zone: 'osapa', customer: 'Daniel E.' },
    { unit: 2, start: '13:00', vehicle: 'luxury', label: 'Range Rover Sport', service: 'ceramic-shield', zone: 'chevron', customer: 'Lola K.' },
  ],
};

/** Seeded days relative to "today" (Lagos). Yesterday gives the owner view some history. */
export const SEED_DAY_OFFSETS = { from: -1, to: 13 } as const;

// ─── Demo inquiries (InquirySimulator presets) ──────────────────────────────

export const DEMO_INQUIRIES = [
  { channel: 'WhatsApp', handle: '+234 803 ••• 4471', text: "Hi! Can you detail my Range Rover tomorrow? I'm in Ikoyi." },
  { channel: 'Instagram', handle: '@tolu.drives', text: 'Need interior done on my Camry this Saturday morning, Lekki Phase 1. Dog hair everywhere 😩' },
  { channel: 'WhatsApp', handle: '+234 916 ••• 0082', text: 'How much for ceramic coating on a G-Wagon next Friday afternoon? VI.' },
  { channel: 'Instagram', handle: '@ajah.hilux', text: 'Can your guys come to Ajah today for my Hilux? Engine bay too.' },
] as const;
