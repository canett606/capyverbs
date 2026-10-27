export type VariantMode = "sheet" | "standard";

export type Skill = "meaning" | "infinitive" | "past" | "participle";

export type Pattern = "identical" | "past_eq_participle" | "three" | "special";

export type CapyColor = "cocoa" | "caramel" | "cream";

export interface Verb {
  id: number;
  infinitive: string;
  past: string;
  participle: string;
  spanish: string;
  pattern: Pattern;
  /** Variantes de diccionario revisadas. Solo valen en modo «Variantes estándar». */
  variants: { past: string[]; participle: string[] };
  contrasts: number[];
  note?: string;
  phonetic?: { infinitive: string; past: string };
}

export interface Choice {
  id: string;
  label: string;
}

export type WriteSpec =
  | { form: "infinitive" }
  | { form: "spanish" }
  | { form: "past"; pair: false }
  | { form: "past"; pair: true }
  | { form: "past_subject"; expect: "was" | "were" }
  | { form: "participle" }
  | { form: "both" };

export type Question =
  | {
      kind: "choice";
      skill: Skill;
      verbId: number;
      prompt: string;
      help?: string;
      options: Choice[];
      correctId: string;
      written: false;
    }
  | {
      kind: "write";
      skill: Skill;
      verbId: number;
      prompt: string;
      help?: string;
      placeholder: string;
      write: WriteSpec;
      written: true;
    };

export interface SkillState {
  level: number;
  attempts: number;
  fails: number;
  hints: number;
  lastPractice: number | null;
  nextReview: number | null;
  unaidedDays: string[];
}

export interface VerbProgress {
  verbId: number;
  introduced: boolean;
  skills: Record<Skill, SkillState>;
}

export interface Profile {
  nickname: string;
  color: CapyColor;
  hat: string;
  accessory: string;
  sound: boolean;
  reducedMotion: boolean;
  variantMode: VariantMode;
  examFrom: number;
  examTo: number;
  intensive: boolean;
}

export interface Meta {
  version: 1;
  sessions: number;
  days: string[];
  adventureUnlocked: number;
  named: boolean;
}

export type PlanRole = "present" | "intro" | "recall" | "review" | "filler" | "retry";

export interface PlanItem {
  verbId: number;
  role: PlanRole;
  question: Question | null;
}
