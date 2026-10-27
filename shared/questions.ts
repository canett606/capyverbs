import { correctChoiceId, infinitiveChoices, meaningChoices, shuffle } from "./distractors";
import { acceptedNormalized, expectedDisplay } from "./grade";
import type { Question, Skill, VariantMode, Verb, WriteSpec } from "./types";
import { getVerb, patternBlurb } from "./verbs";

export function presentText(verb: Verb): { title: string; lines: string[]; help?: string } {
  return {
    title: verb.infinitive,
    lines: [
      `${verb.infinitive} → ${verb.past} → ${verb.participle}`,
      verb.spanish,
      patternBlurb(verb),
    ],
    help: verb.note,
  };
}

export function introQuestion(verb: Verb, rng: () => number): Question {
  const skillRoll = rng();
  if (skillRoll < 0.5) {
    const options = meaningChoices(verb, rng);
    return {
      kind: "choice",
      skill: "meaning",
      verbId: verb.id,
      prompt: `¿Qué significa ${verb.infinitive}?`,
      help: verb.note,
      options,
      correctId: correctChoiceId(options, verb.spanish),
      written: false,
    };
  }
  const options = infinitiveChoices(verb, rng);
  return {
    kind: "choice",
    skill: "infinitive",
    verbId: verb.id,
    prompt: `¿Cuál es el infinitivo de «${verb.spanish}»?`,
    help: verb.note,
    options,
    correctId: correctChoiceId(options, verb.infinitive),
    written: false,
  };
}

/** Primer recuerdo escrito, sin mostrar las otras formas. */
export function recallQuestion(verb: Verb, rng: () => number, mode: VariantMode): Question {
  const roll = rng();
  if (verb.id === 1) {
    if (roll < 0.5) return writeQuestion(verb, { form: "past", pair: true }, mode, false);
    return writeQuestion(verb, { form: "participle" }, mode, false);
  }
  if (roll < 0.34) return writeQuestion(verb, { form: "past", pair: false }, mode, false);
  if (roll < 0.67) return writeQuestion(verb, { form: "participle" }, mode, false);
  return writeQuestion(verb, { form: "spanish" }, mode, false);
}

export function reviewQuestion(
  verb: Verb,
  rng: () => number,
  mode: VariantMode,
  intensive: boolean,
): Question {
  const roll = rng();
  const writeBias = intensive ? 0.85 : 0.62;
  if (roll > writeBias) {
    return introQuestion(verb, rng);
  }
  const specs = writeSpecs(verb, rng);
  const spec = specs[Math.floor(rng() * specs.length)];
  return writeQuestion(verb, spec, mode, true);
}

function writeSpecs(verb: Verb, rng: () => number): WriteSpec[] {
  const specs: WriteSpec[] = [
    { form: "past", pair: false },
    { form: "participle" },
    { form: "infinitive" },
    { form: "spanish" },
  ];
  if (verb.id !== 1 && verb.past !== verb.participle) specs.push({ form: "both" });
  if (verb.id === 1) {
    specs.push({ form: "past", pair: true }, { form: "past_subject", expect: rng() < 0.5 ? "was" : "were" });
  }
  if (verb.id === 47) specs.push({ form: "past", pair: false });
  return specs;
}

export function writeQuestion(
  verb: Verb,
  spec: WriteSpec,
  _mode: VariantMode,
  withContext: boolean,
): Question {
  const skill = skillOf(spec);
  const phonetic = verb.phonetic
    ? `Infinitivo ${verb.phonetic.infinitive}; pasado y participio ${verb.phonetic.past}.`
    : undefined;
  let prompt = "";
  let placeholder = "Escribe aquí";
  switch (spec.form) {
    case "infinitive":
      prompt = `Escribe el infinitivo de «${verb.spanish}».`;
      break;
    case "spanish":
      prompt = `¿Qué significa ${verb.infinitive}? Escríbelo en español.`;
      placeholder = "En español";
      break;
    case "past":
      prompt = withContext
        ? `Ayer: I ____ (${verb.infinitive}). Escribe el pasado.`
        : `Escribe el pasado de ${verb.infinitive}.`;
      break;
    case "past_subject":
      prompt =
        spec.expect === "was"
          ? "She ____ happy. Escribe el pasado de be para she."
          : "They ____ happy. Escribe el pasado de be para they.";
      break;
    case "participle":
      prompt = withContext
        ? `I have ____ (${verb.infinitive}) an orange. Escribe el participio.`
        : `Escribe el participio de ${verb.infinitive}.`;
      break;
    case "both":
      prompt = `Escribe el pasado y el participio de ${verb.infinitive}, separados por coma.`;
      placeholder = "pasado, participio";
      break;
  }
  if (spec.form === "past" && spec.pair) {
    prompt = "Escribe las dos formas del pasado de be, separadas por coma o barra.";
    placeholder = "was, were";
  }
  return {
    kind: "write",
    skill,
    verbId: verb.id,
    prompt,
    help: phonetic,
    placeholder,
    write: spec,
    written: true,
  };
}

function skillOf(spec: WriteSpec): Skill {
  switch (spec.form) {
    case "infinitive":
      return "infinitive";
    case "spanish":
      return "meaning";
    case "participle":
      return "participle";
    default:
      return "past";
  }
}

export interface DuelQuestion {
  prompt: {
    kind: "choice" | "write";
    skill: Skill;
    verbId: number;
    text: string;
    help?: string;
    options?: ChoiceLite[];
    placeholder?: string;
  };
  accepted: string[];
  display: string;
}

interface ChoiceLite {
  id: string;
  label: string;
}

export function buildDuelQuestions(seed: number, mode: VariantMode, count = 10): DuelQuestion[] {
  const rng = mulberry32(seed);
  const verbs = shuffle(getAllVerbs(), rng).slice(0, count);
  return verbs.map((verb) => {
    const roll = rng();
    if (roll < 0.35) {
      const question = introQuestion(verb, rng);
      if (question.kind !== "choice") throw new Error("Se esperaba opción");
      const correct = question.options.find((option) => option.id === question.correctId);
      return {
        prompt: {
          kind: "choice",
          skill: question.skill,
          verbId: verb.id,
          text: question.prompt,
          help: question.help,
          options: question.options,
        },
        accepted: [question.correctId],
        display: correct?.label ?? "",
      };
    }
    const spec: WriteSpec =
      roll < 0.55
        ? verb.id === 1
          ? { form: "past_subject", expect: rng() < 0.5 ? "was" : "were" }
          : { form: "past", pair: false }
        : roll < 0.8
          ? { form: "participle" }
          : { form: "infinitive" };
    const question = writeQuestion(verb, spec, mode, true);
    if (question.kind !== "write") throw new Error("Se esperaba escritura");
    return {
      prompt: {
        kind: "write",
        skill: question.skill,
        verbId: verb.id,
        text: question.prompt,
        help: question.help,
        placeholder: question.placeholder,
      },
      accepted: acceptedNormalized(verb, spec, mode),
      display: expectedDisplay(verb, spec, mode),
    };
  });
}

function getAllVerbs(): Verb[] {
  return Array.from({ length: 75 }, (_, index) => getVerb(index + 1));
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { getVerb };
