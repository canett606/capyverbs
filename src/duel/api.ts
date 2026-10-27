import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface DuelMember {
  userId: string;
  nickname: string;
  capybara: string;
  ready: boolean;
  score: number;
  isYou: boolean;
}

export interface DuelSnap {
  roomId: string;
  code: string;
  status: "lobby" | "countdown" | "playing" | "finished" | "expired";
  variantMode: "sheet" | "standard";
  seconds: number;
  serverNow: number;
  deadline: number | null;
  countdownEnds: number | null;
  current: number;
  members: DuelMember[];
  youAnswered: boolean;
  opponentAnswered: boolean;
  prompt: {
    kind: "choice" | "write";
    text: string;
    help?: string;
    placeholder?: string;
    options?: { id: string; label: string }[];
  } | null;
  revealed: null | { display: string; results: { userId: string; correct: boolean; points: number }[] };
  winner: string | "tie" | null;
  nextRoomId: string | null;
  youAreHost: boolean;
}

let client: SupabaseClient | null = null;

export function duelConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

function supabase(): SupabaseClient {
  if (!duelConfigured()) throw new Error("Configurar conexión online");
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

export async function ensureAnon(): Promise<void> {
  const sb = supabase();
  const existing = await sb.auth.getSession();
  if (existing.data.session) return;
  const { error } = await sb.auth.signInAnonymously();
  if (error) throw new Error("No se pudo abrir la sesión anónima. Activa Anonymous sign-ins en Supabase.");
}

async function invoke(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  await ensureAnon();
  const { data, error } = await supabase().functions.invoke("duel", { body: { action, ...payload } });
  if (error) {
    const context = error as { context?: Response; message?: string };
    let detail = context.message ?? "Error de duelo";
    if (context.context) {
      try {
        const body = await context.context.clone().json();
        if (body?.error) detail = String(body.error);
      } catch {
        detail = context.message ?? detail;
      }
    }
    throw new Error(detail);
  }
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error));
  return (data ?? {}) as Record<string, unknown>;
}

export function createRoom(input: { nickname: string; capybara: string; variantMode: string; seconds: number }) {
  return invoke("create", input) as Promise<{ roomId: string; code: string }>;
}

export function joinRoom(input: { code: string; nickname: string; capybara: string }) {
  return invoke("join", input) as Promise<{ roomId: string }>;
}

export function setReady(roomId: string) {
  return invoke("ready", { roomId });
}

export function configureRoom(input: { roomId: string; seconds: number; variantMode: string }) {
  return invoke("configure", input);
}

export function submitAnswer(input: { roomId: string; round: number; answer: string }) {
  return invoke("submit", input);
}

export function advanceRoom(roomId: string) {
  return invoke("advance", { roomId });
}

export function requestRematch(roomId: string) {
  return invoke("rematch", { roomId }) as Promise<{ roomId?: string; waiting?: boolean }>;
}

export async function fetchSnapshot(roomId: string): Promise<DuelSnap> {
  await ensureAnon();
  const { data, error } = await supabase().rpc("duel_snapshot", { p_room: roomId });
  if (error) throw new Error(error.message);
  return data as DuelSnap;
}

export function subscribeRoom(roomId: string, onTick: (status: string) => void): () => void {
  const channel = supabase()
    .channel(`room:${roomId}`, { config: { private: true } })
    .on("postgres_changes", { event: "*", schema: "public", table: "duel_signals", filter: `room_id=eq.${roomId}` }, () =>
      onTick("sync"),
    )
    .on("broadcast", { event: "sync" }, () => onTick("sync"))
    .subscribe((status) => onTick(status));
  return () => {
    void supabase().removeChannel(channel);
  };
}
