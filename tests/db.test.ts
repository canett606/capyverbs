import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { blankProgress } from "../shared/scheduler";
import { clearProgress, loadSnapshot, replaceAll, resetPersonForTests, saveVerb, selectPerson, toFile } from "../src/db";

afterEach(() => {
  resetPersonForTests();
});

describe("progreso en el dispositivo", () => {
  it("guarda, exporta e importa un JSON validado", async () => {
    await clearProgress();
    await saveVerb({ ...blankProgress(4), introduced: true });
    const before = await loadSnapshot();
    const file = toFile(before);
    expect(file.verbs.map((verb) => verb.verbId)).toContain(4);
    await clearProgress();
    await replaceAll(file);
    const after = await loadSnapshot();
    expect(after.verbs.find((verb) => verb.verbId === 4)?.introduced).toBe(true);
    await expect(replaceAll({ ...file, format: "otro" } as never)).rejects.toThrow();
  });

  it("guarda los verbos de cada nombre por separado y entrega el archivo antiguo a la primera persona", async () => {
    selectPerson("Ana");
    await clearProgress();
    selectPerson("Luis");
    await clearProgress();
    resetPersonForTests();
    selectPerson(null);
    await clearProgress();
    await saveVerb({ ...blankProgress(4), introduced: true });
    selectPerson("Ana");
    const ana = await loadSnapshot();
    expect(ana.verbs.map((verb) => verb.verbId)).toContain(4);

    selectPerson("Luis");
    const luis = await loadSnapshot();
    expect(luis.verbs).toHaveLength(0);
    await saveVerb({ ...blankProgress(8), introduced: true });

    selectPerson("Ana");
    const anaAgain = await loadSnapshot();
    expect(anaAgain.verbs.map((verb) => verb.verbId)).toEqual([4]);
  });
});
