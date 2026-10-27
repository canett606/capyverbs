import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { defaultMeta, defaultProfile, validateProgress, type ProgressFile } from "../shared/progressFile";
import type { Meta, Profile, VerbProgress } from "../shared/types";

interface CapyDb extends DBSchema {
  profile: { key: string; value: Profile & { id: "me" } };
  verbs: { key: number; value: VerbProgress };
  meta: { key: string; value: Meta & { id: "meta" } };
}

const NAME = "capyverbs";

function upgrade(db: IDBPDatabase<CapyDb>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore("profile", { keyPath: "id" });
    db.createObjectStore("verbs", { keyPath: "verbId" });
    db.createObjectStore("meta", { keyPath: "id" });
  }
}

export function openProgress(): Promise<IDBPDatabase<CapyDb>> {
  return openDB<CapyDb>(NAME, 1, { upgrade });
}

export interface Snapshot {
  profile: Profile;
  verbs: VerbProgress[];
  meta: Meta;
}

export async function loadSnapshot(): Promise<Snapshot> {
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
