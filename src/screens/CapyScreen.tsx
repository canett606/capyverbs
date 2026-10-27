import { COSMETICS } from "../../shared/rewards";
import { Capybara } from "../components/Capybara";
import { useStore } from "../store";

export function CapyScreen({ onExit }: { onExit: () => void }) {
  const store = useStore();
  const hats = COSMETICS.filter((item) => item.kind === "hat" || item.id === "none");
  return (
    <section className="card">
      <Capybara
        color={store.profile.color}
        hat={store.profile.hat}
        accessory={store.profile.accessory}
        mood="cheer"
        label={store.profile.nickname}
      />
      <h1>{store.profile.nickname}</h1>
      <p>
        {store.stats.practicedVerbs} verbos practicados · {store.stats.mastered} retenidos · {store.stats.days} días.
        Los complementos no cambian la puntuación.
      </p>
      <div className="choices">
        {hats.map((item) => {
          const open = item.test(store.stats);
          return (
            <button
              key={item.id}
              type="button"
              className={store.profile.hat === item.id ? "choice on" : "choice"}
              disabled={!open}
              onClick={() => void store.saveProfile({ ...store.profile, hat: item.id })}
            >
              {item.name}
              {open ? "" : " · bloqueado"}
            </button>
          );
        })}
        <button
          type="button"
          className={store.profile.accessory === "orange" ? "choice on" : "choice"}
          disabled={!COSMETICS.find((item) => item.id === "orange")?.test(store.stats)}
          onClick={() => void store.saveProfile({ ...store.profile, accessory: store.profile.accessory === "orange" ? "none" : "orange" })}
        >
          Naranja
        </button>
      </div>
      <button className="ghost" type="button" onClick={onExit}>
        Inicio
      </button>
    </section>
  );
}
