import { isMastered } from "./scheduler";
import type { VerbProgress } from "./types";

export interface RewardStats {
  sessions: number;
  days: number;
  practicedVerbs: number;
  mastered: number;
}

export interface Cosmetic {
  id: string;
  name: string;
  kind: "hat" | "accessory";
  test: (stats: RewardStats) => boolean;
}

/** Solo cambian el dibujo. No modifican puntos ni la dificultad. */
export const COSMETICS: Cosmetic[] = [
  { id: "none", name: "Sin complemento", kind: "hat", test: () => true },
  { id: "leaf", name: "Hoja", kind: "hat", test: (stats) => stats.sessions >= 1 },
  { id: "orange", name: "Naranja", kind: "accessory", test: (stats) => stats.days >= 3 },
  { id: "flower", name: "Flor", kind: "hat", test: (stats) => stats.practicedVerbs >= 10 },
  { id: "sailor", name: "Marinero", kind: "hat", test: (stats) => stats.mastered >= 5 },
  { id: "crown", name: "Corona", kind: "hat", test: (stats) => stats.mastered >= 25 },
];

export function rewardStats(progress: VerbProgress[], sessions: number, days: string[]): RewardStats {
  return {
    sessions,
    days: days.length,
    practicedVerbs: progress.filter((verb) => verb.introduced).length,
    mastered: progress.filter((verb) => isMastered(verb)).length,
  };
}

export function isUnlocked(id: string, stats: RewardStats): boolean {
  const item = COSMETICS.find((cosmetic) => cosmetic.id === id);
  return Boolean(item?.test(stats));
}
