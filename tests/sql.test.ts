import sql from "../supabase/migrations/20260929120000_duel.sql?raw";
import { describe, expect, it } from "vitest";

describe("contrato SQL del duelo", () => {
  it("cierra las tablas, fija search_path y no entrega la service role al navegador", () => {
    for (const table of ["duel_rooms", "duel_members", "duel_rounds", "duel_secrets", "duel_answers", "duel_signals", "duel_rates"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("auth.role()");
    expect(sql).toContain("primary key (room_id, round_index, user_id)");
    expect(sql).toContain("grant execute on function public.duel_snapshot(uuid) to authenticated");
    expect(sql).toContain("grant execute on function public.duel_submit(uuid, uuid, integer, text) to service_role");
    expect(sql).not.toMatch(/duel_submit\(uuid, uuid, integer, text\) to anon/);
    expect(sql).not.toMatch(/duel_submit\(uuid, uuid, integer, text\) to authenticated/);
    expect(sql).not.toMatch(/create policy[\s\S]*duel_secrets[\s\S]*for select/);
    expect(sql).toContain("points in (0, 100)");
    expect(sql).toContain("realtime.send");
  });
});
