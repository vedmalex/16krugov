export const JAPA_TARGETS = [4, 8, 16, 24, 32, 40, 48, 56, 64] as const;

export type JapaLayoutId = "canon" | "rasayana" | "custom";

export interface JapaTextUnit {
  id: string;
  workId: string;
  workTitle: string;
  canonicalRef?: string | null;
  verseNumber?: number;
  totalVerses?: number;
  title: string;
  sanskrit: string;
  translation: string;
  instruction: string;
  commentary?: string | null;
  link?: string;
}

export interface JapaCollections {
  favorites: string[];
  customRoundIds: Record<number, string>;
}

export interface JapaDisplayPrefs {
  sanskrit: boolean;
  translation: boolean;
  instruction: boolean;
  italicSanskrit: boolean;
  italicTranslation: boolean;
  italicInstruction: boolean;
  readingScale: number;
  standMode: boolean;
  leftHanded: boolean;
  layoutId: JapaLayoutId;
}

export interface JapaSession {
  id: string;
  target: number;
  startedAt: number;
  roundStartedAt: number | null;
  elapsedMs: number;
  durations: number[];
  completed: boolean;
  layoutId?: JapaLayoutId;
}

export interface JapaUndoSnapshot {
  previousSession: JapaSession;
  recordedDurationMs: number;
  roundNumber: number;
}

export interface RawRoundEntry {
  round: number;
  title?: string;
  theme: string;
  instruction: string;
  shloka?: {
    sanskrit?: string;
    translation?: string;
    source?: string;
  };
}

export interface RawRasayanaEntry {
  verse_index: number;
  canonical_ref?: string;
  book_ref?: string;
  category_title?: string;
  topic: string;
  description?: string;
  sanskrit_iast?: string;
  book_translit?: string;
  translation_book_ru?: string;
  translation_canonical_ru?: string;
}

export interface ActiveTuneInInput {
  title: string;
  workTitle: string;
  canonicalRef?: string | null;
  sanskrit: string;
  translation: string;
  instruction?: string | null;
  link: string;
}

export const DEFAULT_JAPA_DISPLAY: JapaDisplayPrefs = {
  sanskrit: true,
  translation: true,
  instruction: true,
  italicSanskrit: true,
  italicTranslation: false,
  italicInstruction: true,
  readingScale: 1,
  standMode: false,
  leftHanded: false,
  layoutId: "canon",
};

export function formatRounds(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} кругов`;
  if (mod10 === 1) return `${n} круг`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} круга`;
  return `${n} кругов`;
}

export function japaTime(ms: number, includeHours = false): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (includeHours || h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function mapRoundEntryToUnit(entry: RawRoundEntry, totalRounds = 16): JapaTextUnit {
  return {
    id: `lk-${entry.round}`,
    workId: "luchshie-krugi",
    workTitle: "16 кругов — Лучшие круги джапы",
    canonicalRef: entry.shloka?.source ?? null,
    verseNumber: entry.round,
    totalVerses: totalRounds,
    title: `Настрой ${entry.round}: ${entry.theme}`,
    sanskrit: entry.shloka?.sanskrit ?? "",
    translation: entry.shloka?.translation ?? "",
    instruction: entry.instruction ?? "",
    commentary: entry.shloka?.source ? `Источник: ${entry.shloka.source}` : null,
    link: `#/shlokas?work=luchshie-krugi&verse=${entry.round}`,
  };
}

export function mapRasayanaEntryToUnit(entry: RawRasayanaEntry, totalVerses: number): JapaTextUnit {
  return {
    id: `br-${entry.verse_index}`,
    workId: "bhakti-rasayana",
    workTitle: "Шри Бхакти-расаяна",
    canonicalRef: entry.canonical_ref ?? entry.book_ref ?? null,
    verseNumber: entry.verse_index,
    totalVerses,
    title: entry.topic,
    sanskrit: entry.sanskrit_iast || entry.book_translit || "",
    translation: entry.translation_canonical_ru || entry.translation_book_ru || "",
    instruction: entry.description ?? "",
    commentary: entry.category_title ? `${entry.category_title}${entry.book_ref ? ` · ${entry.book_ref}` : ""}` : entry.book_ref ?? null,
    link: `#/shlokas?work=bhakti-rasayana&verse=${entry.verse_index}`,
  };
}

export function buildJapaCatalogUnits(
  roundsData: readonly RawRoundEntry[],
  rasayanaVerses: readonly RawRasayanaEntry[],
): JapaTextUnit[] {
  const lk = roundsData.map((r) => mapRoundEntryToUnit(r, roundsData.length));
  const br = rasayanaVerses.map((v) => mapRasayanaEntryToUnit(v, rasayanaVerses.length));
  return [...lk, ...br];
}

export function buildJapaSequence(
  target: number,
  layoutId: JapaLayoutId,
  roundsData: readonly RawRoundEntry[],
  rasayanaVerses: readonly RawRasayanaEntry[],
  customRoundIds: Record<number, string> = {},
  activeTuneIn: ActiveTuneInInput | null = null,
): JapaTextUnit[] {
  const safeTarget = Math.max(1, Math.round(target));
  const lkUnits = roundsData.map((r) => mapRoundEntryToUnit(r, roundsData.length));
  const brUnits = rasayanaVerses.map((v) => mapRasayanaEntryToUnit(v, rasayanaVerses.length));
  const catalogById = new Map<string, JapaTextUnit>();
  for (const unit of [...lkUnits, ...brUnits]) {
    catalogById.set(unit.id, unit);
  }

  let baseSequence: JapaTextUnit[] = [];

  if (layoutId === "rasayana" && brUnits.length > 0) {
    baseSequence = Array.from({ length: safeTarget }, (_, i) => brUnits[i % brUnits.length]);
  } else if (lkUnits.length > 0) {
    if (safeTarget === 4 && lkUnits.length >= 16) {
      // Compressed immersion arc: opening -> humility -> mind focus -> closing gratitude
      baseSequence = [lkUnits[0], lkUnits[1], lkUnits[7], lkUnits[15]];
    } else if (safeTarget === 8 && lkUnits.length >= 16) {
      baseSequence = [0, 1, 3, 5, 7, 10, 13, 15].map((idx) => lkUnits[idx]);
    } else if (safeTarget <= lkUnits.length) {
      baseSequence = Array.from({ length: safeTarget }, (_, i) =>
        i === safeTarget - 1 ? lkUnits[lkUnits.length - 1] : lkUnits[i],
      );
    } else {
      // Target > 16: open with Лучшие круги 1..15, deepen via Бхакти-расаяна, conclude with round 16
      const head = lkUnits.slice(0, Math.max(0, lkUnits.length - 1));
      const closing = lkUnits[lkUnits.length - 1];
      const middleCount = Math.max(0, safeTarget - head.length - 1);
      const middlePool = brUnits.length > 0 ? brUnits : lkUnits;
      const middle = Array.from({ length: middleCount }, (_, i) => middlePool[i % middlePool.length]);
      baseSequence = [...head, ...middle, closing];
    }
  } else if (brUnits.length > 0) {
    baseSequence = Array.from({ length: safeTarget }, (_, i) => brUnits[i % brUnits.length]);
  }

  // Apply custom overrides when layout is "custom"
  if (layoutId === "custom" && baseSequence.length > 0) {
    baseSequence = baseSequence.map((fallback, idx) => {
      const assignedId = customRoundIds[idx + 1];
      return (assignedId && catalogById.get(assignedId)) || fallback;
    });
  }

  // If user chose a custom tune-in shloka from the Shloka Bank, apply it cleanly on round 1
  if (activeTuneIn && baseSequence.length > 0) {
    const tuneUnit: JapaTextUnit = {
      id: "custom-tune-in",
      workId: "custom",
      workTitle: activeTuneIn.workTitle,
      canonicalRef: activeTuneIn.canonicalRef ?? null,
      title: `Выбранный настрой: ${activeTuneIn.title}`,
      sanskrit: activeTuneIn.sanskrit,
      translation: activeTuneIn.translation,
      instruction: activeTuneIn.instruction ?? "",
      link: activeTuneIn.link,
    };
    baseSequence = [tuneUnit, ...baseSequence.slice(1)];
  }

  return baseSequence;
}

export function computeRoundElapsedMs(session: JapaSession | null, now: number): number {
  if (!session) return 0;
  const activeDelta = session.roundStartedAt === null ? 0 : Math.max(0, now - session.roundStartedAt);
  return session.elapsedMs + activeDelta;
}

export function computeTotalElapsedMs(session: JapaSession | null, now: number): number {
  if (!session) return 0;
  const completedSum = session.durations.reduce((sum, d) => sum + d, 0);
  if (session.completed) return completedSum;
  return completedSum + computeRoundElapsedMs(session, now);
}

export function computeAverageRoundMs(durations: readonly number[]): number {
  if (durations.length === 0) return 0;
  const sum = durations.reduce((acc, d) => acc + d, 0);
  return Math.round(sum / durations.length);
}

export function toggleSessionPause(session: JapaSession, now: number): JapaSession {
  if (session.completed) return session;
  if (session.roundStartedAt === null) {
    return { ...session, roundStartedAt: now };
  }
  return {
    ...session,
    elapsedMs: session.elapsedMs + Math.max(0, now - session.roundStartedAt),
    roundStartedAt: null,
  };
}

export function advanceRound(
  session: JapaSession,
  now: number,
): { nextSession: JapaSession; undoSnapshot: JapaUndoSnapshot } {
  const currentRound = session.durations.length + 1;
  const duration = computeRoundElapsedMs(session, now);
  const completed = currentRound >= session.target;
  const nextSession: JapaSession = {
    ...session,
    durations: [...session.durations, duration],
    elapsedMs: 0,
    roundStartedAt: !completed && session.roundStartedAt !== null ? now : null,
    completed,
  };
  return {
    nextSession,
    undoSnapshot: {
      previousSession: session,
      recordedDurationMs: duration,
      roundNumber: currentRound,
    },
  };
}

export function undoRoundCompletion(
  snapshot: JapaUndoSnapshot,
  now: number,
  wasPaused: boolean,
): JapaSession {
  const prev = snapshot.previousSession;
  if (wasPaused || prev.roundStartedAt === null) {
    return {
      ...prev,
      elapsedMs: snapshot.recordedDurationMs,
      roundStartedAt: null,
    };
  }
  // Adjust start anchor so restored round continues smoothly without losing seconds
  return {
    ...prev,
    elapsedMs: snapshot.recordedDurationMs,
    roundStartedAt: now,
  };
}

export function canTriggerNextRound(lastClickAt: number, now: number, debounceMs = 800): boolean {
  return now - lastClickAt >= debounceMs;
}

export function hasVisibleDisplayLayer(display: Pick<JapaDisplayPrefs, "sanskrit" | "translation" | "instruction">): boolean {
  return display.sanskrit || display.translation || display.instruction;
}
