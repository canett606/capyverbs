import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { defaultMeta, defaultProfile, validateProgress, type ProgressFile } from "../shared/progressFile";
import type { Meta, Profile, VerbProgress } from "../shared/types";

interface CapyDb extends DBSchema {
  profile: { key: string; value: Profile & { id: "me" } };
  verbs: { key: number; value: VerbProgress };
  meta: { key: string; value: Meta & { id: "meta" } };
}

const LEGACY = "capyverbs";
const ACTIVE = "capyverbs-active-user";
const CLAIM = "capyverbs-legacy-owner";

const memory = new Map<string, string>();
let override: string | null | undefined;

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 16);
}

export function personKey(raw: string): string {
  return cleanName(raw)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function selectPerson(name: string | null): void {
  const clean = name ? cleanName(name) : "";
  const key = personKey(clean);
  override = key || null;
  if (key) storeSet(ACTIVE, clean);
  else storeDel(ACTIVE);
}

export function resetPersonForTests(): void {
  override = undefined;
  memory.delete(ACTIVE);
  memory.delete(CLAIM);
  try {
    localStorage.removeItem(ACTIVE);
    localStorage.removeItem(CLAIM);
  } catch {
    // Las pruebas de Node no tienen localStorage.
  }
}

export function activeDisplayName(): string | null {
  if (override !== undefined) {
    if (!override) return null;
    const saved = storeGet(ACTIVE);
    const clean = saved ? cleanName(saved) : "";
    return personKey(clean) === override ? clean : null;
  }
  return browserName();
}

function browserName(): string | null {
  try {
    if (typeof window !== "undefined") {
      const query = new URLSearchParams(window.location.search).get("usuario");
      const fromQuery = query ? cleanName(query) : "";
      if (personKey(fromQuery)) {
        storeSet(ACTIVE, fromQuery);
        return fromQuery;
      }
    }
  } catch {
    // Sin ventana, se usa el nombre ya guardado.
  }
  const saved = storeGet(ACTIVE);
  const clean = saved ? cleanName(saved) : "";
  return personKey(clean) ? clean : null;
}

function currentKey(): string | null {
  if (override !== undefined) return override;
  const name = browserName();
  return name ? personKey(name) : null;
}

function currentDbName(): string {
  const key = currentKey();
  return key ? `${LEGACY}-${key}` : LEGACY;
}

function storeGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    // Safari privado o Node.
  }
  return memory.get(key) ?? null;
}

function storeSet(key: string, value: string): void {
  memory.set(key, value);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // El nombre sigue en memoria durante esta visita.
  }
}

function storeDel(key: string): void {
  memory.delete(key);
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Nada que borrar fuera de memoria.
  }
}

function upgrade(db: IDBPDatabase<CapyDb>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore("profile", { keyPath: "id" });
    db.createObjectStore("verbs", { keyPath: "verbId" });
    db.createObjectStore("meta", { keyPath: "id" });
  }
}

export function openProgress(): Promise<IDBPDatabase<CapyDb>> {
  return openDB<CapyDb>(currentDbName(), 1, { upgrade });
}

async function claimLegacyOnce(): Promise<void> {
  const target = currentDbName();
  if (target === LEGACY || storeGet(CLAIM)) return;
  const named = await openDB<CapyDb>(target, 1, { upgrade });
  const existing = await named.getAll("verbs");
  if (existing.length > 0) {
    storeSet(CLAIM, target);
    return;
  }
  const legacy = await openDB<CapyDb>(LEGACY, 1, { upgrade });
  const verbs = await legacy.getAll("verbs");
  const profile = await legacy.get("profile", "me");
  const meta = await legacy.get("meta", "meta");
  if (!verbs.length && !profile && !meta) {
    storeSet(CLAIM, target);
    return;
  }
  const tx = named.transaction(["profile", "verbs", "meta"], "readwrite");
  if (profile) await tx.objectStore("profile").put(profile);
  if (meta) await tx.objectStore("meta").put(meta);
  for (const verb of verbs) await tx.objectStore("verbs").put(verb);
  await tx.done;
  const wipe = legacy.transaction(["profile", "verbs", "meta"], "readwrite");
  await wipe.objectStore("profile").clear();
  await wipe.objectStore("verbs").clear();
  await wipe.objectStore("meta").clear();
  await wipe.done;
  storeSet(CLAIM, target);
}

export interface Snapshot {
  profile: Profile;
  verbs: VerbProgress[];
  meta: Meta;
}

export async function loadSnapshot(): Promise<Snapshot> {
  await claimLegacyOnce();
  const db = await openProgress();
  const profile = await db.get("profile", "me");
  const meta = await db.get("meta", "meta");
  const verbs = await db.getAll("verbs");
  return {
    profile: profile ? stripId(profile) : defaultProfile(),
    meta: meta ? stripMeta(meta) : defaultMeta(),
    verbs,
  };
}

export async function saveProfile(profile: Profile): Promise<void> {
  const db = await openProgress();
  await db.put("profile", { ...profile, id: "me" });
}

export async function saveMeta(meta: Meta): Promise<void> {
  const db = await openProgress();
  await db.put("meta", { ...meta, id: "meta" });
}

export async function saveVerb(verb: VerbProgress): Promise<void> {
  const db = await openProgress();
  await db.put("verbs", verb);
}

export async function replaceAll(file: ProgressFile): Promise<void> {
  const clean = validateProgress(file);
  const db = await openProgress();
  const tx = db.transaction(["profile", "verbs", "meta"], "readwrite");
  await tx.objectStore("verbs").clear();
  await tx.objectStore("profile").put({ ...clean.profile, id: "me" });
  await tx.objectStore("meta").put({ ...clean.meta, id: "meta" });
  for (const verb of clean.verbs) await tx.objectStore("verbs").put(verb);
  await tx.done;
}

export async function clearProgress(): Promise<void> {
  const db = await openProgress();
  const tx = db.transaction(["profile", "verbs", "meta"], "readwrite");
  await tx.objectStore("profile").clear();
  await tx.objectStore("verbs").clear();
  await tx.objectStore("meta").clear();
  await tx.done;
}

export function toFile(snapshot: Snapshot): ProgressFile {
  return validateProgress({
    format: "capyverbs-progress",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: snapshot.profile,
    verbs: snapshot.verbs,
    meta: snapshot.meta,
  });
}

function stripId(profile: Profile & { id: string }): Profile {
  const { id: _id, ...rest } = profile;
  return rest;
}

function stripMeta(meta: Meta & { id: string }): Meta {
  const { id: _id, ...rest } = meta;
  return rest;
}
