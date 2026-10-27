import { capyNorm } from "./normalize";
import type { DuelQuestion } from "./questions";
import type { VariantMode } from "./types";

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CREATE_LIMIT = 8;
export const CREATE_WINDOW_MS = 60 * 60 * 1000;
export const JOIN_LIMIT = 12;
export const JOIN_WINDOW_MS = 10 * 60 * 1000;
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
export const COUNTDOWN_MS = 3000;

export class DuelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuelError";
  }
}

interface Member {
  userId: string;
  nickname: string;
  capybara: string;
  ready: boolean;
  score: number;
}

interface StoredAnswer {
  raw: string;
  correct: boolean;
  points: number;
  elapsedMs: number;
  at: number;
}

interface RoundState {
  question: DuelQuestion;
  status: "pending" | "open" | "closed";
  scored: boolean;
  answers: Map<string, StoredAnswer>;
}

interface Room {
  id: string;
  code: string;
  status: "lobby" | "countdown" | "playing" | "finished" | "expired";
  hostId: string;
  variantMode: VariantMode;
  seconds: number;
  members: Map<string, Member>;
  rounds: RoundState[];
  current: number;
  deadline: number | null;
  countdownEnds: number | null;
  revealUntil: number | null;
  updatedAt: number;
  expiresAt: number;
  rematchVotes: Set<string>;
  nextRoomId: string | null;
}

interface RateRow {
  hits: number;
  windowStart: number;
}

export interface SubmitInput {
  userId: string;
  roomId: string;
  round: number;
  answer: string;
  /** Ignorado a propósito: el servidor calcula los puntos. */
  points?: number;
  correct?: boolean;
}

export interface PublicSnapshot {
  roomId: string;
  code: string;
  status: Room["status"];
  variantMode: VariantMode;
  seconds: number;
  serverNow: number;
  deadline: number | null;
  countdownEnds: number | null;
  current: number;
  members: Array<{
    userId: string;
    nickname: string;
    capybara: string;
    ready: boolean;
    score: number;
    isYou: boolean;
  }>;
  youAnswered: boolean;
  opponentAnswered: boolean;
  prompt: DuelQuestion["prompt"] | null;
  revealed: null | {
    display: string;
    results: Array<{ userId: string; correct: boolean; points: number }>;
  };
  winner: string | "tie" | null;
  nextRoomId: string | null;
  youAreHost: boolean;
}

/**
 * Reglas autoritativas del duelo, compartidas por las pruebas.
 * En producción las aplica Postgres (ver supabase/migrations) con el mismo contrato:
 * una respuesta por ronda, puntos solo en el servidor, sin revelar mientras el plazo sigue abierto.
 */
export class DuelAuthority {
  private rooms = new Map<string, Room>();
  private codes = new Map<string, string>();
  private rates = new Map<string, RateRow>();
  private sequence = 1;

  constructor(
    private readonly now: () => number,
    private readonly random: () => number,
    private readonly makeQuestions: (seed: number, mode: VariantMode) => DuelQuestion[],
  ) {}

  create(input: {
    userId: string;
    ip: string;
    nickname: string;
    capybara: string;
    variantMode: VariantMode;
    seconds: number;
    seed: number;
  }): { roomId: string; code: string } {
    this.bump("create", input.userId, input.ip, CREATE_LIMIT, CREATE_WINDOW_MS);
    this.expireSweep();
    const seconds = clampSeconds(input.seconds);
    const questions = this.makeQuestions(input.seed >>> 0, input.variantMode);
    const code = this.freshCode();
    const id = `room_${this.sequence++}`;
    const stamp = this.now();
    const room: Room = {
      id,
      code,
      status: "lobby",
      hostId: input.userId,
      variantMode: input.variantMode,
      seconds,
      members: new Map([
        [
          input.userId,
          {
            userId: input.userId,
            nickname: cleanName(input.nickname),
            capybara: input.capybara,
            ready: false,
            score: 0,
          },
        ],
      ]),
      rounds: questions.map((question) => ({
        question,
        status: "pending",
        scored: false,
        answers: new Map(),
      })),
      current: -1,
      deadline: null,
      countdownEnds: null,
      revealUntil: null,
      updatedAt: stamp,
      expiresAt: stamp + ROOM_TTL_MS,
      rematchVotes: new Set(),
      nextRoomId: null,
    };
    this.rooms.set(id, room);
    this.codes.set(code, id);
    return { roomId: id, code };
  }

  join(input: { userId: string; ip: string; code: string; nickname: string; capybara: string }): {
    roomId: string;
  } {
    this.bump("join", input.userId, input.ip, JOIN_LIMIT, JOIN_WINDOW_MS);
    const code = input.code.trim().toUpperCase();
    if (!new RegExp(`^[${CODE_ALPHABET}]{6}$`).test(code)) throw new DuelError("Código no válido");
    const roomId = this.codes.get(code);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room || this.isExpired(room)) throw new DuelError("Código no válido");
    const existing = room.members.get(input.userId);
    if (existing) return { roomId: room.id };
    if (room.members.size >= 2) throw new DuelError("Sala llena");
    if (room.status !== "lobby") throw new DuelError("La partida ya empezó");
    room.members.set(input.userId, {
      userId: input.userId,
      nickname: cleanName(input.nickname),
      capybara: input.capybara,
      ready: false,
      score: 0,
    });
    room.updatedAt = this.now();
    return { roomId: room.id };
  }

  configure(input: { userId: string; roomId: string; seconds: number; variantMode: VariantMode }): void {
    const room = this.memberRoom(input.userId, input.roomId);
    if (room.hostId !== input.userId) throw new DuelError("Solo quien crea la sala puede cambiar los ajustes");
    if (room.status !== "lobby") throw new DuelError("La partida ya empezó");
    room.seconds = clampSeconds(input.seconds);
    room.variantMode = input.variantMode;
    room.updatedAt = this.now();
  }

  ready(input: { userId: string; roomId: string }): void {
    const room = this.memberRoom(input.userId, input.roomId);
    if (room.status !== "lobby") return;
    const member = room.members.get(input.userId)!;
    member.ready = true;
    room.updatedAt = this.now();
    if (room.members.size === 2 && [...room.members.values()].every((item) => item.ready)) {
      room.status = "countdown";
      room.countdownEnds = this.now() + COUNTDOWN_MS;
    }
  }

  submit(input: SubmitInput): { duplicate: boolean } {
    const room = this.memberRoom(input.userId, input.roomId);
    this.touch(room);
    this.openIfDue(room);
    if (room.status !== "playing") throw new DuelError("La ronda no está abierta");
    if (input.round !== room.current) throw new DuelError("Esa ronda ya no está activa");
    const round = room.rounds[room.current];
    if (round.status !== "open") throw new DuelError("Esa ronda ya no está activa");
    if (room.deadline === null || this.now() > room.deadline) throw new DuelError("Envío tardío");
    const previous = round.answers.get(input.userId);
    if (previous) return { duplicate: true };
    const answer = String(input.answer ?? "").slice(0, 80);
    const correct = round.question.accepted.includes(normalizeAnswer(answer, round.question));
    round.answers.set(input.userId, {
      raw: answer,
      correct,
      points: correct ? 100 : 0,
      elapsedMs: Math.max(0, this.now() - (room.deadline - room.seconds * 1000)),
      at: this.now(),
    });
    room.updatedAt = this.now();
    return { duplicate: false };
  }

  advance(input: { userId: string; roomId: string }): void {
    const room = this.memberRoom(input.userId, input.roomId);
    this.touch(room);
    this.openIfDue(room);
    this.closeIfDue(room);
  }

  rematch(input: { userId: string; roomId: string; seed: number }): { roomId: string } | null {
    const room = this.memberRoom(input.userId, input.roomId);
    if (room.status !== "finished") throw new DuelError("La partida todavía no ha terminado");
    if (room.nextRoomId) return { roomId: room.nextRoomId };
    room.rematchVotes.add(input.userId);
    room.updatedAt = this.now();
    if (room.rematchVotes.size < room.members.size) return null;
    const created = this.create({
      userId: room.hostId,
      ip: "rematch",
      nickname: room.members.get(room.hostId)?.nickname ?? "Capibara",
      capybara: room.members.get(room.hostId)?.capybara ?? "cocoa",
      variantMode: room.variantMode,
      seconds: room.seconds,
      seed: input.seed,
    });
    const next = this.rooms.get(created.roomId)!;
    for (const member of room.members.values()) {
      if (member.userId === room.hostId) continue;
      next.members.set(member.userId, { ...member, ready: true, score: 0 });
    }
    const host = next.members.get(room.hostId);
    if (host) host.ready = true;
    next.status = "countdown";
    next.countdownEnds = this.now() + COUNTDOWN_MS;
    room.nextRoomId = next.id;
    return { roomId: next.id };
  }

  snapshot(userId: string, roomId: string): PublicSnapshot {
    const room = this.memberRoom(userId, roomId);
    this.touch(room);
    this.openIfDue(room);
    const round = room.current >= 0 ? room.rounds[room.current] : undefined;
    const youAnswered = Boolean(round?.answers.has(userId));
    const opponentAnswered = [...(round?.answers.keys() ?? [])].some((id) => id !== userId);
    const members = [...room.members.values()].map((member) => ({
      userId: member.userId,
      nickname: member.nickname,
      capybara: member.capybara,
      ready: member.ready,
      score: member.score,
      isYou: member.userId === userId,
    }));
    const revealed =
      round && round.status === "closed"
        ? {
            display: round.question.display,
            results: [...room.members.keys()].map((id) => {
              const answer = round.answers.get(id);
              return { userId: id, correct: Boolean(answer?.correct), points: answer?.points ?? 0 };
            }),
          }
        : null;
    const scores = [...room.members.values()];
    let winner: PublicSnapshot["winner"] = null;
    if (room.status === "finished" && scores.length === 2) {
      const [first, second] = scores;
      winner = first.score === second.score ? "tie" : first.score > second.score ? first.userId : second.userId;
    }
    return {
      roomId: room.id,
      code: room.code,
      status: room.status,
      variantMode: room.variantMode,
      seconds: room.seconds,
      serverNow: this.now(),
      deadline: room.deadline,
      countdownEnds: room.countdownEnds,
      current: room.current,
      members,
      youAnswered,
      opponentAnswered,
      prompt: room.status === "playing" && round?.status === "open" ? round.question.prompt : null,
      revealed,
      winner,
      nextRoomId: room.nextRoomId,
      youAreHost: room.hostId === userId,
    };
  }

  private memberRoom(userId: string, roomId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.has(userId)) throw new DuelError("No puedes ver esta sala");
    if (this.isExpired(room) && room.status !== "finished") room.status = "expired";
    return room;
  }

  private openIfDue(room: Room): void {
    if (room.status === "countdown" && room.countdownEnds !== null && this.now() >= room.countdownEnds) {
      room.status = "playing";
      room.current = 0;
      room.rounds[0].status = "open";
      room.deadline = this.now() + room.seconds * 1000;
      room.updatedAt = this.now();
    }
  }

  private closeIfDue(room: Room): void {
    if (room.status !== "playing") return;
    const round = room.rounds[room.current];
    if (!round) return;
    if (round.status === "open") {
      const everyone = [...room.members.keys()].every((id) => round.answers.has(id));
      const late = room.deadline !== null && this.now() > room.deadline;
      if (!everyone && !late) return;
      round.status = "closed";
      room.deadline = null;
      room.revealUntil = this.now() + 1200;
      if (!round.scored) {
        for (const member of room.members.values()) {
          member.score += round.answers.get(member.userId)?.points ?? 0;
        }
        round.scored = true;
      }
      if (room.current + 1 >= room.rounds.length) room.status = "finished";
      room.updatedAt = this.now();
      return;
    }
    if (round.status === "closed" && room.revealUntil !== null && this.now() >= room.revealUntil) {
      if (room.current + 1 >= room.rounds.length) {
        room.status = "finished";
        return;
      }
      room.current += 1;
      room.rounds[room.current].status = "open";
      room.deadline = this.now() + room.seconds * 1000;
      room.revealUntil = null;
      room.updatedAt = this.now();
    }
  }

  private touch(room: Room): void {
    if (this.isExpired(room) && room.status !== "finished") {
      room.status = "expired";
      return;
    }
    room.expiresAt = this.now() + ROOM_TTL_MS;
  }

  private isExpired(room: Room): boolean {
    return this.now() > room.expiresAt && room.status !== "finished";
  }

  private expireSweep(): void {
    for (const room of this.rooms.values()) {
      if (this.now() > room.expiresAt && room.status !== "finished") room.status = "expired";
    }
  }

  private freshCode(): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let code = "";
      for (let i = 0; i < 6; i += 1) {
        const index = Math.floor(this.random() * CODE_ALPHABET.length);
        code += CODE_ALPHABET[index];
      }
      if (!this.codes.has(code)) return code;
    }
    throw new DuelError("No se pudo crear un código");
  }

  private bump(action: string, userId: string, ip: string, limit: number, windowMs: number): void {
    this.hit(`${action}:user:${userId}`, limit, windowMs);
    if (ip !== "rematch") this.hit(`${action}:ip:${ip}`, limit, windowMs);
  }

  private hit(key: string, limit: number, windowMs: number): void {
    const now = this.now();
    const row = this.rates.get(key);
    if (!row || now - row.windowStart >= windowMs) {
      this.rates.set(key, { hits: 1, windowStart: now });
      return;
    }
    if (row.hits >= limit) throw new DuelError("Demasiados intentos. Espera un poco.");
    row.hits += 1;
  }
}

function clampSeconds(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.max(10, Math.min(60, Math.round(value)));
}

function cleanName(value: string): string {
  const name = value.replace(/\s+/g, " ").trim().slice(0, 16);
  return name.length > 0 ? name : "Capibara";
}

function normalizeAnswer(answer: string, question: DuelQuestion): string {
  if (question.prompt.kind === "choice") return answer.trim();
  return capyNorm(answer);
}
