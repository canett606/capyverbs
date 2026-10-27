import { describe, expect, it } from "vitest";
import { validateProgress } from "../shared/progressFile";
import { INTERVALS_MS, applyOutcome, blankSkill, isMastered, blankProgress } from "../shared/scheduler";
import { countOtherQuestionsBetween, insertRetry, planSession } from "../shared/session";
import type { PlanItem, VerbProgress } from "../shared/types";

describe("repaso", () => {
  it("aplica intervalos con un reloj simulado y distingue escrito de reconocimiento", () => {
    let skill = blankSkill();
    skill = applyOutcome(skill, { now: 0, day: "2026-01-01", correct: true, helped: false, written: true });
    expect(skill.level).toBe(1);
    expect(skill.nextReview).toBe(INTERVALS_MS[0]);
    skill = applyOutcome(skill, {
      now: INTERVALS_MS[0],
      day: "2026-01-02",
      correct: true,
      helped: false,
      written: true,
    });
    expect(skill.level).toBe(2);
    expect(skill.nextReview).toBe(INTERVALS_MS[0] + INTERVALS_MS[1]);
    const recognized = applyOutcome(skill, {
      now: skill.nextReview!,
      day: "2026-01-03",
      correct: true,
      helped: false,
      written: false,
    });
    expect(recognized.level).toBe(2);
    const failed = applyOutcome(skill, {
      now: 50,
      day: "2026-01-03",
      correct: false,
      helped: true,
      written: true,
    });
    expect(failed.level).toBe(1);
    expect(failed.nextReview).toBe(50);
    expect(failed.fails).toBe(1);
    const helped = applyOutcome(blankSkill(), {
      now: 10,
      day: "2026-01-01",
      correct: true,
      helped: true,
      written: true,
    });
    expect(helped.level).toBe(0);
    expect(helped.hints).toBe(1);
    expect(helped.unaidedDays).toEqual([]);
  });

  it("dominado exige tres días distintos en significado, pasado y participio", () => {
    const progress = blankProgress(3);
    for (const skill of ["meaning", "past", "participle"] as const) {
      for (const day of ["2026-03-01", "2026-03-02"]) {
        progress.skills[skill] = applyOutcome(progress.skills[skill], {
          now: Date.parse(day),
          day,
          correct: true,
          helped: false,
          written: true,
        });
      }
    }
    expect(isMastered(progress)).toBe(false);
    for (const skill of ["meaning", "past", "participle"] as const) {
      progress.skills[skill] = applyOutcome(progress.skills[skill], {
        now: Date.parse("2026-03-03"),
        day: "2026-03-03",
        correct: true,
        helped: false,
        written: true,
      });
    }
    expect(isMastered(progress)).toBe(true);
    const onlyMeaning = blankProgress(4);
    for (const day of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
      onlyMeaning.skills.meaning = applyOutcome(onlyMeaning.skills.meaning, {
        now: Date.parse(day),
        day,
        correct: true,
        helped: false,
        written: true,
      });
      onlyMeaning.skills.infinitive = applyOutcome(onlyMeaning.skills.infinitive, {
        now: Date.parse(day),
        day,
        correct: true,
        helped: false,
        written: true,
      });
    }
    expect(isMastered(onlyMeaning)).toBe(false);
  });

  it("el primer recuerdo de un verbo nuevo queda tras 2 a 4 preguntas de otros", () => {
    const progress: Record<number, VerbProgress> = {};
    for (let id = 2; id <= 10; id += 1) {
      const row = blankProgress(id);
      row.introduced = true;
      row.skills.past.nextReview = 0;
      progress[id] = row;
    }
    const plan = planSession({
      now: 1_000,
      mode: "adventure",
      progress,
      verbIds: Array.from({ length: 10 }, (_, index) => index + 1),
      variantMode: "sheet",
      intensive: false,
      rng: () => 0,
      newVerbBudget: 1,
      target: 8,
    });
    const between = countOtherQuestionsBetween(plan, 1);
    expect(between).toBeGreaterThanOrEqual(2);
    expect(between).toBeLessThanOrEqual(4);
    const recall = plan.find((item) => item.role === "recall" && item.verbId === 1);
    expect(recall?.question?.kind).toBe("write");
    expect(recall?.question?.help).toBeUndefined();
  });

  it("repite un fallo tras 3 a 5 preguntas y no entra en bucle si no hay hueco", () => {
    const queue: PlanItem[] = Array.from({ length: 8 }, (_, index) => ({
      verbId: index + 1,
      role: "review",
      question: null,
    }));
    const retried = insertRetry(queue, 0, { verbId: 1, role: "retry", question: null });
    const at = retried.findIndex((item) => item.role === "retry");
    expect(at - 0 - 1).toBeGreaterThanOrEqual(3);
    expect(at - 0 - 1).toBeLessThanOrEqual(5);
    const short: PlanItem[] = [
      { verbId: 1, role: "review", question: null },
      { verbId: 2, role: "review", question: null },
    ];
    expect(insertRetry(short, 0, { verbId: 1, role: "retry", question: null })).toHaveLength(2);
  });

  it("no bloquea una carrera vacía", () => {
    const race = planSession({
      now: 5,
      mode: "race",
      progress: {},
      verbIds: [1, 2, 3, 4, 5],
      variantMode: "sheet",
      intensive: false,
      rng: () => 0.2,
      target: 5,
    });
    expect(race.length).toBeGreaterThan(0);
  });

  it("valida la exportación y rechaza un verbo ajeno", () => {
    const file = validateProgress({
      format: "capyverbs-progress",
      version: 1,
      exportedAt: "2026-09-29T00:00:00.000Z",
      profile: {
        nickname: "  Lola  ",
        color: "cream",
        hat: "leaf",
        accessory: "none",
        sound: true,
        reducedMotion: false,
        variantMode: "sheet",
        examFrom: 1,
        examTo: 10,
        intensive: false,
      },
      meta: { version: 1, sessions: 2, days: ["2026-09-29"], adventureUnlocked: 1 },
      verbs: [blankProgress(12)],
    });
    expect(file.profile.nickname).toBe("Lola");
    expect(file.verbs[0].verbId).toBe(12);
    expect(() =>
      validateProgress({
        format: "capyverbs-progress",
        version: 1,
        profile: file.profile,
        meta: file.meta,
        verbs: [{ ...blankProgress(76) }],
      }),
    ).toThrow(/fuera de la ficha/);
    expect(() => validateProgress({ format: "otro", version: 1 })).toThrow(/no reconocido/);
  });
});
