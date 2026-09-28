import { ADDONS, SERVICES, UNITS, VEHICLE_CLASSES, ZONES, type VehicleClassId } from '../data/apex';

export const vehicleById = (id: VehicleClassId) => VEHICLE_CLASSES.find((v) => v.id === id) ?? VEHICLE_CLASSES[0];
export const serviceById = (id: string) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];
export const addonById = (id: string) => ADDONS.find((a) => a.id === id);
export const zoneById = (id: string) => ZONES.find((z) => z.id === id);
export const unitById = (id: string) => UNITS.find((u) => u.id === id) ?? UNITS[0];

export const naira = (amount: number) => `₦${Math.round(amount).toLocaleString('en-NG')}`;
