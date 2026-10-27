import { useState } from "react";
import { useStore } from "../store";

export function SettingsScreen({ onExit, onExam }: { onExit: () => void; onExam: () => void }) {
  const store = useStore();
  const [message, setMessage] = useState("");
  const profile = store.profile;
  return (
    <section className="card">
      <h1>Ajustes</h1>
      <label className="check">
        <input
          type="checkbox"
          checked={profile.sound}
          onChange={(event) => void store.saveProfile({ ...profile, sound: event.target.checked })}
        />
        Sonido
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={profile.reducedMotion}
          onChange={(event) => void store.saveProfile({ ...profile, reducedMotion: event.target.checked })}
        />
        Menos movimiento
      </label>
      <fieldset>
        <legend>Criterio de corrección</legend>
        <label className="check">
          <input
            type="radio"
            name="modo"
            checked={profile.variantMode === "sheet"}
            onChange={() => void store.saveProfile({ ...profile, variantMode: "sheet" })}
          />
          Mi ficha
        </label>
        <label className="check">
          <input
            type="radio"
            name="modo"
            checked={profile.variantMode === "standard"}
            onChange={() => void store.saveProfile({ ...profile, variantMode: "standard" })}
          />
          Variantes estándar
        </label>
      </fieldset>
      <p className="help">
        Variantes estándar, además de la ficha: burned, learned, spelled, gotten, showed y sewed. No cambian el significado de la fila.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={profile.intensive}
          onChange={(event) => void store.saveProfile({ ...profile, intensive: event.target.checked })}
        />
        Intensivo: más escritura, sin borrar el repaso posterior
      </label>
      <div className="range">
        <label>
          Desde
          <input
            type="number"
            min={1}
            max={75}
            value={profile.examFrom}
            onChange={(event) => void store.saveProfile({ ...profile, examFrom: clamp(event.target.value) })}
          />
        </label>
        <label>
          Hasta
          <input
            type="number"
            min={1}
            max={75}
            value={profile.examTo}
            onChange={(event) => void store.saveProfile({ ...profile, examTo: clamp(event.target.value) })}
          />
        </label>
      </div>
      <button className="primary" type="button" onClick={onExam}>
        Practicar este rango
      </button>
      <button className="ghost" type="button" onClick={store.exportFile}>
        Exportar progreso
      </button>
      <label className="file">
        Importar JSON
        <input
          type="file"
          accept="application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              await store.importFile(JSON.parse(await file.text()));
              setMessage("Progreso importado.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "No se pudo importar");
            }
          }}
        />
      </label>
      <button
        className="danger"
        type="button"
        onClick={() => {
          if (window.confirm("¿Borrar el progreso de este móvil?")) void store.reset();
        }}
      >
        Borrar progreso
      </button>
      {message ? <p role="status">{message}</p> : null}
      <button className="ghost" type="button" onClick={onExit}>
        Inicio
      </button>
    </section>
  );
}

function clamp(value: string): number {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(75, number));
}
