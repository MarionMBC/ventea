import type { OpeningRange } from '@ventea/shared';

/** Semana del panel: de lunes a domingo (los datos usan 0 = domingo, como `Date#getDay`). */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;
export type Day = (typeof WEEK)[number];

/** Un día en el formulario: abierto o no, con su primer tramo. */
export interface DayDraft {
  open: boolean;
  opens: string;
  closes: string;
  /** Tramos de más (dos por día, cargados por la API): se conservan tal cual. */
  extra: OpeningRange[];
}

export type WeekDraft = Record<Day, DayDraft>;

const DEFAULT_RANGE = { opens: '11:00', closes: '22:00' };

export function weekDraft(ranges: readonly OpeningRange[]): WeekDraft {
  const week = {} as WeekDraft;
  for (const day of WEEK) {
    const [first, ...extra] = ranges
      .filter((r) => r.day === day)
      .sort((a, b) => a.opens.localeCompare(b.opens));
    week[day] = first
      ? { open: true, opens: first.opens, closes: first.closes, extra }
      : { open: false, ...DEFAULT_RANGE, extra: [] };
  }
  return week;
}

/** Del formulario a la API: ordenado por día y hora, solo los días abiertos. */
export function weekRanges(week: WeekDraft): OpeningRange[] {
  return ([0, 1, 2, 3, 4, 5, 6] as const).flatMap((day) => {
    const draft = week[day];
    if (!draft.open) return [];
    return [{ day, opens: draft.opens, closes: draft.closes }, ...draft.extra].sort((a, b) =>
      a.opens.localeCompare(b.opens),
    );
  });
}

/** Días abiertos que abren y cierran a la misma hora (la API los rechaza). */
export function sameTimeDays(week: WeekDraft): Day[] {
  return WEEK.filter((day) => week[day].open && week[day].opens === week[day].closes);
}

export function sameRanges(a: readonly OpeningRange[], b: readonly OpeningRange[]): boolean {
  const key = (ranges: readonly OpeningRange[]) =>
    ranges
      .map((r) => `${r.day}-${r.opens}-${r.closes}`)
      .sort()
      .join('|');
  return key(a) === key(b);
}

export interface HoursGroup {
  /** Primer y último día del grupo (iguales si es uno solo). */
  from: Day;
  to: Day;
  /** `null` = cerrado. */
  ranges: { opens: string; closes: string }[] | null;
}

/**
 * Resumen del horario: días seguidos (lunes a domingo) con el mismo horario se agrupan
 * («Lun–Vie 11:00–22:00 · Sáb 12:00–23:00 · Dom cerrado»).
 */
export function hoursGroups(ranges: readonly OpeningRange[]): HoursGroup[] {
  const groups: HoursGroup[] = [];
  let lastKey: string | null = null;
  for (const day of WEEK) {
    const dayRanges = ranges
      .filter((r) => r.day === day)
      .sort((a, b) => a.opens.localeCompare(b.opens))
      .map(({ opens, closes }) => ({ opens, closes }));
    const key = dayRanges.map((r) => `${r.opens}-${r.closes}`).join(',');
    const last = groups[groups.length - 1];
    if (last && key === lastKey) {
      last.to = day;
    } else {
      groups.push({ from: day, to: day, ranges: dayRanges.length > 0 ? dayRanges : null });
      lastKey = key;
    }
  }
  return groups;
}
