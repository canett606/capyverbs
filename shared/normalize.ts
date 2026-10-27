const ACCENTS = "áéíóúüñÁÉÍÓÚÜÑ";
const PLAIN = "aeiouunaeiouun";

/** Minúsculas, espacios extremos fuera, espacios internos colapsados, tildes fuera. */
export function capyNorm(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, " ");
  let out = "";
  for (const char of trimmed) {
    const index = ACCENTS.indexOf(char);
    out += index >= 0 ? PLAIN[index] : char;
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length > 40 || b.length > 40) return 99;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

export function splitSlashes(value: string): string[] {
  return value
    .split("/")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/** Sinónimos explícitos de la ficha: barra y «o» entre infinitivos. */
export function spanishAliases(spanish: string): string[] {
  const raw = spanish.trim().toLowerCase();
  const found = new Set<string>();
  found.add(raw);
  for (const slash of raw.split("/")) {
    const piece = slash.trim();
    if (piece) found.add(piece);
    for (const alt of piece.split(/\s+o\s+/)) {
      const bit = alt.trim();
      if (bit) found.add(bit);
    }
  }
  for (const alt of raw.split(/\s+o\s+/)) {
    const bit = alt.trim();
    if (bit) found.add(bit);
  }
  return [...found];
}

export function aliasKey(spanish: string): Set<string> {
  return new Set(spanishAliases(spanish).map((alias) => capyNorm(alias)));
}
