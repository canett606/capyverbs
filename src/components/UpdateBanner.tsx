import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdateBanner({ busy }: { busy: boolean }) {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh || busy) return null;
  return (
    <div className="update" role="status">
      <p>Hay una versión nueva.</p>
      <button type="button" className="primary" onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
    </div>
  );
}
