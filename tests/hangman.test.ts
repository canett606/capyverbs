import { describe, expect, it } from "vitest";
import { HANGMAN_MISSES, applyGuess, emptyBoard, hangmanPuzzlesForVerb, noteSpoilsAnswer, planHangman } from "../shared/hangman";
import { getVerb } from "../shared/verbs";

describe("ahorcado de past y participio", () => {
  it("separa was/were y been, y deja la barra a la vista", () => {
    const puzzles = hangmanPuzzlesForVerb(getVerb(1), "sheet");
    expect(puzzles.map((puzzle) => puzzle.solution)).toEqual(["was/were", "been"]);
    expect(puzzles[0]?.eyebrow).toBe("Past simple");
    expect(puzzles[1]?.eyebrow).toBe("Past participle");
    const withA = applyGuess("was/were", emptyBoard(), "a");
    expect(withA.misses).toBe(0);
    expect(withA.status).toBe("playing");
    const slash = [..."was/were"].filter((char) => char === "/");
    expect(slash).toHaveLength(1);
  });

  it("junta pasado y participio cuando se escriben igual", () => {
    const puzzles = hangmanPuzzlesForVerb(getVerb(13), "sheet");
    expect(puzzles).toHaveLength(1);
    expect(puzzles[0]).toMatchObject({ solution: "cost", skills: ["past", "participle"] });
  });

  it("pide went y gone por separado, y lay/lain en lie", () => {
    expect(hangmanPuzzlesForVerb(getVerb(27), "sheet").map((puzzle) => puzzle.solution)).toEqual(["went", "gone"]);
    const lie = hangmanPuzzlesForVerb(getVerb(40), "sheet").map((puzzle) => puzzle.solution);
    expect(lie).toEqual(["lay", "lain"]);
    expect(lie).not.toContain("lied");
  });

  it("añade gotten solo en variantes estándar y burned una sola vez", () => {
    expect(hangmanPuzzlesForVerb(getVerb(25), "sheet").map((puzzle) => puzzle.solution)).toEqual(["got"]);
    expect(hangmanPuzzlesForVerb(getVerb(25), "standard").map((puzzle) => puzzle.solution)).toEqual(["got", "gotten"]);
    expect(hangmanPuzzlesForVerb(getVerb(8), "standard").map((puzzle) => puzzle.solution)).toEqual(["burnt", "burned"]);
  });

  it("una letra repetida se cuenta una vez y seis fallos cierran la palabra", () => {
    let board = emptyBoard();
    board = applyGuess("brought", board, "t");
    expect(board.misses).toBe(0);
    board = applyGuess("brought", board, "t");
    expect(board.guessed).toEqual(["t"]);
    for (const letter of ["a", "e", "i", "s", "m", "p"]) {
      board = applyGuess("brought", board, letter);
    }
    expect(board.misses).toBe(HANGMAN_MISSES);
    expect(board.status).toBe("lost");
    const stuck = applyGuess("brought", board, "z");
    expect(stuck).toBe(board);
  });

  it("completa la palabra antes de agotar los fallos", () => {
    let board = emptyBoard();
    for (const letter of ["w", "e", "n", "t"]) board = applyGuess("went", board, letter);
    expect(board.status).toBe("won");
    expect(board.misses).toBe(0);
  });

  it("elige primero los verbos con el pasado y el participio más bajos", () => {
    const levels: Record<number, { past: number; participle: number }> = {};
    for (let id = 1; id <= 75; id += 1) levels[id] = { past: 5, participle: 5 };
    for (const id of [10, 20, 30, 40, 50]) levels[id] = { past: 0, participle: 0 };
    const plan = planHangman({ mode: "sheet", levels, from: 1, to: 75, verbCount: 5, seed: 4 });
    expect(new Set(plan.map((puzzle) => puzzle.verbId))).toEqual(new Set([10, 20, 30, 40, 50]));
  });

  it("limita la ronda a un tramo y lo recorre en orden de ficha", () => {
    const plan = planHangman({ mode: "sheet", levels: {}, from: 5, to: 1, seed: 2 });
    expect([...new Set(plan.map((puzzle) => puzzle.verbId))]).toEqual([1, 2, 3, 4, 5]);
    expect(plan[0]?.solution).toBe("was/were");
    const inside = planHangman({ mode: "sheet", levels: {}, from: 10, to: 12, seed: 2, verbCount: 5 });
    expect(new Set(inside.map((puzzle) => puzzle.verbId))).toEqual(new Set([10, 11, 12]));
  });

  it("no muestra una nota que ya dice la forma", () => {
    expect(noteSpoilsAnswer("Sin un sujeto concreto hacen falta las dos formas del pasado: was y were.", "was/were")).toBe(true);
    expect(noteSpoilsAnswer("En esta ficha lie significa tumbarse, no mentir.", "lay")).toBe(false);
  });
});
