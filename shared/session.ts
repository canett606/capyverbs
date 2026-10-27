import { introQuestion, mulberry32, recallQuestion, reviewQuestion } from "./questions";
import { isVerbDue } from "./scheduler";
import type { PlanItem, VariantMode, VerbProgress } from "./types";
import { getVerb } from "./verbs";

export interface PlanInput {
  now: number;
  mode: "adventure" | "rescue" | "race" | "exam";
  progress: Record<number, VerbProgress | undefined>;
  verbIds: number[];
  variantMode: VariantMode;
  intensive: boolean;
  rng?: () => number;
  target?: number;
  newVerbBudget?: number;
}

export function planSession(input: PlanInput): PlanItem[] {
  const rng = input.rng ?? mulberry32(input.now % 2147483647 || 1);
  const target = input.target ?? (input.mode === "race" ? 10 : 12);
  const budget = input.mode === "adventure" || input.mode === "exam" ? (input.newVerbBudget ?? 2) : 0;
  const due = input.verbIds.filter((id) => {
    const progress = input.progress[id];
    return progress?.introduced && isVerbDue(progress, input.now);
  });
  const rescueRank = (id: number) => {
    const progress = input.progress[id];
    if (!progress?.introduced) return 0;
    const fails = Object.values(progress.skills).reduce((sum, skill) => sum + skill.fails, 0);
    return fails + (isVerbDue(progress, input.now) ? 5 : 0);
  };
  const orderedDue =
    input.mode === "rescue" ? due.slice().sort((a, b) => rescueRank(b) - rescueRank(a)) : due.slice();
  const introduced = input.verbIds.filter((id) => input.progress[id]?.introduced);
  const fresh = input.verbIds.filter((id) => !input.progress[id]?.introduced);
  const newIds = input.mode === "race" ? [] : fresh.slice(0, budget);
  const fillerIds = introduced.filter((id) => !orderedDue.includes(id));
  if (input.mode === "rescue") {
    const contrasts = [39, 40, 6, 66, 50, 68].filter(
      (id) => input.verbIds.includes(id) && input.progress[id]?.introduced && !orderedDue.includes(id),
    );
    fillerIds.unshift(...contrasts.filter((id) => !fillerIds.includes(id)));
  }

  const items: PlanItem[] = [];
  const queue: PlanItem[] = [
    ...orderedDue.map((id) => reviewItem(id, rng, input, "review")),
    ...fillerIds.map((id) => reviewItem(id, rng, input, "filler")),
  ];

  if (newIds.length === 0 && queue.length === 0) {
    const starters = input.verbIds.slice(0, Math.min(input.mode === "race" ? target : 5, input.verbIds.length));
    if (input.mode === "race" || input.mode === "rescue") {
      return starters.map((id) => reviewItem(id, rng, input, "filler"));
    }
    for (const id of starters) {
      items.push({ verbId: id, role: "present", question: null });
      items.push({ verbId: id, role: "intro", question: introQuestion(getVerb(id), rng) });
    }
    return items;
  }

  for (const id of newIds) {
    const gap = 2 + Math.floor(rng() * 3);
    items.push({ verbId: id, role: "present", question: null });
    items.push({ verbId: id, role: "intro", question: introQuestion(getVerb(id), rng) });
    const others = takeOthers(queue, id, gap);
    items.push(...others);
    items.push({
      verbId: id,
      role: "recall",
      question: recallQuestion(getVerb(id), rng, input.variantMode),
    });
  }

  while (items.length < target && queue.length > 0) items.push(queue.shift()!);
  if (items.length === 0) {
    return input.verbIds.slice(0, target).map((id) => reviewItem(id, rng, input, "filler"));
  }
  return items;
}

function reviewItem(
  id: number,
  rng: () => number,
  input: PlanInput,
  role: "review" | "filler",
): PlanItem {
  return {
    verbId: id,
    role,
    question: reviewQuestion(getVerb(id), rng, input.variantMode, input.intensive || input.mode === "race"),
  };
}

function takeOthers(queue: PlanItem[], verbId: number, count: number): PlanItem[] {
  const picked: PlanItem[] = [];
  const kept: PlanItem[] = [];
  for (const item of queue) {
    if (picked.length < count && item.verbId !== verbId) picked.push(item);
    else kept.push(item);
  }
  queue.splice(0, queue.length, ...kept);
  return picked;
}

export function insertRetry(queue: PlanItem[], currentIndex: number, retry: PlanItem): PlanItem[] {
  const rest = queue.length - currentIndex - 1;
  if (rest < 3) return queue;
  const gap = Math.min(4, rest);
  const slice = queue.slice(currentIndex + 1, currentIndex + 1 + gap + 1);
  if (slice.some((item) => item.verbId === retry.verbId && item.role === "retry")) return queue;
  const next = queue.slice();
  next.splice(currentIndex + 1 + gap, 0, retry);
  return next;
}

export function countOtherQuestionsBetween(items: PlanItem[], verbId: number): number | null {
  const present = items.findIndex((item) => item.role === "present" && item.verbId === verbId);
  const recall = items.findIndex((item) => item.role === "recall" && item.verbId === verbId);
  if (present < 0 || recall < 0) return null;
  return items.slice(present + 1, recall).filter((item) => item.verbId !== verbId && item.question).length;
}
