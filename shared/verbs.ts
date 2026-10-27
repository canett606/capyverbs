import { VERB_CSV } from "./verbCsv";
import type { Pattern, Verb } from "./types";

/**
 * Variantes revisadas en diccionarios de uso (Oxford / Cambridge / Merriam-Webster).
 * No cambian el significado de la fila. En «Mi ficha» no se aceptan.
 * - burn, learn, spell: forma regular -ed junto a -t de la ficha.
 * - get: participio gotten, habitual en inglés americano.
 * - show: participio showed, aceptado junto a shown.
 * - sew: participio sewed, aceptado junto a sewn.
 */
const VARIANTS: Record<number, { past?: string[]; participle?: string[] }> = {
  8: { past: ["burned"], participle: ["burned"] },
  25: { participle: ["gotten"] },
  36: { past: ["learned"], participle: ["learned"] },
  54: { participle: ["sewed"] },
  55: { participle: ["showed"] },
  61: { past: ["spelled"], participle: ["spelled"] },
};

const CONTRASTS: Record<number, number[]> = {
  6: [66],
  39: [40],
  40: [39],
  50: [68],
  66: [6],
  68: [50],
};

const NOTES: Record<number, string> = {
  1: "Sin un sujeto concreto hacen falta las dos formas del pasado: was y were.",
  39: "Lay significa poner o colocar. No lo confundas con lie (tumbarse): el pasado de lie es lay.",
  40: "En esta ficha lie significa tumbarse, no mentir. Mentir sería lie / lied / lied y aquí no vale.",
  47: "Se escribe igual, pero no se pronuncia igual.",
  6: "Bring es traer o llevar hacia quien habla. Take es llevar hacia otro lugar.",
  66: "Take es llevar hacia otro lugar. Bring es traer o llevar hacia quien habla.",
  50: "Say presenta lo que se dijo. Tell suele indicar a quién: tell someone.",
  68: "Tell suele llevar oyente (tell someone). Say presenta el mensaje.",
};

function patternOf(infinitive: string, past: string, participle: string, id: number): Pattern {
  if (id === 1 || id === 40) return "special";
  if (infinitive === past && past === participle) return "identical";
  if (past === participle) return "past_eq_participle";
  return "three";
}

export function parseVerbCsv(csv: string): Verb[] {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("id;"));

  return lines.map((line) => {
    const parts = line.split(";");
    if (parts.length !== 5) {
      throw new Error(`Fila con ${parts.length} campos: ${line}`);
    }
    const [idRaw, infinitive, past, participle, spanish] = parts;
    const id = Number(idRaw);
    if (!Number.isInteger(id)) throw new Error(`Id no numérico: ${line}`);
    const extra = VARIANTS[id] ?? {};
    const verb: Verb = {
      id,
      infinitive,
      past,
      participle,
      spanish,
      pattern: patternOf(infinitive, past, participle, id),
      variants: {
        past: extra.past ?? [],
        participle: extra.participle ?? [],
      },
      contrasts: CONTRASTS[id] ?? [],
      note: NOTES[id],
    };
    if (id === 47) {
      verb.phonetic = { infinitive: "/riːd/", past: "/red/" };
    }
    return verb;
  });
}

export const VERBS: Verb[] = parseVerbCsv(VERB_CSV);

export const VERB_BY_ID: Map<number, Verb> = new Map(VERBS.map((verb) => [verb.id, verb]));

export function getVerb(id: number): Verb {
  const verb = VERB_BY_ID.get(id);
  if (!verb) throw new Error(`Verbo ${id} no existe`);
  return verb;
}

export function patternLabel(pattern: Pattern): string {
  switch (pattern) {
    case "identical":
      return "Tres formas iguales";
    case "past_eq_participle":
      return "Pasado = participio";
    case "three":
      return "Tres formas distintas";
    case "special":
      return "Caso especial";
  }
}

export function patternBlurb(verb: Verb): string {
  switch (verb.pattern) {
    case "identical":
      return `En ${verb.infinitive} las tres formas se escriben igual.`;
    case "past_eq_participle":
      return `En ${verb.infinitive} el pasado y el participio se escriben igual: ${verb.past}.`;
    case "three":
      return `En ${verb.infinitive} las tres formas son distintas.`;
    case "special":
      return verb.note ?? "Este verbo pide atención aparte.";
  }
}
