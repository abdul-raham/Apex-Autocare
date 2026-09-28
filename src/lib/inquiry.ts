import type { VehicleClassId } from '../data/apex';
import { addDays, lagosClock, weekday } from './time';

/**
 * Turns an inbound DM ("Can you detail my Range Rover tomorrow? I'm in Ikoyi")
 * into structured booking state. Rule-based and deterministic on purpose: it is
 * fast, works offline and every match can be highlighted back to the user.
 */

export type TokenKind = 'vehicle' | 'day' | 'time' | 'zone' | 'service' | 'addon';

export interface InquiryToken {
  kind: TokenKind;
  text: string;
  index: number;
  value: string;
}

export interface ParsedInquiry {
  classId?: VehicleClassId;
  vehicleLabel?: string;
  date?: string;
  dayPart?: 'morning' | 'afternoon' | 'evening';
  preferredStart?: number;
  zoneId?: string;
  serviceId: string;
  addonIds: string[];
  tokens: InquiryToken[];
}

const VEHICLES: [RegExp, VehicleClassId, string][] = [
  [/\brange\s?rover(?:\s(?:sport|vogue|velar))?\b/i, 'luxury', 'Range Rover'],
  [/\bg[\s-]?wagon\b|\bg[\s-]?63\b|\bg[\s-]?class\b/i, 'luxury', 'Mercedes G-Class'],
  [/\blx\s?\d{3}\b/i, 'luxury', 'Lexus LX'],
  [/\b(?:rolls|bentley|maybach|escalade)\b/i, 'luxury', ''],
  [/\b(?:hilux|ranger|f-?150|tacoma|tundra|navara|d-?max|pick-?up|pickup)\b/i, 'pickup', ''],
  [/\b(?:coupe|m4|911|c63|amg gt|mustang|camaro)\b/i, 'coupe', ''],
  [/\b(?:rx\s?\d{3}|gx\s?\d{3}|x[3-7]|gle|glc|gls|prado|highlander|cayenne|sorento|venza|rav4|land cruiser|fortuner|gv\d0|suv|jeep)\b/i, 'suv', ''],
  [/\b(?:camry|corolla|accord|civic|c\s?300|e\s?350|es\s?350|altima|elantra|sedan|saloon)\b/i, 'sedan', ''],
];

const ZONES: [RegExp, string][] = [
  [/\b(?:victoria island|\bv\.?i\.?\b)/i, 'victoria-island'],
  [/\bikoyi\b/i, 'ikoyi'],
  [/\b(?:lekki\s?phase\s?1|phase\s?(?:1|one)|lekki)\b/i, 'lekki-phase-1'],
  [/\b(?:ikate|elegushi)\b/i, 'ikate'],
  [/\bosapa\b/i, 'osapa'],
  [/\b(?:chevron|conservation)\b/i, 'chevron'],
  [/\bajah\b/i, 'ajah'],
  [/\bsangotedo\b/i, 'sangotedo'],
  [/\b(?:yaba|surulere)\b/i, 'yaba'],
  [/\b(?:ikeja|gra)\b/i, 'ikeja'],
];

const SERVICES: [RegExp, string][] = [
  [/\bceramic\b|\bcoating\b/i, 'ceramic-shield'],
  [/\b(?:polish|swirl|scratch|correction|paint)\w*/i, 'exterior-correction'],
  [/\binterior\b|\bseats?\b|\bupholster\w*/i, 'interior-recovery'],
];

const ADDONS: [RegExp, string][] = [
  [/\b(?:dog|cat|pet)s?\b|\bhair\b/i, 'pet-hair'],
  [/\bengine\b/i, 'engine-bay'],
  [/\bheadlights?\b|\bfoggy lights?\b/i, 'headlight-restoration'],
  [/\b(?:smell|odou?r|smoke|smoky)\b/i, 'odor-treatment'],
  [/\b(?:rims?|calipers?|alloys?)\b/i, 'wheel-deep'],
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function titleCase(s: string) {
  return s.replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseInquiry(text: string, today: string = lagosClock().date): ParsedInquiry {
  const tokens: InquiryToken[] = [];
  const out: ParsedInquiry = { serviceId: 'signature-reset', addonIds: [], tokens };
  const take = (kind: TokenKind, m: RegExpExecArray | null, value: string) => {
    if (m) tokens.push({ kind, text: m[0], index: m.index, value });
    return m;
  };

  for (const [re, cls, label] of VEHICLES) {
    const m = take('vehicle', re.exec(text), cls);
    if (m) {
      out.classId = cls;
      out.vehicleLabel = label || titleCase(m[0]);
      break;
    }
  }

  for (const [re, zone] of ZONES) {
    if (take('zone', re.exec(text), zone)) {
      out.zoneId = zone;
      break;
    }
  }

  for (const [re, service] of SERVICES) {
    if (take('service', re.exec(text), service)) {
      out.serviceId = service;
      break;
    }
  }

  for (const [re, addon] of ADDONS) {
    if (take('addon', re.exec(text), addon)) out.addonIds.push(addon);
  }

  // Day
  const rel = /\b(today|tonight|tomorrow|tmrw|this weekend|weekend)\b/i.exec(text);
  const named = /\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(text);
  if (rel) {
    const word = rel[1].toLowerCase();
    const date =
      word === 'today' || word === 'tonight'
        ? today
        : word.startsWith('tom') || word === 'tmrw'
          ? addDays(today, 1)
          : addDays(today, (6 - weekday(today) + 7) % 7 || 7);
    take('day', rel, date);
    out.date = date;
  } else if (named) {
    const target = WEEKDAYS.indexOf(named[2].toLowerCase());
    let delta = (target - weekday(today) + 7) % 7 || 7;
    if (named[1]?.toLowerCase() === 'next' && delta < 7) delta += delta <= 2 ? 7 : 0;
    const date = addDays(today, delta);
    take('day', named, date);
    out.date = date;
  }

  // Time of day
  const clock = /\b(\d{1,2})(?::(\d{2}))?\s?(am|pm)\b/i.exec(text);
  const part = /\b(morning|afternoon|evening)\b/i.exec(text);
  if (clock) {
    let h = Number(clock[1]) % 12;
    if (clock[3].toLowerCase() === 'pm') h += 12;
    out.preferredStart = h * 60 + Number(clock[2] ?? 0);
    take('time', clock, String(out.preferredStart));
  } else if (part) {
    out.dayPart = part[1].toLowerCase() as ParsedInquiry['dayPart'];
    out.preferredStart = { morning: 9 * 60, afternoon: 13 * 60, evening: 16 * 60 + 30 }[out.dayPart!];
    take('time', part, out.dayPart!);
  }

  tokens.sort((a, z) => a.index - z.index);
  return out;
}
