import { HANGMAN_MISSES } from "../../shared/hangman";

const PARTS = ["el suelo", "el poste", "el travesaño", "la cuerda", "la cabeza", "el cuerpo"] as const;

export function gallowsPart(misses: number): string {
  if (misses <= 0) return "El dibujo está en blanco.";
  const step = Math.min(HANGMAN_MISSES, misses);
  return `Se dibuja ${PARTS[step - 1]}.`;
}

/** Un trazo nuevo por fallo, hasta el muñeco completo en el sexto. */
export function Gallows({ misses }: { misses: number }) {
  const step = Math.max(0, Math.min(HANGMAN_MISSES, misses));
  const show = (part: number) => step >= part;
  return (
    <svg className="gallows" viewBox="0 0 220 168" role="img" aria-label={`Ahorcado, ${step} de ${HANGMAN_MISSES} trazos`}>
      <rect x="6" y="6" width="208" height="156" rx="16" fill="#fff6e8" />
      <g fill="none" stroke="#1b2a28" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        {show(1) ? <path d="M28 146 H108" /> : null}
        {show(2) ? <path d="M48 146 V22" /> : null}
        {show(3) ? <path d="M48 22 H132 M48 46 L72 22" /> : null}
        {show(4) ? <path d="M132 22 V46" /> : null}
        {show(5) ? <circle cx="132" cy="60" r="14" /> : null}
        {show(6) ? <path d="M132 74 V108 M132 86 L112 102 M132 86 L152 102 M132 108 L116 132 M132 108 L148 132" /> : null}
      </g>
    </svg>
  );
}
