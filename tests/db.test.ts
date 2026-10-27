import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { blankProgress } from "../shared/scheduler";
import { clearProgress, loadSnapshot, replaceAll, saveVerb, toFile } from "../src/db";

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
});
