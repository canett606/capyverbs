import { describe, expect, it } from "vitest";
import { DuelAuthority, DuelError } from "../shared/duel";
import { buildDuelQuestions } from "../shared/questions";

function harness() {
  let now = 1_000_000;
  let step = 1;
  const server = new DuelAuthority(
    () => now,
    () => {
      step += 1;
      return ((step * 37) % 1000) / 1000;
    },
    (seed, mode) => buildDuelQuestions(seed, mode, 10),
  );
  return {
    server,
    advanceNow: (ms: number) => {
      now += ms;
    },
    setNow: (value: number) => {
      now = value;
    },
  };
}

function answerOf(server: DuelAuthority, userId: string, roomId: string, raw: string, seed: number) {
  const snap = server.snapshot(userId, roomId);
  if (!snap.prompt) throw new Error("No hay pregunta");
  const round = buildDuelQuestions(seed, snap.variantMode, 10)[snap.current];
  const answer = raw === "AUTO" ? round.accepted[0] : raw;
  return server.submit({ userId, roomId, round: snap.current, answer, points: 9999, correct: true });
}

describe("duelo autoritativo", () => {
  it("juega, empata y abre la revancha sin fiarse de los puntos del cliente", () => {
    const { server, advanceNow } = harness();
    const created = server.create({
      userId: "ana",
      ip: "10.0.0.1",
      nickname: "Ana",
      capybara: "cocoa",
      variantMode: "sheet",
      seconds: 20,
      seed: 1,
    });
    expect(created.code).toHaveLength(6);
    expect(created.roomId).not.toBe(created.code);
    const joined = server.join({
      userId: "leo",
      ip: "10.0.0.2",
      code: created.code,
      nickname: "Leo",
      capybara: "cream",
    });
    expect(joined.roomId).toBe(created.roomId);
    server.ready({ userId: "ana", roomId: created.roomId });
    server.ready({ userId: "leo", roomId: created.roomId });
    advanceNow(3000);
    server.advance({ userId: "ana", roomId: created.roomId });
    for (let round = 0; round < 10; round += 1) {
      const before = server.snapshot("ana", created.roomId);
      expect(before.current).toBe(round);
      expect(JSON.stringify(before)).not.toContain('"accepted"');
      answerOf(server, "ana", created.roomId, "AUTO", 1);
      const duplicate = answerOf(server, "ana", created.roomId, "AUTO", 1);
      expect(duplicate.duplicate).toBe(true);
      const hidden = server.snapshot("leo", created.roomId);
      expect(hidden.revealed).toBeNull();
      expect(hidden.opponentAnswered).toBe(true);
      answerOf(server, "leo", created.roomId, "AUTO", 1);
      server.advance({ userId: "leo", roomId: created.roomId });
      const shown = server.snapshot("ana", created.roomId);
      expect(shown.revealed?.results.every((row) => row.points === 100 || row.points === 0)).toBe(true);
      expect(shown.revealed?.results.reduce((sum, row) => sum + row.points, 0)).toBe(200);
      advanceNow(1200);
      server.advance({ userId: "ana", roomId: created.roomId });
    }
    const done = server.snapshot("ana", created.roomId);
    expect(done.status).toBe("finished");
    expect(done.winner).toBe("tie");
    expect(done.members.every((member) => member.score === 1000)).toBe(true);
    expect(server.rematch({ userId: "ana", roomId: created.roomId, seed: 2 })).toBeNull();
    const next = server.rematch({ userId: "leo", roomId: created.roomId, seed: 2 });
    expect(next?.roomId).not.toBe(created.roomId);
    const again = server.snapshot("ana", next!.roomId);
    expect(again.status).toBe("countdown");
    expect(again.members).toHaveLength(2);
  });

  it("rechaza sala llena, código inválido, intruso, ronda ajena, tardanza y manipulación", () => {
    const { server, advanceNow, setNow } = harness();
    const created = server.create({
      userId: "ana",
      ip: "10.1.0.1",
      nickname: "Ana",
      capybara: "cocoa",
      variantMode: "sheet",
      seconds: 20,
      seed: 3,
    });
    server.join({ userId: "leo", ip: "10.1.0.2", code: created.code, nickname: "Leo", capybara: "caramel" });
    expect(() =>
      server.join({ userId: "zoe", ip: "10.1.0.3", code: created.code, nickname: "Zoe", capybara: "cream" }),
    ).toThrow(/Sala llena/);
    expect(() => server.join({ userId: "zoe", ip: "10.1.0.3", code: "NOPE", nickname: "Zoe", capybara: "cream" })).toThrow(
      /no válido/,
    );
    expect(() => server.snapshot("zoe", created.roomId)).toThrow(DuelError);
    server.ready({ userId: "ana", roomId: created.roomId });
    server.ready({ userId: "leo", roomId: created.roomId });
    advanceNow(3000);
    server.advance({ userId: "ana", roomId: created.roomId });
    expect(() => server.submit({ userId: "ana", roomId: created.roomId, round: 4, answer: "x" })).toThrow(/no está activa/);
    const wrong = server.submit({
      userId: "ana",
      roomId: created.roomId,
      round: 0,
      answer: "esto-no-es-una-forma",
      points: 9999,
      correct: true,
    });
    expect(wrong.duplicate).toBe(false);
    server.submit({ userId: "leo", roomId: created.roomId, round: 0, answer: "tampoco" });
    server.advance({ userId: "ana", roomId: created.roomId });
    const closed = server.snapshot("leo", created.roomId);
    expect(closed.revealed?.results.every((row) => row.points === 0)).toBe(true);
    advanceNow(1200);
    server.advance({ userId: "ana", roomId: created.roomId });
    const playing = server.snapshot("ana", created.roomId);
    setNow((playing.deadline ?? 0) + 5);
    expect(() => server.submit({ userId: "ana", roomId: created.roomId, round: playing.current, answer: "late" })).toThrow(
      /tardío/,
    );
    server.advance({ userId: "leo", roomId: created.roomId });
    const afterLate = server.snapshot("ana", created.roomId);
    expect(afterLate.members.find((member) => member.isYou)?.score).toBe(0);
  });

  it("recupera el marcador autoritativo al reconectar y no revela la ronda siguiente", () => {
    const { server, advanceNow } = harness();
    const created = server.create({
      userId: "ana",
      ip: "10.2.0.1",
      nickname: "Ana",
      capybara: "cocoa",
      variantMode: "sheet",
      seconds: 20,
      seed: 4,
    });
    server.join({ userId: "leo", ip: "10.2.0.2", code: created.code.toLowerCase(), nickname: "Leo", capybara: "cocoa" });
    server.ready({ userId: "ana", roomId: created.roomId });
    server.ready({ userId: "leo", roomId: created.roomId });
    advanceNow(3000);
    server.advance({ userId: "ana", roomId: created.roomId });
    const first = server.snapshot("ana", created.roomId);
    const future = buildDuelQuestions(4, "sheet", 10)[1].prompt.text;
    expect(JSON.stringify(first)).not.toContain(future);
    answerOf(server, "ana", created.roomId, "AUTO", 4);
    answerOf(server, "leo", created.roomId, "NO", 4);
    server.advance({ userId: "ana", roomId: created.roomId });
    advanceNow(1200);
    server.advance({ userId: "ana", roomId: created.roomId });
    const back = server.snapshot("ana", created.roomId);
    expect(back.current).toBe(1);
    expect(back.members.find((member) => member.userId === "ana")?.score).toBe(100);
    expect(back.members.find((member) => member.userId === "leo")?.score).toBe(0);
    expect(back.status).toBe("playing");
  });

  it("limita creación y accesos por identidad", () => {
    const { server } = harness();
    for (let i = 0; i < 8; i += 1) {
      server.create({
        userId: "ana",
        ip: `10.9.0.${i}`,
        nickname: "Ana",
        capybara: "cocoa",
        variantMode: "sheet",
        seconds: 20,
        seed: i + 1,
      });
    }
    expect(() =>
      server.create({
        userId: "ana",
        ip: "10.9.1.9",
        nickname: "Ana",
        capybara: "cocoa",
        variantMode: "sheet",
        seconds: 20,
        seed: 9,
      }),
    ).toThrow(/Demasiados/);
  });
});
