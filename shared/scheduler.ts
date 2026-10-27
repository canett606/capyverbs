import type { Skill, SkillState, VerbProgress } from "./types";

/** Política inicial configurable, no un algoritmo científico optimizado. */
export const INTERVALS_MS = [
  10 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  14 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
] as const;

export const SKILLS: Skill[] = ["meaning", "infinitive", "past", "participle"];

export function blankSkill(): SkillState {
  return {
    level: 0,
    attempts: 0,
    fails: 0,
    hints: 0,
    lastPractice: null,
    nextReview: null,
    unaidedDays: [],
  };
}

export function blankProgress(verbId: number): VerbProgress {
  return {
    verbId,
    introduced: false,
    skills: {
      meaning: blankSkill(),
      infinitive: blankSkill(),
      past: blankSkill(),
      participle: blankSkill(),
    },
  };
}

export interface OutcomeInput {
  now: number;
  day: string;
  correct: boolean;
  helped: boolean;
  /** Escritura sin opciones. El reconocimiento pesa menos y no cuenta para «dominado». */
  written: boolean;
}

export function applyOutcome(skill: SkillState, input: OutcomeInput): SkillState {
  const next: SkillState = {
    ...skill,
    unaidedDays: skill.unaidedDays.slice(),
    attempts: skill.attempts + 1,
    lastPractice: input.now,
  };
  if (!input.correct) {
    next.fails += 1;
    if (input.helped) next.hints += 1;
    next.level = Math.max(0, skill.level - 1);
    next.nextReview = input.now;
    return next;
  }
  if (input.helped) {
    next.hints += 1;
    next.nextReview = input.now + INTERVALS_MS[0];
    return next;
  }
  if (!input.written) {
    if (skill.level < 1) {
      next.level = 1;
      next.nextReview = input.now + INTERVALS_MS[0];
    } else {
      next.level = skill.level;
      const current = INTERVALS_MS[Math.min(skill.level, INTERVALS_MS.length) - 1];
      next.nextReview = input.now + Math.max(INTERVALS_MS[0], Math.floor(current / 2));
    }
    return next;
  }
  next.level = Math.min(INTERVALS_MS.length, skill.level + 1);
  next.nextReview = input.now + INTERVALS_MS[next.level - 1];
  if (!next.unaidedDays.includes(input.day)) next.unaidedDays.push(input.day);
  return next;
}

export function isSkillDue(skill: SkillState, now: number): boolean {
  return skill.nextReview !== null && skill.nextReview <= now;
}

export function isVerbDue(progress: VerbProgress, now: number): boolean {
  return SKILLS.some((skill) => isSkillDue(progress.skills[skill], now));
}

/** Dominado: recuerdo escrito sin pistas en 3 días distintos, en significado, pasado y participio. */
export function isMastered(progress: VerbProgress): boolean {
  return (["meaning", "past", "participle"] as Skill[]).every(
    (skill) => progress.skills[skill].unaidedDays.length >= 3,
  );
}

export function practicedOn(progress: VerbProgress, day: string): boolean {
  return SKILLS.some((skill) => {
    const last = progress.skills[skill].lastPractice;
    return progress.skills[skill].unaidedDays.includes(day) || (last !== null && dayOf(last) === day);
  });
}

export function dayOf(timestamp: number): string {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function localDay(now = Date.now()): string {
  return dayOf(now);
}
