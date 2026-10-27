import { aliasKey, capyNorm } from "./normalize";
import type { Choice, Skill, VariantMode, Verb } from "./types";
import { VERBS } from "./verbs";
import { participleForms, pastForms } from "./grade";

export function meaningChoices(verb: Verb, rng: () => number): Choice[] {
  const correctKeys = aliasKey(verb.spanish);
  const pool = VERBS.filter((other) => {
    if (other.id === verb.id) return false;
    const keys = aliasKey(other.spanish);
    for (const key of keys) if (correctKeys.has(key)) return false;
    return capyNorm(other.spanish) !== capyNorm(verb.spanish);
  });
  return buildChoices(verb.spanish, pool.map((item) => item.spanish), rng);
}

export function infinitiveChoices(verb: Verb, rng: () => number): Choice[] {
  const pool = VERBS.filter((other) => other.id !== verb.id).map((other) => other.infinitive);
  return buildChoices(verb.infinitive, pool, rng);
}

export function formChoices(
  verb: Verb,
  skill: Extract<Skill, "past" | "participle">,
  mode: VariantMode,
  rng: () => number,
): Choice[] {
  const accepted = new Set(
    (skill === "past" ? pastForms(verb, mode) : participleForms(verb, mode)).map((form) => capyNorm(form)),
  );
  const correct = skill === "past" ? pastForms(verb, "sheet")[0] : participleForms(verb, "sheet")[0];
  const pool: string[] = [];
  for (const other of VERBS) {
    const forms = skill === "past" ? pastForms(other, mode) : participleForms(other, mode);
    for (const form of forms) {
      if (!accepted.has(capyNorm(form)) && capyNorm(form) !== capyNorm(correct)) pool.push(form);
    }
  }
  return buildChoices(correct, pool, rng);
}

function buildChoices(correct: string, pool: string[], rng: () => number): Choice[] {
  const used = new Set<string>([capyNorm(correct)]);
  const picked: string[] = [];
  const bag = shuffle(unique(pool), rng);
  for (const item of bag) {
    const key = capyNorm(item);
    if (used.has(key)) continue;
    used.add(key);
    picked.push(item);
    if (picked.length === 3) break;
  }
  if (picked.length < 3) {
    throw new Error(`No hay distractores suficientes para «${correct}»`);
  }
  const labels = shuffle([correct, ...picked], rng);
  return labels.map((label, index) => ({ id: "abcd"[index], label }));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = capyNorm(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function correctChoiceId(options: Choice[], label: string): string {
  const found = options.find((option) => capyNorm(option.label) === capyNorm(label));
  if (!found) throw new Error(`Opción correcta ausente: ${label}`);
  return found.id;
}
