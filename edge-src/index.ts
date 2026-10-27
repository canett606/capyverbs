import { createClient } from "@supabase/supabase-js";
import { buildDuelQuestions } from "../shared/questions";
import type { VariantMode } from "../shared/types";

declare const Deno: {
  serve: (handler: (request: Request) => Promise<Response> | Response) => void;
  env: { get(name: string): string | undefined };
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Falta la configuración del servidor" }, 500);

  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesión no válida" }, 401);

  const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "unknown")
    .split(",")[0]
    .trim()
    .slice(0, 64);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string") return json({ error: "Petición no válida" }, 400);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = userData.user.id;
  const action = body.action;

  const call = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return json({ error: clean(error.message) }, 400);
    return json(data ?? { ok: true }, 200);
  };

  if (action === "create" || action === "rematch") {
    const variant = body.variantMode === "standard" ? "standard" : "sheet";
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    const rounds = buildDuelQuestions(seed, variant as VariantMode, 10).map((question) => ({
      prompt: question.prompt,
      accepted: question.accepted,
      display: question.display,
    }));
    if (action === "create") {
      return call("duel_create", {
        p_user: userId,
        p_ip: ip,
        p_nickname: String(body.nickname ?? ""),
        p_capybara: String(body.capybara ?? "cocoa"),
        p_variant: variant,
        p_seconds: Number(body.seconds ?? 20),
        p_rounds: rounds,
      });
    }
    return call("duel_rematch", { p_user: userId, p_room: body.roomId, p_rounds: rounds });
  }

  if (action === "join") {
    return call("duel_join", {
      p_user: userId,
      p_ip: ip,
      p_code: String(body.code ?? "").trim().toUpperCase(),
      p_nickname: String(body.nickname ?? ""),
      p_capybara: String(body.capybara ?? "cocoa"),
    });
  }
  if (action === "ready") return call("duel_ready", { p_user: userId, p_room: body.roomId });
  if (action === "configure") {
    return call("duel_configure", {
      p_user: userId,
      p_room: body.roomId,
      p_seconds: Number(body.seconds ?? 20),
      p_variant: body.variantMode === "standard" ? "standard" : "sheet",
    });
  }
  if (action === "submit") {
    return call("duel_submit", {
      p_user: userId,
      p_room: body.roomId,
      p_round: Number(body.round),
      p_answer: String(body.answer ?? ""),
    });
  }
  if (action === "advance") return call("duel_advance", { p_user: userId, p_room: body.roomId });
  return json({ error: "Acción no válida" }, 400);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clean(message: string): string {
  const known = [
    "Sala llena",
    "Código no válido",
    "La partida ya empezó",
    "Envío tardío",
    "Esa ronda ya no está activa",
    "La ronda no está abierta",
    "No puedes ver esta sala",
    "Demasiados intentos. Espera un poco.",
    "La partida todavía no ha terminado",
    "Solo quien crea la sala puede cambiar los ajustes",
  ];
  return known.find((item) => message.includes(item)) ?? "No se pudo completar el duelo";
}
