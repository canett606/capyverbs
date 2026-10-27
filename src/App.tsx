import { useEffect, useState } from "react";
import { Capybara } from "./components/Capybara";
import { UpdateBanner } from "./components/UpdateBanner";
import { playCue } from "./audio";
import { CapyScreen } from "./screens/CapyScreen";
import { CollectionScreen } from "./screens/CollectionScreen";
import { DuelScreen } from "./screens/DuelScreen";
import { HangmanScreen } from "./screens/HangmanScreen";
import { PlayScreen } from "./screens/PlayScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { StoreProvider, useStore } from "./store";

function routeOf(): { path: string; code?: string } {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  return { path: path || "/", code: params.get("code") ?? undefined };
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const store = useStore();
  const [route, setRoute] = useState(routeOf);
  useEffect(() => {
    const onHash = () => setRoute(routeOf());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.hash = "#/";
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (path: string) => {
    playCue("tap", store.profile.sound);
    window.location.hash = path;
  };

  let screen = <Home onGo={go} />;
  if (route.path === "/aprender") screen = <PlayScreen mode="adventure" onExit={() => go("/")} />;
  else if (route.path === "/rescate") screen = <PlayScreen mode="rescue" onExit={() => go("/")} />;
  else if (route.path === "/carrera") screen = <PlayScreen mode="race" onExit={() => go("/")} />;
  else if (route.path === "/ahorcado") screen = <HangmanScreen onExit={() => go("/")} />;
  else if (route.path === "/examen") screen = <PlayScreen mode="exam" onExit={() => go("/")} />;
  else if (route.path === "/duelo") screen = <DuelScreen codeFromLink={route.code} onExit={() => go("/")} />;
  else if (route.path === "/capibaras") screen = <CapyScreen onExit={() => go("/")} />;
  else if (route.path === "/coleccion") screen = <CollectionScreen onExit={() => go("/")} />;
  else if (route.path === "/ajustes") screen = <SettingsScreen onExit={() => go("/")} onExam={() => go("/examen")} />;

  return (
    <main className="app">
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <UpdateBanner busy={store.busy} />
      <div id="contenido">{store.loaded ? screen : <p>Cargando tu laguna…</p>}</div>
    </main>
  );
}

function Home({ onGo }: { onGo: (path: string) => void }) {
  const { profile } = useStore();
  return (
    <section>
      <header className="hero">
        <Capybara color={profile.color} hat={profile.hat} accessory={profile.accessory} mood="happy" label="CapyVerbs" />
        <p className="eyebrow">Laguna de verbos</p>
        <h1>CapyVerbs</h1>
        <p>75 verbos irregulares. Una sesión corta, en este móvil, sin cuentas ni esperas.</p>
      </header>
      <nav className="menu" aria-label="Modos">
        <button className="primary" type="button" onClick={() => onGo("/aprender")}>
          Aprender
        </button>
        <button className="primary" type="button" onClick={() => onGo("/rescate")}>
          Repasar mis fallos
        </button>
        <button className="primary" type="button" onClick={() => onGo("/duelo")}>
          Duelo con código
        </button>
        <button className="primary" type="button" onClick={() => onGo("/capibaras")}>
          Mis capibaras
        </button>
      </nav>
      <div className="subnav">
        <button className="ghost" type="button" onClick={() => onGo("/carrera")}>
          Carrera
        </button>
        <button className="ghost" type="button" onClick={() => onGo("/ahorcado")}>
          Ahorcado
        </button>
        <button className="ghost" type="button" onClick={() => onGo("/coleccion")}>
          Los 75 verbos
        </button>
        <button className="ghost" type="button" onClick={() => onGo("/ajustes")}>
          Ajustes
        </button>
      </div>
    </section>
  );
}
