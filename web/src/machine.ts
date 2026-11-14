export type Phase =
  | "idle"
  | "countdown"
  | "running"
  | "resting"
  | "paused"
  | "completed";

export type PlayerState = {
  phase: Phase;
  index: number;
  round: number;
  rounds: number;
  length: number;
  /** Monotonic deadline for the current phase. Null while idle, paused, or completed. */
  deadline: number | null;
  /** Time left in the paused phase. */
  remainingMs: number | null;
  /** Phase to restore after pause. */
  held: Phase | null;
};

export function restMs(bpm: number, beats = 1): number {
  return beats * elementMs(bpm);
}

export function elementMs(bpm: number, beatsPerElement = 1): number {
  const beats = Number.isFinite(beatsPerElement) && beatsPerElement > 0 ? beatsPerElement : 1;
  const tempo = Number.isFinite(bpm) ? Math.min(240, Math.max(30, bpm)) : 60;
  return (60_000 / tempo) * beats;
}

/** Pronunciation time scales with letters; word and punctuation pauses remain tempo-based. */
export function beatMs(
  bpm: number,
  index: number,
  length: number,
  wordStarts: readonly number[],
  portion: number,
  elements: readonly string[] = [],
  punctuationPauses = false,
): number {
  const full = elementMs(bpm);
  const share = Number.isFinite(portion) ? Math.min(1, Math.max(0.2, portion)) : 1;
  const next = index + 1;
  const insideWord = next < length && !wordStarts.includes(next);
  const ending = elements[index] ?? "";
  const letters = Math.max(1, [...ending.normalize("NFC")].filter((character) => /\p{L}/u.test(character)).length);
  const pronunciation = full * share * letters;
  const multiplier = /[.!?…][»”"')\]]*$/u.test(ending) ? 1 : /[,;:][»”"')\]]*$/u.test(ending) ? 0.5 : 0;
  return pronunciation + (insideWord ? 0 : full * (1 - share) * (1 + (punctuationPauses ? multiplier : 0)));
}

/** Whole next word is shown during the pause after the current word, before its syllables start. */
export function previewWordIndex(
  state: PlayerState,
  now: number,
  wordStarts: readonly number[],
  bpm: number,
  portion: number,
  elements: readonly string[] = [],
  punctuationPauses = false,
): number | null {
  const phase = state.phase === "paused" ? state.held : state.phase;
  const share = Number.isFinite(portion) ? Math.min(1, Math.max(0.2, portion)) : 1;
  const wordPause = elementMs(bpm) * (1 - share);
  const left = state.phase === "paused"
    ? Math.max(0, state.remainingMs ?? 0)
    : state.deadline == null ? wordPause + 1 : Math.max(0, state.deadline - now);
  const candidate = (() => {
    if (phase === "countdown" || phase === "resting") return left <= wordPause ? 0 : null;
    if (phase !== "running") return null;
    const next = state.index + 1;
    const boundary = next >= state.length || wordStarts.includes(next);
    if (!boundary || next >= state.length) return null;
    const beat = beatMs(bpm, state.index, state.length, wordStarts, portion, elements, punctuationPauses);
    const letters = Math.max(1, [...(elements[state.index] ?? "").normalize("NFC")].filter((character) => /\p{L}/u.test(character)).length);
    if (beat - left < elementMs(bpm) * share * letters) return null;
    let word = 0;
    for (let start = 0; start < wordStarts.length; start += 1) {
      if (wordStarts[start] <= next) word = start;
    }
    return word;
  })();
  if (candidate == null || isSingleLetterWord(candidate, wordStarts, state.length, elements)) return null;
  return candidate;
}

function isSingleLetterWord(
  word: number,
  wordStarts: readonly number[],
  length: number,
  elements: readonly string[],
): boolean {
  const start = wordStarts[word] ?? 0;
  const end = wordStarts[word + 1] ?? length;
  return end - start === 1 && [...(elements[start] ?? "")].length === 1;
}

export function createPlayer(length: number, rounds: number): PlayerState {
  return {
    phase: "idle",
    index: 0,
    round: 1,
    rounds: Math.max(1, rounds),
    length: Math.max(1, length),
    deadline: null,
    remainingMs: null,
    held: null,
  };
}

export function start(state: PlayerState, now: number, manual: boolean, bpm = 60, countdownBeats = 2): PlayerState {
  if (state.phase === "paused") return resume(state, now);
  if (state.phase !== "idle" && state.phase !== "completed") return state;
  const base = {
    ...state,
    index: 0,
    round: 1,
    remainingMs: null,
    held: null,
  };
  if (manual) return { ...base, phase: "running", deadline: null };
  return { ...base, phase: "countdown", deadline: now + countdownBeats * elementMs(bpm) };
}

export function pause(state: PlayerState, now: number): PlayerState {
  if (state.phase !== "countdown" && state.phase !== "running" && state.phase !== "resting") {
    return state;
  }
  const remainingMs =
    state.deadline == null ? null : Math.max(0, state.deadline - now);
  return {
    ...state,
    phase: "paused",
    held: state.phase,
    deadline: null,
    remainingMs,
  };
}

export function resume(state: PlayerState, now: number): PlayerState {
  if (state.phase !== "paused" || state.held == null) return state;
  const deadline =
    state.remainingMs == null ? null : now + state.remainingMs;
  return {
    ...state,
    phase: state.held,
    held: null,
    deadline,
    remainingMs: null,
  };
}

export function cancel(state: PlayerState): PlayerState {
  return { ...createPlayer(state.length, state.rounds), phase: "idle" };
}

/** Move to the next or previous syllable, leaving countdown, rest, and the gap before a word. */
export function skipStep(
  state: PlayerState,
  delta: number,
  now: number,
  span: (index: number) => number,
  options?: { manual?: boolean; inWordPause?: boolean },
): PlayerState {
  if (state.phase === "completed") return state;
  const manual = options?.manual ?? false;
  const phase = state.phase === "paused" ? state.held : state.phase;
  const run = (round: number, index: number): PlayerState => ({
    ...state,
    phase: "running",
    round,
    index,
    deadline: manual ? null : now + Math.max(1, span(index)),
    held: null,
    remainingMs: null,
  });

  if (delta > 0) {
    if (phase === "countdown" || phase === "idle" || phase == null) return run(Math.max(1, state.round), state.index);
    if (phase === "resting") {
      if (state.round >= state.rounds) {
        return { ...state, phase: "completed", deadline: null, held: null, remainingMs: null };
      }
      return run(state.round + 1, 0);
    }
    if (state.index < state.length - 1) return run(state.round, state.index + 1);
    if (state.round < state.rounds) return run(state.round + 1, 0);
    return { ...state, phase: "completed", deadline: null, held: null, remainingMs: null };
  }

  if (options?.inWordPause && phase === "running") return run(state.round, state.index);
  if (phase === "resting") return run(state.round, state.length - 1);
  if (phase === "countdown" || phase === "idle" || phase == null) return state;
  if (state.index > 0) return run(state.round, state.index - 1);
  if (state.round > 1) return run(state.round - 1, state.length - 1);
  return state;
}

export function step(
  state: PlayerState,
  delta: number,
  clock?: { now: number; stepDuration: number },
): PlayerState {
  if (state.phase === "completed") return state;
  const index = clamp(state.index + delta, 0, state.length - 1);
  const stepDuration = clock && Number.isFinite(clock.stepDuration) && clock.stepDuration > 0
    ? clock.stepDuration
    : null;
  const deadline = state.phase === "running" && state.deadline != null && clock && stepDuration != null
    ? clock.now + stepDuration
    : state.deadline;
  return { ...state, index, deadline };
}

/** Advance automatic phases. One call consumes every deadline already due. */
export function tick(
  state: PlayerState,
  now: number,
  stepDuration: number | ((index: number) => number),
  restDuration = elementMs(60),
): PlayerState {
  const span = (index: number) => {
    const value = typeof stepDuration === "function" ? stepDuration(index) : stepDuration;
    return Number.isFinite(value) && value > 0 ? value : elementMs(60);
  };
  let next = state;
  for (let i = 0; i < 10_000; i += 1) {
    if (next.deadline == null || now < next.deadline) return next;
    if (next.phase === "countdown") {
      next = { ...next, phase: "running", deadline: next.deadline + span(next.index) };
      continue;
    }
    if (next.phase === "running") {
      if (next.index < next.length - 1) {
        const index = next.index + 1;
        next = { ...next, index, deadline: next.deadline + span(index) };
        continue;
      }
      if (next.round >= next.rounds) {
        return { ...next, phase: "completed", deadline: null, remainingMs: null, held: null };
      }
      next = {
        ...next,
        phase: "resting",
        deadline: next.deadline + restDuration,
      };
      continue;
    }
    if (next.phase === "resting") {
      next = {
        ...next,
        phase: "running",
        round: next.round + 1,
        index: 0,
        deadline: next.deadline + span(0),
      };
      continue;
    }
    return next;
  }
  return next;
}

/** 0 at the start of the exercise, 1 when the last syllable of the last round ends. */
export function progressRatio(state: PlayerState, now: number, stepDuration: number): number {
  const total = state.rounds * state.length;
  if (total <= 0) return 0;
  if (state.phase === "completed") return 1;
  let done = (state.round - 1) * state.length + state.index;
  const stepMs = Number.isFinite(stepDuration) && stepDuration > 0 ? stepDuration : 0;
  if (state.phase === "running" && state.deadline != null && stepMs > 0) {
    done += 1 - clamp((state.deadline - now) / stepMs, 0, 1);
  } else if (state.phase === "paused" && state.held === "running" && state.remainingMs != null && stepMs > 0) {
    done += 1 - clamp(state.remainingMs / stepMs, 0, 1);
  } else if (state.phase === "resting") {
    done = state.round * state.length;
  }
  return clamp(done / total, 0, 1);
}

export function roundMs(length: number, wordStarts: readonly number[], bpm: number, portion: number, elements: readonly string[] = [], punctuationPauses = false): number {
  let sum = 0;
  for (let index = 0; index < length; index += 1) sum += beatMs(bpm, index, length, wordStarts, portion, elements, punctuationPauses);
  return sum;
}

export function exercisePlanMs(
  length: number,
  wordStarts: readonly number[],
  bpm: number,
  rounds: number,
  portion: number,
  countdownBeats = 2,
  restBeats = 1,
  elements: readonly string[] = [],
  punctuationPauses = false,
): number {
  const cycles = Math.max(1, rounds);
  const round = roundMs(length, wordStarts, bpm, portion, elements, punctuationPauses);
  return countdownBeats * elementMs(bpm) + cycles * round + Math.max(0, cycles - 1) * restMs(bpm, restBeats);
}

export function remainingExerciseMs(
  state: PlayerState,
  now: number,
  wordStarts: readonly number[],
  bpm: number,
  portion: number,
  countdownBeats = 2,
  restBeats = 1,
  elements: readonly string[] = [],
  punctuationPauses = false,
): number {
  if (state.phase === "completed") return 0;
  if (state.phase === "idle") return exercisePlanMs(state.length, wordStarts, bpm, state.rounds, portion, countdownBeats, restBeats, elements, punctuationPauses);
  const round = roundMs(state.length, wordStarts, bpm, portion, elements, punctuationPauses);
  const phase = state.phase === "paused" ? state.held : state.phase;
  const leftNow = state.phase === "paused"
    ? Math.max(0, state.remainingMs ?? 0)
    : state.deadline == null ? 0 : Math.max(0, state.deadline - now);
  if (phase === "countdown") {
    return leftNow + state.rounds * round + Math.max(0, state.rounds - 1) * restMs(bpm, restBeats);
  }
  if (phase === "running") {
    let after = 0;
    for (let index = state.index + 1; index < state.length; index += 1) {
      after += beatMs(bpm, index, state.length, wordStarts, portion, elements, punctuationPauses);
    }
    const rests = Math.max(0, state.rounds - state.round);
    return leftNow + after + rests * round + rests * restMs(bpm, restBeats);
  }
  if (phase === "resting") {
    const later = Math.max(0, state.rounds - state.round);
    return leftNow + later * round + Math.max(0, later - 1) * restMs(bpm, restBeats);
  }
  return exercisePlanMs(state.length, wordStarts, bpm, state.rounds, portion, countdownBeats, restBeats, elements, punctuationPauses);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
