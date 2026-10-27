import { useMemo, useState } from "react";
import { isMastered, localDay, practicedOn } from "../../shared/scheduler";
import { VERBS, patternLabel } from "../../shared/verbs";
import type { Pattern } from "../../shared/types";
import { useStore } from "../store";

export function CollectionScreen({ onExit }: { onExit: () => void }) {
  const { verbs } = useStore();
  const [query, setQuery] = useState("");
  const [pattern, setPattern] = useState<Pattern | "all">("all");
  const [status, setStatus] = useState<"all" | "new" | "practice" | "mastered">("all");
  const today = localDay();
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return VERBS.filter((verb) => {
      const progress = verbs[verb.id];
      if (pattern !== "all" && verb.pattern !== pattern) return false;
      const mastered = progress ? isMastered(progress) : false;
      if (status === "new" && progress?.introduced) return false;
      if (status === "mastered" && !mastered) return false;
      if (status === "practice" && (!progress?.introduced || mastered)) return false;
      if (!needle) return true;
      return (
        verb.infinitive.includes(needle) ||
        verb.past.includes(needle) ||
        verb.participle.includes(needle) ||
        verb.spanish.toLowerCase().includes(needle) ||
        String(verb.id) === needle
      );
    });
  }, [pattern, query, status, verbs]);

  return (
    <section>
      <button className="ghost" type="button" onClick={onExit}>
        Inicio
      </button>
      <h1>Los 75 verbos</h1>
      <label>
        Buscar
        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar verbo" />
      </label>
      <div className="filters">
        <select aria-label="Dificultad" value={pattern} onChange={(event) => setPattern(event.target.value as Pattern | "all")}>
          <option value="all">Todas las formas</option>
          <option value="identical">Tres formas iguales</option>
          <option value="past_eq_participle">Pasado = participio</option>
          <option value="three">Tres formas distintas</option>
          <option value="special">Casos especiales</option>
        </select>
        <select aria-label="Progreso" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
          <option value="all">Todo el progreso</option>
          <option value="new">Nuevos</option>
          <option value="practice">En práctica</option>
          <option value="mastered">Retenidos</option>
        </select>
      </div>
      <table className="verbs">
        <caption>{rows.length} verbos de la ficha</caption>
        <thead>
          <tr>
            <th>#</th>
            <th>Infinitivo</th>
            <th>Pasado</th>
            <th>Participio</th>
            <th>Español</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((verb) => {
            const progress = verbs[verb.id];
            const mastered = progress ? isMastered(progress) : false;
            const todayBadge = progress ? practicedOn(progress, today) : false;
            const label = !progress?.introduced
              ? "Nuevo"
              : mastered
                ? todayBadge
                  ? "Retenido · practicado hoy"
                  : "Retenido"
                : todayBadge
                  ? "Practicado hoy"
                  : "En práctica";
            return (
              <tr key={verb.id}>
                <td>{verb.id}</td>
                <td>{verb.infinitive}</td>
                <td>{verb.past}</td>
                <td>{verb.participle}</td>
                <td>{verb.spanish}</td>
                <td>
                  {label}
                  <small>{patternLabel(verb.pattern)}</small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
