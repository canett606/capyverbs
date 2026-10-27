import { SKILLS, blankSkill } from "./scheduler";
import type { Meta, Profile, SkillState, VerbProgress } from "./types";

export interface ProgressFile {
  format: "capyverbs-progress";
  version: 1;
  exportedAt: string;
  profile: Profile;
  verbs: VerbProgress[];
  meta: Meta;
}

const COLORS = new Set(["cocoa", "caramel", "cream"]);
const MODES = new Set(["sheet", "standard"]);

export function defaultProfile(): Profile {
  return {
    nickname: "Capibara",
    color: "cocoa",
    hat: "none",
    accessory: "none",
    sound: false,
    reducedMotion: false,
    variantMode: "sheet",
    examFrom: 1,
    examTo: 75,
    intensive: false,
  };
}

export function defaultMeta(): Meta {
  return { version: 1, sessions: 0, days: [], adventureUnlocked: 1, named: false };
}

export function validateProgress(input: unknown): ProgressFile {
  if (!input || typeof input !== "object") throw new Error("El archivo no es un JSON de CapyVerbs");
  const data = input as Partial<ProgressFile>;
  if (data.format !== "capyverbs-progress" || data.version !== 1) {
    throw new Error("Formato no reconocido");
  }
  if (!data.profile || !data.meta || !Array.isArray(data.verbs)) throw new Error("Faltan datos");
  const profile = sanitizeProfile(data.profile);
  const meta = sanitizeMeta(data.meta);
  const verbs = data.verbs.map(sanitizeVerb);
  const ids = new Set(verbs.map((verb) => verb.verbId));
  if (ids.size !== verbs.length) throw new Error("Hay verbos repetidos");
  return {
    format: "capyverbs-progress",
    version: 1,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date(0).toISOString(),
    profile,
    verbs,
    meta,
  };
}

function sanitizeProfile(value: Profile): Profile {
  const base = defaultProfile();
  const nickname = String(value.nickname ?? "").replace(/\s+/g, " ").trim().slice(0, 16);
  return {
    nickname: nickname || base.nickname,
    color: COLORS.has(value.color) ? value.color : base.color,
    hat: typeof value.hat === "string" ? value.hat.slice(0, 24) : "none",
    accessory: typeof value.accessory === "string" ? value.accessory.slice(0, 24) : "none",
    sound: Boolean(value.sound),
    reducedMotion: Boolean(value.reducedMotion),
    variantMode: MODES.has(value.variantMode) ? value.variantMode : "sheet",
    examFrom: clampVerb(value.examFrom, 1),
    examTo: clampVerb(value.examTo, 75),
    intensive: Boolean(value.intensive),
  };
}

function sanitizeMeta(value: Partial<Meta>): Meta {
  return {
    version: 1,
    sessions: Math.max(0, Math.floor(Number(value.sessions) || 0)),
    days: Array.isArray(value.days) ? value.days.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)).slice(0, 4000) : [],
    adventureUnlocked: Math.max(1, Math.min(15, Math.floor(Number(value.adventureUnlocked) || 1))),
    named: Boolean(value.named),
  };
}

function sanitizeVerb(value: VerbProgress): VerbProgress {
  const verbId = clampVerb(value.verbId, 0);
  if (verbId < 1 || verbId > 75) throw new Error("Verbo fuera de la ficha");
  const skills = {} as VerbProgress["skills"];
  for (const skill of SKILLS) {
    skills[skill] = sanitizeSkill(value.skills?.[skill]);
  }
  return { verbId, introduced: Boolean(value.introduced), skills };
}

function sanitizeSkill(value: SkillState | undefined): SkillState {
  const blank = blankSkill();
  if (!value) return blank;
  const days = Array.isArray(value.unaidedDays)
    ? value.unaidedDays.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    : [];
  return {
    level: Math.max(0, Math.min(6, Math.floor(Number(value.level) || 0))),
    attempts: Math.max(0, Math.floor(Number(value.attempts) || 0)),
    fails: Math.max(0, Math.floor(Number(value.fails) || 0)),
    hints: Math.max(0, Math.floor(Number(value.hints) || 0)),
    lastPractice: typeof value.lastPractice === "number" ? value.lastPractice : null,
    nextReview: typeof value.nextReview === "number" ? value.nextReview : null,
    unaidedDays: [...new Set(days)].slice(0, 400),
  };
}

function clampVerb(value: number, fallback: number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}
