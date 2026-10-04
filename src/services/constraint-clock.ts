import { z } from 'zod';

const absoluteDateTimeSchema = z.iso.datetime({ offset: true });
const dateSchema = z.iso.date();

export interface AbsoluteTimeEvidence {
  epochMilliseconds: number;
  hasSubmillisecondFraction: boolean;
}

export function readAbsoluteTime(value: unknown): AbsoluteTimeEvidence | undefined {
  const parsed = absoluteDateTimeSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const epochMilliseconds = Date.parse(parsed.data);
  if (!Number.isFinite(epochMilliseconds)) return undefined;
  const fraction = parsed.data.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] ?? '';
  return { epochMilliseconds, hasSubmillisecondFraction: /[1-9]/.test(fraction.slice(3)) };
}

export function isAfterBoundary(value: AbsoluteTimeEvidence, boundary: number): boolean {
  return value.epochMilliseconds > boundary ||
    (value.epochMilliseconds === boundary && value.hasSubmillisecondFraction);
}

export interface ConstraintClock {
  /** Only a unique local clock boundary is usable; gaps/folds stay unresolved. */
  boundary(date: string, time: string): number | undefined;
}

export function createConstraintClock(timezone: unknown): ConstraintClock | undefined {
  if (typeof timezone !== 'string' || !timezone.trim()) return undefined;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
  } catch {
    return undefined;
  }

  const localDateTime = (epoch: number): string | undefined => {
    const parts = formatter.formatToParts(new Date(epoch));
    const get = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
      parts.find((part) => part.type === type)?.value;
    const year = get('year'), month = get('month'), day = get('day');
    const hour = get('hour'), minute = get('minute'), second = get('second');
    if (!year || !month || !day || !hour || !minute || !second) return undefined;
    return `${year.padStart(4, '0')}-${month}-${day}T${hour}:${minute}:${second}`;
  };

  return {
    boundary(date, time) {
      if (!dateSchema.safeParse(date).success || date.startsWith('0000-') ||
        !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return undefined;
      const target = `${date}T${time}:00`;
      const naiveEpoch = Date.parse(`${target}Z`);
      if (!Number.isFinite(naiveEpoch)) return undefined;

      // Collect the zone offsets around this local day rather than using an
      // itinerary timestamp's offset. Both sides of a DST transition matter.
      const offsets = new Set<number>();
      for (let hours = -36; hours <= 36; hours++) {
        const sample = naiveEpoch + hours * 3_600_000;
        const local = localDateTime(sample);
        if (!local) continue;
        const encoded = Date.parse(`${local}Z`);
        if (Number.isFinite(encoded)) offsets.add(encoded - sample);
      }
      const candidates = [...offsets].map((offset) => naiveEpoch - offset)
        .filter((candidate) => localDateTime(candidate) === target);
      return candidates.length === 1 ? candidates[0] : undefined;
    }
  };
}
