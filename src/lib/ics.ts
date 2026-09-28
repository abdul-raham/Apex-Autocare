import { BRAND } from '../data/apex';
import { serviceById, zoneById } from './catalog';
import type { Booking } from './types';

const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** RFC 5545 calendar file for a booking. */
export function bookingIcs(b: Booking): string {
  const zone = zoneById(b.zoneId)?.name ?? b.zoneId;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//APEX AutoCare//Booking//EN',
    'BEGIN:VEVENT',
    `UID:${b.code}@apex-autocare`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.startAt)}`,
    `DTEND:${stamp(b.endAt)}`,
    `SUMMARY:APEX ${serviceById(b.serviceId).name} · ${b.vehicleLabel}`,
    `LOCATION:${[b.address, zone, 'Lagos'].filter(Boolean).join(', ')}`,
    `DESCRIPTION:Booking ${b.code}. Mobile unit arrives at the start time. WhatsApp ${BRAND.whatsapp}.`,
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    'DESCRIPTION:APEX crew en route soon',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export function downloadIcs(b: Booking) {
  const blob = new Blob([bookingIcs(b)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${b.code}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
