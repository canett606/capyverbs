import { useEffect, useRef, useState } from "react";
import { playCue } from "../audio";
import { Capybara } from "../components/Capybara";
import { Gallows, gallowsPart } from "../components/Gallows";
import { useStore } from "../store";
import {
  HANGMAN_MISSES,
  applyGuess,
  emptyBoard,
  noteSpoilsAnswer,
  planHangman,
  type HangmanBoard,
  type HangmanPuzzle,
} from "../../shared/hangman";
import { getVerb } from "../../shared/verbs";

const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function wordLabel(puzzle: HangmanPuzzle, infinitive: string, board: HangmanBoard, open: boolean): string {
  const visible = [...puzzle.solution]
    .map((char) => {
      if (!/[a-z]/.test(char)) return char;
      if (!open || board.guessed.includes(char)) return char.toUpperCase();
      return "hueco";
    })
    .join(" ");
  return `${puzzle.label} de ${infinitive}: ${visible}`;
}

export function HangmanScreen({ onExit }: { onExit: () => void }) {
  const store = useStore();
  const [phase, setPhase] = useState<"brief" | "play" | "done">("brief");
  const [puzzles, setPuzzles] = useState<HangmanPuzzle[]>([]);
  const [index, setIndex] = useState(0);
  const [board, setBoard] = useState<HangmanBoard>(emptyBoard());
  const [won, setWon] = useState(0);
  const [lost, setLost] = useState(0);
  const [from, setFrom] = useState(() => (store.profile.examTo - store.profile.examFrom >= 74 ? 1 : store.profile.examFrom));
  const [to, setTo] = useState(() => (store.profile.examTo - store.profile.examFrom >= 74 ? 5 : store.profile.examTo));
  const saved = useRef(false);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const wordCount = planHangman({
    mode: store.profile.variantMode,
    levels: {},
    from,
    to,
    seed: 1,
  }).length;

  useEffect(() => {
    store.setBusy(true);
    return () => store.setBusy(false);
    // La partida no debe recargarse al llegar una actualización.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key === "Enter") {
        if (phase === "brief" && wordCount > 0) {
          event.preventDefault();
          begin();
        } else if (phase === "play" && board.status !== "playing") {
          event.preventDefault();
          continueRound();
        }
        return;
      }
      if (phase !== "play" || board.status !== "playing") return;
      if (!/^[a-zA-Z]$/.test(event.key)) return;
      event.preventDefault();
      guess(event.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, from, index, phase, puzzles, store.profile.sound, store.profile.variantMode, store.verbs, to, wordCount]);

  function begin() {
    const levels: Record<number, { past: number; participle: number }> = {};
    for (const progress of Object.values(store.verbs)) {
      levels[progress.verbId] = {
        past: progress.skills.past.level,
        participle: progress.skills.participle.level,
      };
    }
    saved.current = false;
    setWon(0);
    setLost(0);
    setIndex(0);
    setBoard(emptyBoard());
    setPuzzles(
      planHangman({
        mode: store.profile.variantMode,
        levels,
        from,
        to,
        seed: Date.now() % 1_000_000_000,
      }),
    );
    setPhase("play");
  }

  function guess(raw: string) {
    const puzzle = puzzles[index];
    if (!puzzle || phase !== "play") return;
    const next = applyGuess(puzzle.solution, board, raw);
    if (next === board) return;
    setBoard(next);
    if (next.status === "won") {
      playCue("ok", store.profile.sound);
      setWon((count) => count + 1);
    } else if (next.status === "lost") {
      playCue("no", store.profile.sound);
      setLost((count) => count + 1);
    }
  }

  function continueRound() {
    if (index + 1 >= puzzles.length) {
      setPhase("done");
      if (!saved.current) {
        saved.current = true;
        void store.finishSession();
      }
      return;
    }
    setIndex((value) => value + 1);
    setBoard(emptyBoard());
  }

  if (phase === "brief") {
    return (
      <section className="card">
        <Capybara color={store.profile.color} hat={store.profile.hat} accessory={store.profile.accessory} mood="think" label="Ahorcado" />
        <h1>Ahorcado</h1>
        <p>
          Escribe el <strong>past simple</strong> y el <strong>past participle</strong> letra a letra. Arriba ves el infinitivo y el español.
          Cada fallo añade un trazo. Al sexto se completa el dibujo y se muestra la forma.
        </p>
        <p className="help">Si las dos formas se escriben igual, sale una sola palabra. En be el pasado muestra las dos, con la barra ya puesta.</p>
        <div className="range">
          <label>
            Desde
            <input
              type="number"
              min={1}
              max={75}
              inputMode="numeric"
              value={from}
              aria-label="Verbo inicial"
              onChange={(event) => setFrom(clampVerb(event.target.value, 1))}
            />
          </label>
          <label>
            Hasta
            <input
              type="number"
              min={1}
              max={75}
              inputMode="numeric"
              value={to}
              aria-label="Verbo final"
              onChange={(event) => setTo(clampVerb(event.target.value, 5))}
            />
          </label>
        </div>
        <div className="choices presets">
          <button type="button" className="choice" onClick={() => { setFrom(1); setTo(5); }}>
            1–5
          </button>
          <button type="button" className="choice" onClick={() => { setFrom(1); setTo(15); }}>
            1–15
          </button>
          <button
            type="button"
            className="choice"
            onClick={() => {
              setFrom(store.profile.examFrom);
              setTo(store.profile.examTo);
            }}
          >
            De Ajustes
          </button>
        </div>
        <p className="help">
          Verbos {lo}–{hi} de la lista · {wordCount} {wordCount === 1 ? "palabra" : "palabras"}, en orden de ficha.
        </p>
        <button className="primary" type="button" onClick={begin} disabled={wordCount === 0}>
          Empezar
        </button>
        <button className="ghost" type="button" onClick={onExit}>
          Volver
        </button>
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section className="card">
        <Capybara
          color={store.profile.color}
          hat={store.profile.hat}
          accessory={store.profile.accessory}
          mood={lost === 0 ? "cheer" : "happy"}
          label="Ronda terminada"
        />
        <h1>Ronda terminada</h1>
        <p>
          Verbos {lo}–{hi}. {won} formas escritas · {lost} para ver otra vez. Esta ronda cuenta como una sesión en este móvil.
        </p>
        <button className="primary" type="button" onClick={begin}>
          Otra ronda
        </button>
        <button className="ghost" type="button" onClick={onExit}>
          Inicio
        </button>
      </section>
    );
  }

  const puzzle = puzzles[index];
  if (!puzzle) return <p>Preparando la ronda…</p>;
  const verb = getVerb(puzzle.verbId);
  const open = board.status === "playing";
  const showNote = verb.note && (board.status !== "playing" || !noteSpoilsAnswer(verb.note, puzzle.solution));
  const readHelp = verb.phonetic && puzzle.skills.some((skill) => skill === "past" || skill === "participle") ? verb.phonetic.past : "";

  return (
    <section>
      <header className="play-top">
        <button className="ghost" type="button" onClick={onExit}>
          Salir
        </button>
        <p>
          {index + 1} / {puzzles.length} · {lo}–{hi}
        </p>
      </header>
      <article className="card hangman">
        <Gallows misses={board.misses} />
        <p className="eyebrow">{puzzle.eyebrow}</p>
        <h1>
          {verb.infinitive} · {verb.spanish}
        </h1>
        <h2>{puzzle.label}</h2>
        {readHelp ? <p className="help">Se lee {readHelp}. La escritura es la de la ficha.</p> : null}
        {showNote ? <p className="help">{verb.note}</p> : null}
        <p className="hang-word" role="group" aria-label={wordLabel(puzzle, verb.infinitive, board, open)}>
          {[...puzzle.solution].map((char, cell) => {
            const letter = /[a-z]/.test(char);
            const visible = !letter || !open || board.guessed.includes(char);
            return (
              <span key={`${cell}-${char}`} className={letter ? "hang-cell" : "hang-cell fixed"} aria-hidden={letter && !visible ? true : undefined}>
                {letter ? (visible ? char.toUpperCase() : "") : char}
              </span>
            );
          })}
        </p>
        <p aria-live="polite">
          {board.status === "won"
            ? `Escrito: ${puzzle.solution}.`
            : board.status === "lost"
              ? `La forma es ${puzzle.solution}. Fallos ${board.misses} de ${HANGMAN_MISSES}.`
              : `Fallos ${board.misses} de ${HANGMAN_MISSES}. ${gallowsPart(board.misses)}`}
        </p>
        {open ? (
          <div className="keys" role="group" aria-label="Letras">
            {KEY_ROWS.map((row) => (
              <div key={row} className="keys-row">
                {[...row].map((letter) => {
                  const used = board.guessed.includes(letter);
                  const hit = puzzle.solution.includes(letter);
                  return (
                    <button
                      key={letter}
                      type="button"
                      className={used ? (hit ? "key-letter good" : "key-letter bad") : "key-letter"}
                      disabled={used}
                      aria-label={`Letra ${letter.toUpperCase()}`}
                      onClick={() => guess(letter)}
                    >
                      {letter.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <button className="primary" type="button" onClick={continueRound}>
            {index + 1 >= puzzles.length ? "Ver el resumen" : "Siguiente"}
          </button>
        )}
      </article>
    </section>
  );
}

function clampVerb(raw: string, fallback: number): number {
  const number = Math.floor(Number(raw));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(75, number));
}
