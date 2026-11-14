import assert from "node:assert/strict";
import { budgetsForStep } from "../src/budget.ts";
import { beatsOf, displayRows, syllablesOfWord, wordLines } from "../src/syllables.ts";
import programs from "../data/programs.json" with { type: "json" };
import {
  cancel,
  createPlayer,
  elementMs,
  pause,
  resume,
  beatMs,
  exercisePlanMs,
  previewWordIndex,
  progressRatio,
  remainingExerciseMs,
  skipStep,
  start,
  step,
  tick,
} from "../src/machine.ts";

const STEP = elementMs(60);
const COUNTDOWN_MS = 2 * STEP;
const REST_MS = STEP;

function playTo(state, now, stepDuration = STEP) {
  return tick(state, now, stepDuration);
}

const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}`);
    console.log(error instanceof Error ? error.stack : error);
  }
}

check("pause then resume keeps the same countdown remainder", () => {
  const started = start(createPlayer(3, 2), 0, false);
  const paused = pause(started, 1_000);
  assert.equal(paused.phase, "paused");
  assert.equal(paused.remainingMs, COUNTDOWN_MS - 1_000);
  const continued = resume(paused, 50_000);
  assert.equal(continued.phase, "countdown");
  assert.equal(continued.deadline, 50_000 + COUNTDOWN_MS - 1_000);
  const early = tick(continued, continued.deadline - 1, STEP);
  assert.equal(early.phase, "countdown");
  const due = tick(continued, continued.deadline, STEP);
  assert.equal(due.phase, "running");
  assert.equal(due.index, 0);
});

check("a full timed run visits every element of every round once", () => {
  let state = start(createPlayer(3, 2), 0, false);
  const seen = [];
  let now = 0;
  for (let i = 0; i < 30 && state.phase !== "completed"; i += 1) {
    now = state.deadline;
    const before = `${state.phase}:${state.round}:${state.index}`;
    state = tick(state, now, STEP);
    if (state.phase === "running") seen.push(`${state.round}:${state.index}`);
    assert.notEqual(before, `${state.phase}:${state.round}:${state.index}:${state.deadline}`);
  }
  assert.equal(state.phase, "completed");
  assert.deepEqual(seen, ["1:0", "1:1", "1:2", "2:0", "2:1", "2:2"]);
});

check("background catch-up lands on the element owed by the clock", () => {
  let state = start(createPlayer(4, 1), 0, false);
  state = tick(state, COUNTDOWN_MS, 1_000);
  assert.equal(state.phase, "running");
  assert.equal(state.index, 0);
  state = tick(state, COUNTDOWN_MS + 2_500, 1_000);
  assert.equal(state.index, 2);
  assert.equal(state.phase, "running");
  assert.ok(state.deadline > COUNTDOWN_MS + 2_500);
});

check("arrow from idle then start still enters the timed countdown", () => {
  let state = step(createPlayer(4, 1), 1);
  assert.equal(state.index, 1);
  assert.equal(state.phase, "idle");
  state = start(state, 10_000, false);
  assert.equal(state.phase, "countdown");
  assert.equal(state.deadline, 10_000 + COUNTDOWN_MS);
});

check("manual next during a timed element restarts that element's window", () => {
  let state = start(createPlayer(4, 1), 0, false);
  state = tick(state, COUNTDOWN_MS, 1_000);
  const previousDeadline = state.deadline;
  const now = previousDeadline - 400;
  state = step(state, 1, { now, stepDuration: 1_000 });
  assert.equal(state.index, 1);
  assert.equal(state.deadline, now + 1_000);
  const early = tick(state, previousDeadline, 1_000);
  assert.equal(early.index, 1);
  assert.equal(early.phase, "running");
});

check("non-finite tempo does not collapse the exercise in one tick", () => {
  let state = start(createPlayer(4, 2), 0, false);
  state = tick(state, COUNTDOWN_MS, elementMs(Number.NaN));
  assert.equal(state.phase, "running");
  assert.equal(state.index, 0);
  assert.ok(Number.isFinite(state.deadline));
});

check("program block budgets add up to the stated minutes", () => {
  assert.equal(budgetsForStep(3, 2).reduce((sum, item) => sum + item, 0), 180_000);
  for (const program of programs) {
    const sum = program.steps.reduce((total, step) => total + step.minutes * 60_000, 0);
    assert.equal(sum, program.durationMinutesTarget * 60_000);
    for (const step of program.steps) {
      const parts = budgetsForStep(step.minutes, Math.max(1, step.minutes));
      assert.equal(parts.reduce((total, item) => total + item, 0), step.minutes * 60_000);
    }
  }
});

check("the bar reaches the end on the last syllable", () => {
  let state = start(createPlayer(4, 1), 0, false);
  state = tick(state, COUNTDOWN_MS, 1_000);
  assert.equal(progressRatio(state, COUNTDOWN_MS, 1_000), 0);
  state = tick(state, COUNTDOWN_MS + 3_000, 1_000);
  assert.equal(state.index, 3);
  assert.equal(state.phase, "running");
  assert.ok(progressRatio(state, COUNTDOWN_MS + 3_000, 1_000) > 0.74);
  assert.equal(progressRatio(state, state.deadline, 1_000), 1);
  state = tick(state, state.deadline, 1_000);
  assert.equal(state.phase, "completed");
  assert.equal(progressRatio(state, 0, 1_000), 1);
});

check("exercise and block clocks include every round and the countdown", () => {
  const starts = [0];
  const plan = exercisePlanMs(1, starts, 60, 2, 1);
  assert.equal(plan, COUNTDOWN_MS + elementMs(60) * 2 + REST_MS);
  const idle = remainingExerciseMs(createPlayer(1, 2), 0, starts, 60, 1);
  assert.equal(idle, plan);
  let state = start(createPlayer(1, 2), 0, false);
  state = tick(state, COUNTDOWN_MS, elementMs(60));
  state = tick(state, state.deadline, elementMs(60));
  assert.equal(state.phase, "resting");
  const left = remainingExerciseMs(state, state.deadline, starts, 60, 1);
  assert.equal(left, elementMs(60));
});

check("syllables inside a dashed word keep a shorter beat than the word boundary", () => {
  const starts = [0];
  const full = elementMs(60);
  assert.equal(beatMs(60, 0, 3, starts, 0.5), full * 0.5);
  assert.equal(beatMs(60, 1, 3, starts, 0.5), full * 0.5);
  assert.equal(beatMs(60, 2, 3, starts, 0.5), full);
  let state = start(createPlayer(3, 1), 0, false);
  const clock = (index) => beatMs(60, index, 3, starts, 0.5);
  state = tick(state, COUNTDOWN_MS, clock);
  assert.equal(state.deadline, COUNTDOWN_MS + full * 0.5);
  state = tick(state, state.deadline, clock);
  state = tick(state, state.deadline, clock);
  assert.equal(state.index, 2);
  assert.equal(state.deadline, COUNTDOWN_MS + full * 2);
});

check("the pause before the next word previews that whole word", () => {
  const starts = [0, 2];
  const lines = wordLines(["Бо", "бёр", "бо"], starts);
  assert.equal(lines.length, 2);
  assert.equal(displayRows(["А", "И", "А", "И", "А"], [0, 1, 2, 3, 4]).length, 1);
  assert.deepEqual(lines[0].map((item) => item.text), ["Бо", "бёр"]);
  let state = start(createPlayer(3, 1), 0, false);
  const full = elementMs(60);
  const clock = (index) => beatMs(60, index, 3, starts, 0.5);
  state = tick(state, COUNTDOWN_MS, clock);
  state = tick(state, state.deadline, clock);
  assert.equal(state.index, 1);
  const text = ["Бо", "бёр", "бо"];
  assert.equal(previewWordIndex(state, state.deadline - full, starts, 60, 0.5, text), null);
  assert.equal(previewWordIndex(state, state.deadline - full * 0.4, starts, 60, 0.5, text), 1);
  const letters = createPlayer(3, 1);
  assert.equal(previewWordIndex(letters, 0, [0, 1, 2], 60, 0.5, ["А", "И", "А"]), null);
  const before = start(createPlayer(3, 1), 0, false);
  assert.equal(before.phase, "countdown");
  assert.equal(previewWordIndex(before, 0, starts, 60, 0.5, text), null);
  const opening = elementMs(60) * 0.5;
  assert.equal(previewWordIndex(before, COUNTDOWN_MS - opening / 2, starts, 60, 0.5, text), 0);
});

check("a dash chain and a written word become one syllable per beat", () => {
  assert.deepEqual(beatsOf("ПА–БА–МА").map((beat) => beat.text), ["ПА", "БА", "МА"]);
  assert.deepEqual(syllablesOfWord("Бобёр"), ["Бо", "бёр"]);
  assert.deepEqual(syllablesOfWord("бормотал"), ["бо", "рмо", "тал"]);
  assert.deepEqual(beatsOf("А–О–У").map((beat) => beat.text), ["А", "О", "У"]);
  const phrase = beatsOf("Бобёр бормотал");
  assert.deepEqual(phrase.map((beat) => beat.text), ["Бо", "бёр", "бо", "рмо", "тал"]);
  assert.deepEqual(phrase.filter((beat) => beat.wordStart).map((beat) => beat.text), ["Бо", "бо"]);
});

check("forward and back skip the countdown, the rest, and the gap before a word", () => {
  const span = () => 1000;
  let state = start(createPlayer(2, 2), 0, false);
  assert.equal(state.phase, "countdown");
  state = skipStep(state, 1, 10, span);
  assert.equal(state.phase, "running");
  assert.equal(state.index, 0);
  assert.equal(state.deadline, 1010);
  state = skipStep({ ...state, index: 1 }, 1, 50, span);
  assert.equal(state.round, 2);
  assert.equal(state.index, 0);
  assert.equal(state.phase, "running");
  state = { ...state, phase: "resting", deadline: 9000 };
  state = skipStep(state, -1, 20, span);
  assert.equal(state.phase, "running");
  assert.equal(state.index, 1);
  state = skipStep(state, -1, 30, span, { inWordPause: true });
  assert.equal(state.index, 1);
  assert.equal(state.phase, "running");
});

check("cancel returns to a startable idle player", () => {
  let state = start(createPlayer(2, 3), 0, false);
  state = cancel(state);
  assert.equal(state.phase, "idle");
  state = start(state, 5, false);
  assert.equal(state.phase, "countdown");
});

if (failures.length > 0) {
  console.error(`verify failures: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("all player logic checks passed");
