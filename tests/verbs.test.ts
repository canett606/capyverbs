import { describe, expect, it } from "vitest";
import { VERB_CSV } from "../shared/verbCsv";
import { VERBS, parseVerbCsv } from "../shared/verbs";

describe("dataset", () => {
  it("tiene 75 ids únicos y cuatro campos lingüísticos", () => {
    expect(VERBS).toHaveLength(75);
    const ids = VERBS.map((verb) => verb.id);
    expect(new Set(ids)).toEqual(new Set(Array.from({ length: 75 }, (_, index) => index + 1)));
    for (const verb of VERBS) {
      expect(verb.infinitive.length).toBeGreaterThan(0);
      expect(verb.past.length).toBeGreaterThan(0);
      expect(verb.participle.length).toBeGreaterThan(0);
      expect(verb.spanish.length).toBeGreaterThan(0);
    }
  });

  it("coincide con la transcripción de la ficha", () => {
    const again = parseVerbCsv(VERB_CSV);
    expect(again.map((verb) => [verb.id, verb.infinitive, verb.past, verb.participle, verb.spanish])).toEqual(
      VERBS.map((verb) => [verb.id, verb.infinitive, verb.past, verb.participle, verb.spanish]),
    );
    const tricky = Object.fromEntries(VERBS.map((verb) => [verb.id, verb]));
    expect(tricky[1]).toMatchObject({ past: "was/were", participle: "been", spanish: "ser o estar" });
    expect(tricky[39]).toMatchObject({ infinitive: "lay", past: "laid", spanish: "poner/colocar" });
    expect(tricky[40]).toMatchObject({ infinitive: "lie", past: "lay", participle: "lain", spanish: "tumbarse" });
    expect(tricky[47]).toMatchObject({ infinitive: "read", past: "read", participle: "read" });
    expect(tricky[25]).toMatchObject({ past: "got", participle: "got" });
    expect(tricky[8]).toMatchObject({ past: "burnt" });
    expect(tricky[36]).toMatchObject({ past: "learnt" });
  });

  it("no añade ni quita filas respecto al CSV embebido en el código", () => {
    const rows = VERB_CSV.trim().split(/\n/).filter((line) => /^\d+;/.test(line));
    expect(rows).toHaveLength(75);
    expect(VERB_CSV).toContain("40;lie;lay;lain;tumbarse");
    expect(VERB_CSV).toContain("75;write;wrote;written;escribir");
  });
});
