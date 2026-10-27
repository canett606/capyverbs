import { mulberry32 } from "./questions";
import type { VariantMode, Verb } from "./types";
import { VERBS } from "./verbs";

export const HANGMAN_MISSES = 6;
export const HANGMAN_VERBS = 5;

export interface HangmanPuzzle {
  verbId: number;
  skills: Array<"past" | "participle">;
  /** Nombre corto en español. */
  label: string;
  /** Nombre de la columna en la ficha. */
  eyebrow: string;
  /** Grafía en minúsculas. La barra de was/were se queda visible. */
  solution: string;
}

export interface HangmanBoard {
  guessed: string[];
  misses: number;
  status: "playing" | "won" | "lost";
}

export function emptyBoard(): HangmanBoard {
  return { guessed: [], misses: 0, status: "playing" };
}

export function hangmanPuzzlesForVerb(verb: Verb, mode: VariantMode): HangmanPuzzle[] {
  const past = verb.past.toLowerCase();
  const participle = verb.participle.toLowerCase();
  const puzzles: HangmanPuzzle[] = [];
  if (past === participle) {
    puzzles.push({
      verbId: verb.id,
      skills: ["past", "participle"],
      label: "Pasado y participio",
      eyebrow: "Past simple y past participle",
      solution: past,
    });
  } else {
    puzzles.push({
      verbId: verb.id,
      skills: ["past"],
      label: verb.id === 1 ? "Las dos formas" : "Pasado",
      eyebrow: "Past simple",
      solution: past,
    });
    puzzles.push({
      verbId: verb.id,
      skills: ["participle"],
      label: "Participio",
      eyebrow: "Past participle",
      solution: participle,
    });
  }
  if (mode !== "standard") return puzzles;

  const pastVariants = unique(verb.variants.past.map((form) => form.toLowerCase()));
  const participleVariants = unique(verb.variants.participle.map((form) => form.toLowerCase()));
  const shared = pastVariants.filter((form) => participleVariants.includes(form) && form !== past && form !== participle);
  for (const form of shared) {
    puzzles.push({
      verbId: verb.id,
      skills: ["past", "participle"],
      label: "También se escribe",
      eyebrow: "Variante estándar",
      solution: form,
    });
  }
  for (const form of pastVariants) {
    if (form === past || shared.includes(form)) continue;
    puzzles.push({
      verbId: verb.id,
      skills: ["past"],
      label: "Pasado, otra forma",
      eyebrow: "Variante estándar",
      solution: form,
    });
  }
  for (const form of participleVariants) {
    if (form === participle || form === past || shared.includes(form)) continue;
    puzzles.push({
      verbId: verb.id,
      skills: ["participle"],
      label: "Participio, otra forma",
      eyebrow: "Variante estándar",
      solution: form,
    });
  }
  return puzzles;
}

export function planHangman(input: {
  mode: VariantMode;
  levels: Readonly<Record<number, { past: number; participle: number } | undefined>>;
  from: number;
  to: number;
  seed: number;
  /** Tope opcional. Sin él, entran todos los verbos del tramo, en el orden de la ficha. */
  verbCount?: number;
}): HangmanPuzzle[] {
  const start = clampVerb(Math.min(input.from, input.to));
  const end = clampVerb(Math.max(input.from, input.to));
  const pool = VERBS.filter((verb) => verb.id >= start && verb.id <= end);
  if (input.verbCount === undefined) {
    return pool.flatMap((verb) => hangmanPuzzlesForVerb(verb, input.mode));
  }
  const count = Math.max(0, Math.min(pool.length, input.verbCount));
  const random = mulberry32(input.seed);
  const ranked = pool.map((verb) => {
    const row = input.levels[verb.id];
    const score = row ? row.past + row.participle : 0;
    return { verb, score, roll: random() };
  });
  ranked.sort((a, b) => a.score - b.score || a.roll - b.roll);
  return ranked.slice(0, count).flatMap(({ verb }) => hangmanPuzzlesForVerb(verb, input.mode));
}

function clampVerb(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(VERBS.length, Math.floor(value)));
}

export function applyGuess(solution: string, board: HangmanBoard, raw: string): HangmanBoard {
  if (board.status !== "playing") return board;
  const letter = raw.toLowerCase();
  if (!/^[a-z]$/.test(letter) || board.guessed.includes(letter)) return board;
  const guessed = [...board.guessed, letter];
  const hit = [...solution].some((char) => char === letter);
  const misses = hit ? board.misses : board.misses + 1;
  const won = [...solution].every((char) => !/[a-z]/.test(char) || guessed.includes(char));
  const status = won ? "won" : misses >= HANGMAN_MISSES ? "lost" : "playing";
  return { guessed, misses, status };
}

export function noteSpoilsAnswer(note: string | undefined, solution: string): boolean {
  if (!note) return false;
  const haystack = note.toLowerCase();
  return solution
    .split(/[^a-z]+/)
    .filter((part) => part.length > 0)
    .some((part) => haystack.includes(part));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
