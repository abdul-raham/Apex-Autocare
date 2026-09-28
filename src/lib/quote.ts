import { OPS } from '../data/apex';
import { addonById, serviceById, vehicleById, zoneById } from './catalog';
import type { JobSpec } from './types';

export interface QuoteLine {
  id: string;
  label: string;
  amount: number;
  minutes: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  deposit: number;
  balance: number;
  /** Hands-on detailing minutes (vehicle base + service + add-ons). */
  detailMinutes: number;
  /** Customer-facing on-site time: setup + detail + inspection. */
  onSiteMinutes: number;
  /** Off-peak one-way travel; the real value per slot comes from the scheduler. */
  baseTravelMinutes: number;
  serviceable: boolean;
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

export function detailMinutesFor(spec: JobSpec): number {
  const vehicle = vehicleById(spec.classId);
  const service = serviceById(spec.serviceId);
  const addons = spec.addonIds.map(addonById).filter((a) => !!a);
  return vehicle.baseMinutes + service.extraMinutes + addons.reduce((sum, a) => sum + a.minutes, 0);
}

export function computeQuote(spec: JobSpec): Quote {
  const vehicle = vehicleById(spec.classId);
  const service = serviceById(spec.serviceId);
  const zone = zoneById(spec.zoneId);
  const addons = spec.addonIds.map(addonById).filter((a) => !!a);

  const servicePrice = roundTo(service.basePrice * vehicle.priceMultiplier, OPS.priceRounding);
  const lines: QuoteLine[] = [
    {
      id: service.id,
      label: `${service.name} · ${vehicle.label}`,
      amount: servicePrice,
      minutes: vehicle.baseMinutes + service.extraMinutes,
    },
    ...addons.map((a) => ({ id: a.id, label: a.name, amount: a.price, minutes: a.minutes })),
  ];
  if (zone && zone.surcharge > 0) {
    lines.push({ id: `zone-${zone.id}`, label: `Travel · ${zone.name}`, amount: zone.surcharge, minutes: 0 });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const deposit = roundTo(subtotal * OPS.depositRate, OPS.priceRounding);
  const detailMinutes = detailMinutesFor(spec);

  return {
    lines,
    subtotal,
    deposit,
    balance: subtotal - deposit,
    detailMinutes,
    onSiteMinutes: OPS.setupMinutes + detailMinutes + OPS.inspectionMinutes,
    baseTravelMinutes: zone?.travelMinutes ?? 0,
    serviceable: !!zone?.serviced,
  };
}
