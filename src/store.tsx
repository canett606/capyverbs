import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clearProgress, loadSnapshot, replaceAll, saveMeta as persistMeta, saveProfile as persistProfile, saveVerb, toFile } from "./db";
import { validateProgress } from "../shared/progressFile";
import { defaultMeta, defaultProfile } from "../shared/progressFile";
import { COSMETICS, isUnlocked, rewardStats } from "../shared/rewards";
import { applyOutcome, blankProgress, isMastered, localDay } from "../shared/scheduler";
import type { Meta, Profile, Skill, VerbProgress } from "../shared/types";

interface StoreValue {
  loaded: boolean;
  profile: Profile;
  meta: Meta;
  verbs: Record<number, VerbProgress>;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  saveProfile: (profile: Profile) => Promise<void>;
  markNamed: (profile: Profile) => Promise<void>;
  markIntroduced: (verbId: number) => Promise<void>;
  record: (input: {
    verbId: number;
    skill: Skill;
    correct: boolean;
    helped: boolean;
    written: boolean;
    now?: number;
  }) => Promise<void>;
  finishSession: () => Promise<void>;
  unlockAdventure: () => Promise<void>;
  exportFile: () => void;
  importFile: (raw: unknown) => Promise<void>;
  reset: () => Promise<void>;
  stats: ReturnType<typeof rewardStats>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile>(defaultProfile());
  const [meta, setMeta] = useState<Meta>(defaultMeta());
  const [verbs, setVerbs] = useState<Record<number, VerbProgress>>({});
  const [busy, setBusy] = useState(false);
  const verbsRef = useRef(verbs);
  const metaRef = useRef(meta);
  const profileRef = useRef(profile);
  verbsRef.current = verbs;
  metaRef.current = meta;
  profileRef.current = profile;

  useEffect(() => {
    loadSnapshot()
      .then((snapshot) => {
        setProfile(snapshot.profile);
        setMeta(snapshot.meta);
        setVerbs(Object.fromEntries(snapshot.verbs.map((verb) => [verb.verbId, verb])));
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    const reduce = profile.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.documentElement.dataset.motion = reduce ? "reduce" : "full";
  }, [profile.reducedMotion]);

  const stats = useMemo(
    () => rewardStats(Object.values(verbs), meta.sessions, meta.days),
    [meta.days, meta.sessions, verbs],
  );

  const value = useMemo<StoreValue>(() => {
    return {
      loaded,
      profile,
      meta,
      verbs,
      busy,
      setBusy,
      stats,
      async saveProfile(next) {
        profileRef.current = next;
        setProfile(next);
        await persistProfile(next);
      },
      async markNamed(next) {
        const named = { ...metaRef.current, named: true };
        profileRef.current = next;
        metaRef.current = named;
        setProfile(next);
        setMeta(named);
        await persistProfile(next);
        await persistMeta(named);
      },
      async markIntroduced(verbId) {
        const current = verbsRef.current[verbId] ?? blankProgress(verbId);
        if (current.introduced) return;
        const next = { ...current, introduced: true };
        verbsRef.current = { ...verbsRef.current, [verbId]: next };
        setVerbs(verbsRef.current);
        await saveVerb(next);
      },
      async record(input) {
        const now = input.now ?? Date.now();
        const day = localDay(now);
        const current = verbsRef.current[input.verbId] ?? blankProgress(input.verbId);
        const skill = applyOutcome(current.skills[input.skill], {
          now,
          day,
          correct: input.correct,
          helped: input.helped,
          written: input.written,
        });
        const next: VerbProgress = {
          ...current,
          introduced: true,
          skills: { ...current.skills, [input.skill]: skill },
        };
        verbsRef.current = { ...verbsRef.current, [input.verbId]: next };
        setVerbs(verbsRef.current);
        await saveVerb(next);
      },
      async finishSession() {
        const day = localDay();
        const days = metaRef.current.days.includes(day) ? metaRef.current.days : [...metaRef.current.days, day];
        const next = { ...metaRef.current, sessions: metaRef.current.sessions + 1, days };
        metaRef.current = next;
        setMeta(next);
        await persistMeta(next);
      },
      async unlockAdventure() {
        const block = metaRef.current.adventureUnlocked;
        if (block >= 15) return;
        const start = (block - 1) * 5 + 1;
        const ready = Array.from({ length: 5 }, (_, index) => start + index).every((id) => verbsRef.current[id]?.introduced);
        if (!ready) return;
        const next = { ...metaRef.current, adventureUnlocked: block + 1 };
        metaRef.current = next;
        setMeta(next);
        await persistMeta(next);
      },
      exportFile() {
        const file = toFile({ profile, meta, verbs: Object.values(verbs) });
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "capyverbs-progreso.json";
        link.click();
        URL.revokeObjectURL(url);
      },
      async importFile(raw) {
        const file = validateProgress(raw);
        await replaceAll(file);
        profileRef.current = file.profile;
        metaRef.current = file.meta;
        verbsRef.current = Object.fromEntries(file.verbs.map((verb) => [verb.verbId, verb]));
        setProfile(file.profile);
        setMeta(file.meta);
        setVerbs(verbsRef.current);
      },
      async reset() {
        await clearProgress();
        profileRef.current = defaultProfile();
        metaRef.current = defaultMeta();
        verbsRef.current = {};
        setProfile(profileRef.current);
        setMeta(metaRef.current);
        setVerbs({});
      },
    };
  }, [busy, loaded, meta, profile, stats, verbs]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Falta el almacén");
  return value;
}

export function cosmeticAllowed(id: string, stats: ReturnType<typeof rewardStats>): boolean {
  return isUnlocked(id, stats);
}

export { COSMETICS, isMastered };
