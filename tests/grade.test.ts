import { describe, expect, it } from "vitest";
import { choiceIsAmbiguous, gradeAnswer } from "../shared/grade";
import { buildDuelQuestions, introQuestion, mulberry32, writeQuestion } from "../shared/questions";
import { formChoices, meaningChoices } from "../shared/distractors";
import { getVerb } from "../shared/verbs";

const sheet = { mode: "sheet" as const, allowAlmost: true };

function write(verbId: number, spec: Parameters<typeof writeQuestion>[1]) {
  return writeQuestion(getVerb(verbId), spec, "sheet", false);
}

describe("corrección", () => {
  it("exige las dos formas de be y acepta el orden al revés", () => {
    const question = write(1, { form: "past", pair: true });
    expect(gradeAnswer(getVerb(1), question, " was / were ", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(1), question, "were, was", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(1), question, "was", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(1), question, "were", sheet).outcome).toBe("wrong");
  });

  it("con sujeto concreto solo acepta la forma que toca", () => {
    const she = write(1, { form: "past_subject", expect: "was" });
    const they = write(1, { form: "past_subject", expect: "were" });
    expect(gradeAnswer(getVerb(1), she, "was", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(1), she, "were", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(1), she, "was/were", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(1), they, "were", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(1), they, "was", sheet).outcome).toBe("wrong");
  });

  it("separa lie de lay y no acepta lied", () => {
    const liePast = write(40, { form: "past", pair: false });
    const layPast = write(39, { form: "past", pair: false });
    expect(gradeAnswer(getVerb(40), liePast, "lay", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(40), liePast, "lied", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(40), liePast, "laid", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(39), layPast, "laid", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(39), layPast, "lay", sheet).outcome).toBe("wrong");
  });

  it("en la ficha read se escribe igual y burnt no vale si el modo es la ficha", () => {
    const read = write(47, { form: "past", pair: false });
    expect(gradeAnswer(getVerb(47), read, "READ", sheet).outcome).toBe("correct");
    expect(read.help).toContain("/riːd/");
    expect(read.help).toContain("/red/");
    const burn = write(8, { form: "past", pair: false });
    expect(gradeAnswer(getVerb(8), burn, "burnt", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(8), burn, "burned", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(8), burn, "burned", { mode: "standard", allowAlmost: false }).outcome).toBe("correct");
  });

  it("acepta sinónimos de la ficha sin tildes y no una errata", () => {
    const spanish = write(30, { form: "spanish" });
    expect(gradeAnswer(getVerb(30), spanish, "oir", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(30), spanish, "oír", sheet).outcome).toBe("correct");
    const bring = write(6, { form: "spanish" });
    expect(gradeAnswer(getVerb(6), bring, "traer", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(6), bring, "llevar", sheet).outcome).toBe("correct");
    const broke = write(5, { form: "past", pair: false });
    expect(gradeAnswer(getVerb(5), broke, "brok", sheet).outcome).toBe("almost");
    expect(gradeAnswer(getVerb(5), broke, "broken", sheet).outcome).toBe("wrong");
    const second = gradeAnswer(getVerb(5), broke, "broke", { ...sheet, helpedAlready: true });
    expect(second.outcome).toBe("correct");
    expect(second.helped).toBe(true);
  });

  it("gotten solo entra en variantes estándar", () => {
    const got = write(25, { form: "participle" });
    expect(gradeAnswer(getVerb(25), got, "got", sheet).outcome).toBe("correct");
    expect(gradeAnswer(getVerb(25), got, "gotten", sheet).outcome).toBe("wrong");
    expect(gradeAnswer(getVerb(25), got, "gotten", { mode: "standard", allowAlmost: false }).outcome).toBe("correct");
  });

  it("las opciones tienen una sola respuesta válida", () => {
    const rng = mulberry32(7);
    for (const verb of [1, 6, 15, 39, 40, 42, 47, 50, 68].map((id) => getVerb(id))) {
      for (const mode of ["sheet", "standard"] as const) {
        const meaning = meaningChoices(verb, rng);
        const question = introQuestion(verb, rng);
        if (question.kind === "choice") expect(choiceIsAmbiguous(question, mode)).toBe(false);
        const past = formChoices(verb, "past", mode, rng);
        const built = {
          kind: "choice" as const,
          skill: "past" as const,
          verbId: verb.id,
          prompt: "pasado",
          options: past,
          correctId: past.find((option) => option.label === verb.past.split("/")[0])?.id ?? past[0].id,
          written: false as const,
        };
        expect(choiceIsAmbiguous(built, mode)).toBe(false);
        expect(new Set(meaning.map((option) => option.label)).size).toBe(4);
      }
    }
  });

  it("el duelo guarda formas que la corrección local también acepta", () => {
    const pack = buildDuelQuestions(99, "sheet", 10);
    expect(pack).toHaveLength(10);
    const ids = pack.map((item) => item.prompt.verbId);
    expect(new Set(ids).size).toBe(10);
    for (const item of pack) {
      expect(item.accepted.length).toBeGreaterThan(0);
      if (item.prompt.kind === "write") {
        const verb = getVerb(item.prompt.verbId);
        const spec =
          item.prompt.skill === "participle"
            ? ({ form: "participle" } as const)
            : item.prompt.skill === "infinitive"
              ? ({ form: "infinitive" } as const)
              : item.prompt.text.includes("she") || item.prompt.text.includes("They")
                ? ({ form: "past_subject", expect: item.accepted[0] === "were" ? "were" : "was" } as const)
                : ({ form: "past", pair: false } as const);
        const question = writeQuestion(verb, spec, "sheet", true);
        for (const accepted of item.accepted) {
          expect(gradeAnswer(verb, question, accepted, { mode: "sheet", allowAlmost: false }).outcome).toBe("correct");
        }
      }
    }
  });
});
