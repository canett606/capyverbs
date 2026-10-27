import { useEffect, useState } from "react";
import { Capybara } from "../components/Capybara";
import {
  advanceRoom,
  configureRoom,
  createRoom,
  duelConfigured,
  fetchSnapshot,
  joinRoom,
  requestRematch,
  setReady,
  submitAnswer,
  subscribeRoom,
  type DuelSnap,
} from "../duel/api";
import { useStore } from "../store";

const ROOM_KEY = "capyverbs.room";

export function DuelScreen({ codeFromLink, onExit }: { codeFromLink?: string; onExit: () => void }) {
  const store = useStore();
  const [snap, setSnap] = useState<DuelSnap | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [code, setCode] = useState(codeFromLink ?? "");
  const [seconds, setSeconds] = useState(20);
  const [draft, setDraft] = useState("");
  const [receivedAt, setReceivedAt] = useState(Date.now());
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    store.setBusy(true);
    return () => store.setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh(roomId: string) {
    const next = await fetchSnapshot(roomId);
    setSnap(next);
    setReceivedAt(Date.now());
    setOffline(false);
    localStorage.setItem(ROOM_KEY, roomId);
    return next;
  }

  useEffect(() => {
    if (!duelConfigured()) return;
    const saved = localStorage.getItem(ROOM_KEY);
    if (!saved) return;
    refresh(saved).catch(() => localStorage.removeItem(ROOM_KEY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!snap?.roomId || !duelConfigured()) return;
    const stop = subscribeRoom(snap.roomId, (status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setOffline(true);
      refresh(snap.roomId).catch(() => setOffline(true));
    });
    const poll = window.setInterval(() => {
      refresh(snap.roomId).catch(() => setOffline(true));
      if (snap.status === "playing" || snap.status === "countdown") {
        advanceRoom(snap.roomId).catch(() => undefined);
      }
    }, 2000);
    return () => {
      stop();
      window.clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap?.roomId, snap?.status]);

  if (!duelConfigured()) return <Setup onExit={onExit} />;

  const offset = snap ? snap.serverNow - receivedAt : 0;
  const serverNow = tick + offset;
  const remaining = snap?.deadline ? Math.max(0, Math.ceil((snap.deadline - serverNow) / 1000)) : null;
  const you = snap?.members.find((member) => member.isYou);
  const other = snap?.members.find((member) => !member.isYou);

  async function act(task: () => Promise<unknown>) {
    setError("");
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo completar");
    }
  }

  return (
    <section className="card">
      <button className="ghost" type="button" onClick={onExit}>
        Inicio
      </button>
      <Capybara color={store.profile.color} hat={store.profile.hat} accessory={store.profile.accessory} mood={offline ? "oops" : "happy"} />
      {offline ? (
        <p role="status" className="help">
          Se perdió el aviso en vivo. La partida sigue en el servidor; no se declara un ganador por desconexión.
        </p>
      ) : null}
      {!snap ? (
        <div className="choices">
          <h1>Duelo con código</h1>
          <label>
            Segundos por pregunta
            <input type="number" min={10} max={60} value={seconds} onChange={(event) => setSeconds(Number(event.target.value))} />
          </label>
          <button
            className="primary"
            type="button"
            onClick={() =>
              void act(async () => {
                const created = await createRoom({
                  nickname: store.profile.nickname,
                  capybara: store.profile.color,
                  variantMode: store.profile.variantMode,
                  seconds,
                });
                await refresh(created.roomId);
              })
            }
          >
            Crear sala
          </button>
          <label>
            Código
            <input value={code} maxLength={6} autoCapitalize="characters" aria-label="Código de sala" onChange={(event) => setCode(event.target.value.toUpperCase())} />
          </label>
          <button
            className="primary"
            type="button"
            onClick={() =>
              void act(async () => {
                const joined = await joinRoom({
                  code,
                  nickname: store.profile.nickname,
                  capybara: store.profile.color,
                });
                await refresh(joined.roomId);
              })
            }
          >
            Entrar
          </button>
        </div>
      ) : null}
      {snap?.status === "lobby" ? (
        <div>
          <h1>Sala {snap.code}</h1>
          <p>Comparte este enlace. Los dos tenéis que pulsar Listo.</p>
          <p className="code">{snap.code}</p>
          <button
            className="ghost"
            type="button"
            onClick={() => void navigator.clipboard.writeText(`${location.origin}${import.meta.env.BASE_URL}#/duelo?code=${snap.code}`)}
          >
            Copiar enlace
          </button>
          {snap.youAreHost ? (
            <button
              className="ghost"
              type="button"
              onClick={() => void act(async () => {
                await configureRoom({ roomId: snap.roomId, seconds, variantMode: store.profile.variantMode });
                await refresh(snap.roomId);
              })}
            >
              Guardar {seconds}s y modo {store.profile.variantMode === "sheet" ? "ficha" : "variantes"}
            </button>
          ) : (
            <p>{snap.seconds} segundos · {snap.variantMode === "sheet" ? "Mi ficha" : "Variantes estándar"}</p>
          )}
          <ul>
            {snap.members.map((member) => (
              <li key={member.userId}>
                {member.nickname} {member.ready ? "· listo" : "· esperando"}
              </li>
            ))}
          </ul>
          <button className="primary" type="button" disabled={you?.ready} onClick={() => void act(async () => {
            await setReady(snap.roomId);
            await refresh(snap.roomId);
          })}>
            Listo
          </button>
        </div>
      ) : null}
      {snap?.status === "countdown" ? <h1>Preparados…</h1> : null}
      {snap?.status === "playing" && snap.prompt && !snap.youAnswered ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const answer = snap.prompt?.kind === "write" ? draft : "";
            if (!answer && snap.prompt?.kind === "write") return;
            void act(async () => {
              await submitAnswer({ roomId: snap.roomId, round: snap.current, answer });
              setDraft("");
              await refresh(snap.roomId);
            });
          }}
        >
          <p className="eyebrow">Pregunta {snap.current + 1} · {remaining ?? snap.seconds}s</p>
          <p className="prompt">{snap.prompt.text}</p>
          {snap.prompt.help ? <p className="help">{snap.prompt.help}</p> : null}
          {snap.prompt.kind === "choice" ? (
            <div className="choices">
              {snap.prompt.options?.map((option) => (
                <button
                  key={option.id}
                  className="choice"
                  type="button"
                  onClick={() =>
                    void act(async () => {
                      await submitAnswer({ roomId: snap.roomId, round: snap.current, answer: option.id });
                      await refresh(snap.roomId);
                    })
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <label>
              Tu respuesta
              <input
                value={draft}
                aria-label="Tu respuesta"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="go"
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
          )}
          {snap.prompt.kind === "write" ? (
            <button className="primary" type="submit">
              Enviar
            </button>
          ) : null}
        </form>
      ) : null}
      {snap?.status === "playing" && snap.youAnswered && !snap.revealed ? (
        <p role="status">Respuesta enviada. {snap.opponentAnswered ? "El otro también respondió." : "El otro capibara sigue en esta pregunta."}</p>
      ) : null}
      {snap?.revealed ? (
        <div className="feedback" aria-live="polite">
          <p>Respuesta: {snap.revealed.display}</p>
          <ul>
            {snap.revealed.results.map((row) => (
              <li key={row.userId}>
                {snap.members.find((member) => member.userId === row.userId)?.nickname}: {row.points} puntos
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {snap?.status === "finished" ? (
        <div>
          <h1>{snap.winner === "tie" ? "Empate" : snap.winner === you?.userId ? "Tu capibara llega antes" : "El otro capibara llega antes"}</h1>
          <p>
            {you?.nickname} {you?.score} · {other?.nickname} {other?.score}. La velocidad no decide el duelo.
          </p>
          <button
            className="primary"
            type="button"
            onClick={() =>
              void act(async () => {
                const next = await requestRematch(snap.roomId);
                if (next.roomId) {
                  localStorage.setItem(ROOM_KEY, next.roomId);
                  await refresh(next.roomId);
                } else await refresh(snap.roomId);
              })
            }
          >
            Revancha
          </button>
        </div>
      ) : null}
      {snap?.status === "expired" ? <p>Esta sala caducó. Crea otra.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {remaining === 0 && snap?.status === "playing" ? (
        <button className="ghost" type="button" onClick={() => void act(() => advanceRoom(snap.roomId).then(() => refresh(snap.roomId)))}>
          Continuar
        </button>
      ) : null}
    </section>
  );
}

function Setup({ onExit }: { onExit: () => void }) {
  return (
    <section className="card">
      <h1>Configurar conexión online</h1>
      <p>La práctica individual ya funciona sin internet. El duelo de dos móviles necesita un proyecto Supabase gratuito, sin facturación extra.</p>
      <ol>
        <li>Crea un proyecto en supabase.com y activa Authentication → Anonymous sign-ins.</li>
        <li>Ejecuta supabase/migrations/20260929120000_duel.sql en el editor SQL.</li>
        <li>Despliega la función supabase/functions/duel.</li>
        <li>Copia la URL del proyecto y la clave anon en .env.local. No pongas la service_role en la app.</li>
        <li>Reinicia npm run dev o vuelve a publicar la página.</li>
      </ol>
      <p>El detalle está en README.md y docs/SUPABASE.md. Aquí no se simula a la otra persona.</p>
      <button className="primary" type="button" onClick={onExit}>
        Inicio
      </button>
    </section>
  );
}
