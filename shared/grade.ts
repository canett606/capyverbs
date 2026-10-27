import { aliasKey, capyNorm, levenshtein, spanishAliases, splitSlashes } from "./normalize";
import type { Question, VariantMode, Verb, WriteSpec } from "./types";
import { VERBS } from "./verbs";

export interface GradeResult {
  outcome: "correct" | "almost" | "wrong";
  helped: boolean;
  expected: string;
  explanation: string;
}

const KNOWN_FORMS = buildKnownForms();

function buildKnownForms(): Set<string> {
  const forms = new Set<string>();
  for (const verb of VERBS) {
    forms.add(capyNorm(verb.infinitive));
    for (const part of splitSlashes(verb.past)) forms.add(capyNorm(part));
    for (const part of splitSlashes(verb.participle)) forms.add(capyNorm(part));
    for (const part of verb.variants.past) forms.add(capyNorm(part));
    for (const part of verb.variants.participle) forms.add(capyNorm(part));
    for (const alias of spanishAliases(verb.spanish)) forms.add(capyNorm(alias));
  }
  return forms;
}

export function pastForms(verb: Verb, mode: VariantMode): string[] {
  const forms = splitSlashes(verb.past);
  if (mode === "standard") forms.push(...verb.variants.past);
  return unique(forms.map((form) => form.toLowerCase()));
}

export function participleForms(verb: Verb, mode: VariantMode): string[] {
  const forms = splitSlashes(verb.participle);
  if (mode === "standard") forms.push(...verb.variants.participle);
  return unique(forms.map((form) => form.toLowerCase()));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function pairAccepted(forms: string[]): string[] {
  if (forms.length < 2) return forms;
  const [a, b] = forms;
  return [
    `${a}/${b}`,
    `${b}/${a}`,
    `${a} / ${b}`,
    `${b} / ${a}`,
    `${a}, ${b}`,
    `${b}, ${a}`,
    `${a},${b}`,
    `${b},${a}`,
  ];
}

export function expectedDisplay(verb: Verb, spec: WriteSpec, mode: VariantMode): string {
  switch (spec.form) {
    case "infinitive":
      return verb.infinitive;
    case "spanish":
      return verb.spanish;
    case "past":
      return mode === "standard" && verb.variants.past.length
        ? `${verb.past} (también ${verb.variants.past.join(", ")})`
        : verb.past;
    case "past_subject":
      return spec.expect;
    case "participle":
      return mode === "standard" && verb.variants.participle.length
        ? `${verb.participle} (también ${verb.variants.participle.join(", ")})`
        : verb.participle;
    case "both": {
      const past = verb.past;
      const participle = verb.participle;
      return `${past}, ${participle}`;
    }
  }
}

/** Lista cerrada de respuestas normalizadas. El duelo guarda esta lista y compara exacto. */
export function acceptedNormalized(verb: Verb, spec: WriteSpec, mode: VariantMode): string[] {
  const raw = rawAccepted(verb, spec, mode);
  return unique(raw.map((value) => capyNorm(value)));
}

function rawAccepted(verb: Verb, spec: WriteSpec, mode: VariantMode): string[] {
  switch (spec.form) {
    case "infinitive":
      return [verb.infinitive];
    case "spanish":
      return spanishAliases(verb.spanish);
    case "past":
      return spec.pair ? pairAccepted(pastForms(verb, "sheet")) : pastForms(verb, mode);
    case "past_subject":
      return [spec.expect];
    case "participle":
      return participleForms(verb, mode);
    case "both": {
      const pasts = pastForms(verb, mode);
      const parts = participleForms(verb, mode);
      const combos: string[] = [];
      for (const past of pasts) {
        for (const part of parts) {
          combos.push(`${past}, ${part}`, `${past},${part}`, `${past}/${part}`, `${past} / ${part}`);
        }
      }
      return combos;
    }
  }
}

export function gradeAnswer(
  verb: Verb,
  question: Question,
  rawAnswer: string,
  options: { mode: VariantMode; allowAlmost: boolean; helpedAlready?: boolean },
): GradeResult {
  if (question.verbId !== verb.id) {
    throw new Error("La pregunta no corresponde al verbo");
  }
  if (question.kind === "choice") {
    const correct = question.options.find((option) => option.id === question.correctId);
    const expected = correct?.label ?? "";
    if (rawAnswer === question.correctId) {
      return {
        outcome: "correct",
        helped: Boolean(options.helpedAlready),
        expected,
        explanation: `Sí. ${verb.infinitive}: ${verb.spanish}.`,
      };
    }
    return {
      outcome: "wrong",
      helped: true,
      expected,
      explanation: `La respuesta es «${expected}». ${verb.infinitive} / ${verb.past} / ${verb.participle}.`,
    };
  }

  const accepted = acceptedNormalized(verb, question.write, options.mode);
  const expected = expectedDisplay(verb, question.write, options.mode);
  const norm = capyNorm(rawAnswer);
  if (norm.length === 0) {
    return {
      outcome: "wrong",
      helped: true,
      expected,
      explanation: explainWrong(verb, expected),
    };
  }
  if (accepted.includes(norm)) {
    return {
      outcome: "correct",
      helped: Boolean(options.helpedAlready),
      expected,
      explanation: `Sí. ${verb.infinitive} → ${expected}.`,
    };
  }
  const knownElsewhere = KNOWN_FORMS.has(norm);
  if (
    options.allowAlmost &&
    !options.helpedAlready &&
    !knownElsewhere &&
    accepted.some((item) => levenshtein(item, norm) === 1)
  ) {
    return {
      outcome: "almost",
      helped: true,
      expected,
      explanation: "Casi. Hay una letra de diferencia. Inténtalo otra vez.",
    };
  }
  return {
    outcome: "wrong",
    helped: true,
    expected,
    explanation: explainWrong(verb, expected),
  };
}

function explainWrong(verb: Verb, expected: string): string {
  const base = `La respuesta es «${expected}». ${verb.infinitive} / ${verb.past} / ${verb.participle}: ${verb.spanish}.`;
  return verb.note ? `${base} ${verb.note}` : base;
}

export function choiceIsAmbiguous(question: Extract<Question, { kind: "choice" }>, mode: VariantMode): boolean {
  const verb = VERBS.find((item) => item.id === question.verbId);
  if (!verb) return true;
  const correct = question.options.find((option) => option.id === question.correctId);
  if (!correct) return true;
  let valids = 0;
  for (const option of question.options) {
    if (question.skill === "meaning") {
      const keys = aliasKey(verb.spanish);
      if (keys.has(capyNorm(option.label))) valids += 1;
    } else if (question.skill === "infinitive") {
      if (capyNorm(option.label) === capyNorm(verb.infinitive)) valids += 1;
    } else if (question.skill === "past") {
      if (pastForms(verb, mode).some((form) => capyNorm(form) === capyNorm(option.label))) valids += 1;
    } else if (participleForms(verb, mode).some((form) => capyNorm(form) === capyNorm(option.label))) {
      valids += 1;
    }
  }
  return valids !== 1 || new Set(question.options.map((option) => capyNorm(option.label))).size !== 4;
}
