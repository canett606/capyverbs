import type { CapyColor } from "../../shared/types";

const COLORS: Record<CapyColor, { body: string; head: string; belly: string }> = {
  cocoa: { body: "#8d5a34", head: "#a86b3d", belly: "#e6c39a" },
  caramel: { body: "#c4844a", head: "#d59a5c", belly: "#f3ddc0" },
  cream: { body: "#e0b07a", head: "#efc89a", belly: "#fff6e8" },
};

export function Capybara({
  color,
  hat,
  accessory,
  mood = "idle",
  label = "Capibara",
}: {
  color: CapyColor;
  hat: string;
  accessory: string;
  mood?: "idle" | "happy" | "oops" | "cheer" | "think";
  label?: string;
}) {
  const paint = COLORS[color];
  const mouth =
    mood === "oops"
      ? "M78 92 Q90 84 102 92"
      : mood === "cheer" || mood === "happy"
        ? "M74 88 Q90 104 106 88"
        : "M78 90 Q90 98 102 90";
  const brows = mood === "think" ? "M70 62 L82 68 M110 62 L98 68" : "";
  return (
    <svg className="capy" viewBox="0 0 180 150" role="img" aria-label={label}>
      <ellipse cx="90" cy="118" rx="58" ry="22" fill={paint.body} />
      <ellipse cx="90" cy="108" rx="36" ry="16" fill={paint.belly} />
      <ellipse cx="48" cy="112" rx="14" ry="10" fill={paint.body} />
      <ellipse cx="132" cy="112" rx="14" ry="10" fill={paint.body} />
      <ellipse cx="90" cy="72" rx="46" ry="38" fill={paint.head} />
      <ellipse cx="58" cy="48" rx="12" ry="10" fill={paint.body} />
      <ellipse cx="122" cy="48" rx="12" ry="10" fill={paint.body} />
      <ellipse cx="90" cy="86" rx="18" ry="12" fill={paint.belly} />
      <circle cx="74" cy="70" r="4" fill="#1b2a28" />
      <circle cx="106" cy="70" r="4" fill="#1b2a28" />
      <circle cx="75.2" cy="68.6" r="1.2" fill="#fff" />
      <circle cx="107.2" cy="68.6" r="1.2" fill="#fff" />
      <ellipse cx="90" cy="84" rx="7" ry="4.5" fill="#6b3f28" />
      <path d={mouth} fill="none" stroke="#6b3f28" strokeWidth="3" strokeLinecap="round" />
      {brows ? <path d={brows} fill="none" stroke="#6b3f28" strokeWidth="3" strokeLinecap="round" /> : null}
      {hat === "leaf" ? <ellipse cx="108" cy="40" rx="22" ry="10" fill="#2f8f4e" transform="rotate(-20 108 40)" /> : null}
      {hat === "flower" ? (
        <g>
          <circle cx="112" cy="38" r="7" fill="#f2d34a" />
          <circle cx="112" cy="38" r="3" fill="#ef7d1a" />
        </g>
      ) : null}
      {hat === "sailor" ? <path d="M58 48 H122 L112 36 H68 Z" fill="#1d4e89" /> : null}
      {hat === "crown" ? <path d="M62 50 L74 28 L90 46 L106 26 L118 50 Z" fill="#f2c14e" /> : null}
      {accessory === "orange" ? <circle cx="132" cy="108" r="10" fill="#ef7d1a" /> : null}
    </svg>
  );
}

export function Lagoon({ progress }: { progress: number }) {
  const x = 24 + Math.max(0, Math.min(1, progress)) * 132;
  return (
    <svg className="lagoon" viewBox="0 0 180 70" aria-hidden="true">
      <rect x="0" y="28" width="180" height="42" rx="16" fill="#148f86" />
      <ellipse cx="36" cy="40" rx="16" ry="7" fill="#1f9a55" />
      <ellipse cx="120" cy="48" rx="18" ry="7" fill="#187a45" />
      <circle cx="150" cy="36" r="6" fill="#ef7d1a" />
      <circle cx={x} cy="34" r="8" fill="#a86b3d" />
    </svg>
  );
}
