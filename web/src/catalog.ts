import { budgetsForStep } from "./budget";
import { expandParts } from "./syllables";
import vowelsJson from "../data/vowels.json";
import consonantsJson from "../data/consonants.json";
import twistersJson from "../data/tongue_twisters.json";
import programsJson from "../data/programs.json";

export type Category = "vowels" | "consonants" | "mixed" | "tongue_twisters";

export type Exercise = {
  id: string;
  type: "sequence" | "tongue_twister";
  category: Category;
  title: string;
  group?: string;
  difficulty: number;
  elements: string[];
  wordStarts: number[];
  text?: string;
  note?: string;
};

export type Program = {
  id: string;
  title: string;
  durationMinutesTarget: number;
  steps: { title: string; minutes: number; exerciseIds: string[] }[];
};

type Vowel = {
  id: string;
  title: string;
  difficulty: number;
  elements?: string[];
  note?: string | null;
};

type ConsonantLevel = { id: string; title: string; difficulty: number; text: string };
type ConsonantGroup = {
  id: string;
  title: string;
  letters: string;
  description: string;
  levels: ConsonantLevel[];
};

type Twister = {
  id: string;
  title: string;
  topic?: string;
  difficulty: number;
  text: string;
  segments?: string[];
};

const vowels: Exercise[] = (vowelsJson as Vowel[]).map((item) => {
  const expanded = expandParts(item.elements?.length ? item.elements : [item.title]);
  return {
    id: item.id,
    type: "sequence" as const,
    category: "vowels" as const,
    title: item.title,
    difficulty: item.difficulty,
    elements: expanded.elements,
    wordStarts: expanded.wordStarts,
    note: item.note ?? undefined,
  };
});

const consonants: Exercise[] = (consonantsJson as ConsonantGroup[]).flatMap((group) =>
  group.levels.map((level) => ({
    id: `${group.id}-${level.id}`,
    type: "sequence" as const,
    category: "consonants" as const,
    title: `${group.title} · ${level.title}`,
    group: `${group.title} ${group.letters}`,
    difficulty: level.difficulty,
    ...expandParts([level.text]),
    text: level.text,
    note: group.description,
  })),
);

const twisters: Exercise[] = (twistersJson as Twister[]).map((item) => ({
  id: item.id,
  type: "tongue_twister",
  category: "tongue_twisters",
  title: item.title,
  group: item.topic,
  difficulty: item.difficulty,
  ...expandParts(item.segments?.length ? item.segments : [item.text]),
  text: item.text,
}));

export const exercises: Exercise[] = [...vowels, ...consonants, ...twisters];

const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

export function exerciseById(id: string): Exercise | undefined {
  return byId.get(id);
}

export function exercisesIn(category: Category): Exercise[] {
  return exercises.filter((exercise) => exercise.category === category);
}

type ProgramJson = {
  id: string;
  title: string;
  durationMinutesTarget: number;
  steps: { title: string; minutes: number; exerciseIds: string[] }[];
};

export const programs: Program[] = (programsJson as ProgramJson[]).map((program) => ({
  id: program.id,
  title: program.title,
  durationMinutesTarget: program.durationMinutesTarget,
  steps: program.steps.map((step) => ({
    title: step.title,
    minutes: step.minutes,
    exerciseIds: step.exerciseIds,
  })),
}));

export function programById(id: string): Program | undefined {
  return programs.find((program) => program.id === id);
}

export function programPlaylist(
  program: Program,
): { exercise: Exercise; stepTitle: string; budgetMs: number }[] {
  return program.steps.flatMap((step) => {
    const found = step.exerciseIds.flatMap((id) => {
      const exercise = exerciseById(id);
      return exercise ? [exercise] : [];
    });
    const budgets = budgetsForStep(step.minutes, found.length);
    return found.map((exercise, index) => ({
      exercise,
      stepTitle: step.title,
      budgetMs: budgets[index] ?? 0,
    }));
  });
}
