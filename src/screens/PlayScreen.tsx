import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { gradeAnswer, type GradeResult } from "../../shared/grade";
import { presentText, recallQuestion } from "../../shared/questions";
import { insertRetry, planSession } from "../../shared/session";
import { getVerb } from "../../shared/verbs";
import type { PlanItem } from "../../shared/types";
import { playCue } from "../audio";
import { Capybara, Lagoon } from "../components/Capybara";
import { QuestionCard } from "../components/QuestionCard";

export type PlayMode = "adventure" | "rescue" | "race" | "exam";

const TITLES: Record<PlayMode, string> = {
  adventure: "Aprender",
  rescue: "Repasar mis fallos",
  race: "Carrera",
  exam: "Examen del rango",
};

export function PlayScreen({ mode, onExit }: { mode: PlayMode; onExit: () => void }) {
  const store = useStore();
  const [phase, setPhase] = useState<"wait" | "name" | "brief" | "play" | "done">("wait");
  const [nick, setNick] = useState(store.profile.nickname);
  const [color, setColor] = useState(store.profile.color);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<GradeResult | null>(null);
  const [helped, setHelped] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [misses, setMisses] = useState(0);
  const [left, setLeft] = useState(mode === "race" ? 120 : 0);
  const [answeredOnce, setAnsweredOnce] = useState(false);

  const ids = useMemo(() => verbIds(mode, store.profile.examFrom, store.profile.examTo, store.meta.adventureUnlocked), [
    mode,
    store.meta.adventureUnlocked,
    store.profile.examFrom,
    store.profile.examTo,
  ]);

  const saved = useRef(false);

  useEffect(() => {
    if (!store.loaded || phase !== "wait") return;
    setPhase(store.meta.named ? (mode === "adventure" ? "brief" : "play") : "name");
  }, [mode, phase, store.loaded, store.meta.named]);

  useEffect(() => {
    store.setBusy(true);
    return () => store.setBusy(false);
    // La partida no debe recargarse al llegar una actualización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "play" || items.length > 0) return;
    setItems(
      planSession({
        now: Date.now(),
        mode: mode === "exam" ? "exam" : mode,
        progress: store.verbs,
        verbIds: ids,
        variantMode: store.profile.variantMode,
        intensive: store.profile.intensive || mode === "exam" || mode === "race",
      }),
    );
  }, [ids, items.length, mode, phase, store.profile.intensive, store.profile.variantMode, store.verbs]);

  useEffect(() => {
    if (phase !== "play" || mode !== "race") return;
    const timer = window.setInterval(() => {
      setLeft((value) => {
        if (value <= 1) {
          setPhase("done");
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, phase]);

  const item = items[index];
  const progress = items.length ? index / items.length : 0;

  useEffect(() => {
    if (phase !== "done" || saved.current) return;
    saved.current = true;
    void (async () => {
      if (answeredOnce) await store.finishSession();
      if (mode === "adventure") await store.unlockAdventure();
    })();
  }, [answeredOnce, mode, phase, store]);

  async function advance(nextItems: PlanItem[], nextIndex: number) {
    if (nextIndex >= nextItems.length) {
      setPhase("done");
      return;
    }
    setItems(nextItems);
    setIndex(nextIndex);
    setFeedback(null);
    setHelped(false);
  }

  async function submit(value: string) {
    if (!item?.question || (feedback && feedback.outcome !== "almost")) return;
    const verb = getVerb(item.question.verbId);
    const result = gradeAnswer(verb, item.question, value, {
      mode: store.profile.variantMode,
      allowAlmost: mode !== "race",
      helpedAlready: helped,
    });
    if (result.outcome === "almost") {
      setHelped(true);
      setFeedback(result);
      playCue("no", store.profile.sound);
      return;
    }
    setAnsweredOnce(true);
    await store.record({
      verbId: verb.id,
      skill: item.question.skill,
      correct: result.outcome === "correct",
      helped: result.helped,
      written: item.question.written,
    });
    if (result.outcome === "correct") {
      setCorrect((count) => count + 1);
      playCue("ok", store.profile.sound);
      setFeedback(result);
      window.setTimeout(() => void advance(items, index + 1), store.profile.reducedMotion ? 250 : 700);
      return;
    }
    setMisses((count) => count + 1);
    playCue("no", store.profile.sound);
    const retry = recallQuestion(verb, Math.random, store.profile.variantMode);
    const withRetry = insertRetry(items, index, { verbId: verb.id, role: "retry", question: retry });
    setItems(withRetry);
    setFeedback(result);
  }

  if (!store.loaded) return <p>Cargando tu laguna…</p>;

  if (phase === "name") {
    return (
      <section className="card">
        <Capybara color={color} hat="none" accessory="none" mood="happy" label="Elige tu capibara" />
        <h1>Tu capibara</h1>
        <label>
          Apodo
          <input value={nick} maxLength={16} onChange={(event) => setNick(event.target.value)} aria-label="Apodo" />
        </label>
        <div className="colors" role="group" aria-label="Color del capibara">
          {(["cocoa", "caramel", "cream"] as const).map((option) => (
            <button key={option} type="button" className={option === color ? "choice on" : "choice"} onClick={() => setColor(option)}>
              {option === "cocoa" ? "Cacao" : option === "caramel" ? "Caramelo" : "Crema"}
            </button>
          ))}
        </div>
        <button
          className="primary"
          type="button"
          onClick={() => {
            void store.markNamed({ ...store.profile, nickname: nick.trim() || "Capibara", color });
            setPhase(mode === "adventure" ? "brief" : "play");
          }}
        >
          Empezar
        </button>
      </section>
    );
  }

  if (phase === "brief") {
    const block = activeBlock(store.meta.adventureUnlocked, store.verbs);
    const start = (block - 1) * 5 + 1;
    const group = Array.from({ length: 5 }, (_, offset) => getVerb(start + offset));
    return (
      <section className="card">
        <p className="eyebrow">Bloque {block} de 15</p>
        <h1>Verbos {start}–{start + 4}</h1>
        <ul className="verb-brief">
          {group.map((verb) => (
            <li key={verb.id}>
              <strong>{verb.infinitive}</strong> · {verb.past} · {verb.participle}
              <span>{verb.spanish}</span>
              {verb.note ? <small>{verb.note}</small> : null}
            </li>
          ))}
        </ul>
        <button className="primary" type="button" onClick={() => setPhase("play")}>
          Practicar
        </button>
        <button className="ghost" type="button" onClick={onExit}>
          Volver
        </button>
      </section>
    );
  }

  if (phase === "done" || !item) {
    return (
      <section className="card">
        <Capybara color={store.profile.color} hat={store.profile.hat} accessory={store.profile.accessory} mood="cheer" />
        <h1>Sesión guardada</h1>
        <p>
          {correct} aciertos · {misses} a revisar. El progreso se queda en este móvil.
        </p>
        <button className="primary" type="button" onClick={onExit}>
          Inicio
        </button>
      </section>
    );
  }

  const verb = getVerb(item.verbId);
  const card = presentText(verb);
  const showAnswer = feedback && feedback.outcome !== "almost";

  return (
    <section>
      <header className="play-top">
        <button className="ghost" type="button" onClick={onExit}>
          Salir
        </button>
        <p>{TITLES[mode]}{mode === "race" ? ` · ${left}s` : ""}</p>
      </header>
      <Lagoon progress={progress} />
      {item.role === "present" ? (
        <article className="card">
          <Capybara color={store.profile.color} hat={store.profile.hat} accessory={store.profile.accessory} mood="think" label={verb.infinitive} />
          <h1>{card.title}</h1>
          {card.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {card.help ? <p className="help">{card.help}</p> : null}
          <button
            className="primary"
            type="button"
            onClick={() => {
              void store.markIntroduced(verb.id);
              void advance(items, index + 1);
            }}
          >
            Lo tengo
          </button>
        </article>
      ) : item.question ? (
        <>
          <QuestionCard question={item.question} feedback={feedback} onAnswer={(value) => void submit(value)} reducedMotion={store.profile.reducedMotion} />
          {showAnswer ? (
            <button className="primary" type="button" onClick={() => void advance(items, index + 1)}>
              Seguir
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function verbIds(mode: PlayMode, from: number, to: number, unlocked: number): number[] {
  if (mode === "exam") {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  if (mode === "adventure") {
    const end = Math.min(75, unlocked * 5);
    return Array.from({ length: end }, (_, index) => index + 1);
  }
  return Array.from({ length: 75 }, (_, index) => index + 1);
}

function activeBlock(unlocked: number, verbs: Record<number, { introduced: boolean } | undefined>): number {
  for (let block = 1; block <= unlocked; block += 1) {
    const start = (block - 1) * 5 + 1;
    const pending = Array.from({ length: 5 }, (_, index) => start + index).some((id) => !verbs[id]?.introduced);
    if (pending) return block;
  }
  return unlocked;
}
