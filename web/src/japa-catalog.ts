import luchshieKrugiJson from "../data/luchshie_krugi.json";
import bhaktiRasayanaJson from "../data/bhakti_rasayana.json";
import {
  DEFAULT_JAPA_DISPLAY,
  buildJapaCatalogUnits,
  type JapaCollections,
  type JapaDisplayPrefs,
  type JapaLayoutId,
  type JapaSession,
  type JapaTextUnit,
  type RawRasayanaEntry,
  type RawRoundEntry,
} from "./japa-model";

export const JAPA_ACTIVE_KEY = "japa-active-session";
export const JAPA_HISTORY_KEY = "japa-session-history";
export const JAPA_DISPLAY_KEY = "japa-display";
export const JAPA_COLLECTIONS_KEY = "japa-collections";

export interface CompletionPrayer {
  id: string;
  title: string;
  sanskrit?: string;
  translation: string;
  source?: string;
  instruction?: string;
}

export interface PreliminaryCondition {
  id: string;
  step: number;
  title: string;
  topic: string;
  text: string;
}

interface RawKrugiData {
  rounds?: RawRoundEntry[];
  preliminary_settings?: {
    five_conditions?: PreliminaryCondition[];
  };
  completion_prayers?: {
    prayers?: CompletionPrayer[];
  };
}

interface RawRasayanaData {
  verses?: RawRasayanaEntry[];
}

const krugiData = luchshieKrugiJson as unknown as RawKrugiData;
const rasayanaData = bhaktiRasayanaJson as unknown as RawRasayanaData;

export const JAPA_ROUNDS_RAW: readonly RawRoundEntry[] = krugiData.rounds ?? [];
export const JAPA_RASAYANA_RAW: readonly RawRasayanaEntry[] = rasayanaData.verses ?? [];
export const JAPA_COMPLETION_PRAYERS: readonly CompletionPrayer[] =
  krugiData.completion_prayers?.prayers ?? [];
export const JAPA_PRELIMINARY_CONDITIONS: readonly PreliminaryCondition[] =
  krugiData.preliminary_settings?.five_conditions ?? [];

export const JAPA_CATALOG_UNITS: readonly JapaTextUnit[] = buildJapaCatalogUnits(
  JAPA_ROUNDS_RAW,
  JAPA_RASAYANA_RAW,
);

export const JAPA_LAYOUT_LABELS: Record<JapaLayoutId, string> = {
  canon: "Канон · Лучшие круги + Расаяна",
  rasayana: "Погружение · Шри Бхакти-расаяна",
  custom: "Моя подборка (настраиваемая)",
};

export function loadJapaSession(): JapaSession | null {
  try {
    const raw = localStorage.getItem(JAPA_ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as JapaSession;
    return parsed && typeof parsed.id === "string" && typeof parsed.target === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function loadJapaHistory(): JapaSession[] {
  try {
    const rows = JSON.parse(localStorage.getItem(JAPA_HISTORY_KEY) || "[]");
    return Array.isArray(rows) ? (rows as JapaSession[]) : [];
  } catch {
    return [];
  }
}

export function saveJapaSession(next: JapaSession): boolean {
  try {
    localStorage.setItem(JAPA_ACTIVE_KEY, JSON.stringify(next));
    const history = loadJapaHistory().filter((item) => item.id !== next.id);
    localStorage.setItem(JAPA_HISTORY_KEY, JSON.stringify([next, ...history]));
    return true;
  } catch {
    return false;
  }
}

export function clearActiveJapaSession(): boolean {
  try {
    localStorage.removeItem(JAPA_ACTIVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadJapaDisplay(): JapaDisplayPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(JAPA_DISPLAY_KEY) || "{}") as Partial<JapaDisplayPrefs>;
    const layoutId: JapaLayoutId =
      saved.layoutId === "rasayana" || saved.layoutId === "custom" ? saved.layoutId : "canon";
    const readingScale =
      typeof saved.readingScale === "number" &&
      Number.isFinite(saved.readingScale) &&
      saved.readingScale >= 0.85 &&
      saved.readingScale <= 1.6
        ? saved.readingScale
        : DEFAULT_JAPA_DISPLAY.readingScale;

    return {
      sanskrit: saved.sanskrit !== false,
      translation: saved.translation !== false,
      instruction: saved.instruction !== false,
      italicSanskrit: saved.italicSanskrit !== false,
      italicTranslation: saved.italicTranslation === true,
      italicInstruction: saved.italicInstruction !== false,
      readingScale,
      standMode: saved.standMode === true,
      leftHanded: saved.leftHanded === true,
      layoutId,
    };
  } catch {
    return { ...DEFAULT_JAPA_DISPLAY };
  }
}

export function saveJapaDisplay(next: JapaDisplayPrefs): boolean {
  try {
    localStorage.setItem(JAPA_DISPLAY_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function loadJapaCollections(): JapaCollections {
  try {
    const parsed = JSON.parse(localStorage.getItem(JAPA_COLLECTIONS_KEY) || "{}") as Partial<JapaCollections>;
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((id): id is string => typeof id === "string")
      : [];
    const customRoundIds: Record<number, string> = {};
    if (parsed.customRoundIds && typeof parsed.customRoundIds === "object") {
      for (const [k, v] of Object.entries(parsed.customRoundIds)) {
        const num = Number(k);
        if (Number.isInteger(num) && num >= 1 && typeof v === "string") {
          customRoundIds[num] = v;
        }
      }
    }
    return { favorites, customRoundIds };
  } catch {
    return { favorites: [], customRoundIds: {} };
  }
}

export function saveJapaCollections(next: JapaCollections): boolean {
  try {
    localStorage.setItem(JAPA_COLLECTIONS_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
