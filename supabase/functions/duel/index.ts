// edge-src/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// shared/normalize.ts
var ACCENTS = "\xE1\xE9\xED\xF3\xFA\xFC\xF1\xC1\xC9\xCD\xD3\xDA\xDC\xD1";
var PLAIN = "aeiouunaeiouun";
function capyNorm(value) {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, " ");
  let out = "";
  for (const char of trimmed) {
    const index = ACCENTS.indexOf(char);
    out += index >= 0 ? PLAIN[index] : char;
  }
  return out;
}
function splitSlashes(value) {
  return value.split("/").map((part) => part.trim().toLowerCase()).filter(Boolean);
}
function spanishAliases(spanish) {
  const raw = spanish.trim().toLowerCase();
  const found = /* @__PURE__ */ new Set();
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
function aliasKey(spanish) {
  return new Set(spanishAliases(spanish).map((alias) => capyNorm(alias)));
}

// shared/verbCsv.ts
var VERB_CSV = `id;infinitive;past;participle;spanish
1;be;was/were;been;ser o estar
2;become;became;become;llegar a ser
3;begin;began;begun;empezar
4;bite;bit;bitten;morder
5;break;broke;broken;romper
6;bring;brought;brought;traer/llevar
7;build;built;built;construir
8;burn;burnt;burnt;quemar
9;buy;bought;bought;comprar
10;catch;caught;caught;coger
11;choose;chose;chosen;elegir
12;come;came;come;venir
13;cost;cost;cost;costar
14;cut;cut;cut;cortar
15;do;did;done;hacer
16;draw;drew;drawn;dibujar
17;drink;drank;drunk;beber
18;drive;drove;driven;conducir
19;eat;ate;eaten;comer
20;fall;fell;fallen;caer
21;feel;felt;felt;sentir
22;find;found;found;encontrar
23;fly;flew;flown;volar
24;forget;forgot;forgotten;olvidar
25;get;got;got;conseguir
26;give;gave;given;dar
27;go;went;gone;ir
28;grow;grew;grown;crecer
29;have;had;had;tener
30;hear;heard;heard;o\xEDr
31;hide;hid;hidden;esconderse
32;hit;hit;hit;pegar
33;hurt;hurt;hurt;hacer da\xF1o/doler
34;keep;kept;kept;guardar/conservar
35;know;knew;known;saber/conocer
36;learn;learnt;learnt;aprender
37;leave;left;left;dejar/salir
38;lend;lent;lent;prestar
39;lay;laid;laid;poner/colocar
40;lie;lay;lain;tumbarse
41;lose;lost;lost;perder
42;make;made;made;hacer/fabricar
43;mean;meant;meant;significar
44;meet;met;met;conocer
45;pay;paid;paid;pagar
46;put;put;put;poner
47;read;read;read;leer
48;ride;rode;ridden;montar
49;run;ran;run;correr
50;say;said;said;decir
51;see;saw;seen;ver
52;sell;sold;sold;vender
53;send;sent;sent;enviar
54;sew;sewed;sewn;coser
55;show;showed;shown;mostrar
56;shut;shut;shut;cerrar
57;sing;sang;sung;cantar
58;sit;sat;sat;sentarse
59;sleep;slept;slept;dormir
60;speak;spoke;spoken;hablar
61;spell;spelt;spelt;deletrear
62;spend;spent;spent;gastar
63;stand;stood;stood;estar de pie
64;steal;stole;stolen;robar
65;swim;swam;swum;nadar
66;take;took;taken;llevar
67;teach;taught;taught;ense\xF1ar
68;tell;told;told;contar/decir
69;think;thought;thought;pensar
70;throw;threw;thrown;lanzar
71;understand;understood;understood;entender
72;wake;woke;woken;despertarse
73;wear;wore;worn;llevar puesto
74;win;won;won;ganar
75;write;wrote;written;escribir`;

// shared/verbs.ts
var VARIANTS = {
  8: { past: ["burned"], participle: ["burned"] },
  25: { participle: ["gotten"] },
  36: { past: ["learned"], participle: ["learned"] },
  54: { participle: ["sewed"] },
  55: { participle: ["showed"] },
  61: { past: ["spelled"], participle: ["spelled"] }
};
var CONTRASTS = {
  6: [66],
  39: [40],
  40: [39],
  50: [68],
  66: [6],
  68: [50]
};
var NOTES = {
  1: "Sin un sujeto concreto hacen falta las dos formas del pasado: was y were.",
  39: "Lay significa poner o colocar. No lo confundas con lie (tumbarse): el pasado de lie es lay.",
  40: "En esta ficha lie significa tumbarse, no mentir. Mentir ser\xEDa lie / lied / lied y aqu\xED no vale.",
  47: "Se escribe igual, pero no se pronuncia igual.",
  6: "Bring es traer o llevar hacia quien habla. Take es llevar hacia otro lugar.",
  66: "Take es llevar hacia otro lugar. Bring es traer o llevar hacia quien habla.",
  50: "Say presenta lo que se dijo. Tell suele indicar a qui\xE9n: tell someone.",
  68: "Tell suele llevar oyente (tell someone). Say presenta el mensaje."
};
function patternOf(infinitive, past, participle, id) {
  if (id === 1 || id === 40) return "special";
  if (infinitive === past && past === participle) return "identical";
  if (past === participle) return "past_eq_participle";
  return "three";
}
function parseVerbCsv(csv) {
  const lines = csv.trim().split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("id;"));
  return lines.map((line) => {
    const parts = line.split(";");
    if (parts.length !== 5) {
      throw new Error(`Fila con ${parts.length} campos: ${line}`);
    }
    const [idRaw, infinitive, past, participle, spanish] = parts;
    const id = Number(idRaw);
    if (!Number.isInteger(id)) throw new Error(`Id no num\xE9rico: ${line}`);
    const extra = VARIANTS[id] ?? {};
    const verb = {
      id,
      infinitive,
      past,
      participle,
      spanish,
      pattern: patternOf(infinitive, past, participle, id),
      variants: {
        past: extra.past ?? [],
        participle: extra.participle ?? []
      },
      contrasts: CONTRASTS[id] ?? [],
      note: NOTES[id]
    };
    if (id === 47) {
      verb.phonetic = { infinitive: "/ri\u02D0d/", past: "/red/" };
    }
    return verb;
  });
}
var VERBS = parseVerbCsv(VERB_CSV);
var VERB_BY_ID = new Map(VERBS.map((verb) => [verb.id, verb]));
function getVerb(id) {
  const verb = VERB_BY_ID.get(id);
  if (!verb) throw new Error(`Verbo ${id} no existe`);
  return verb;
}

// shared/grade.ts
var KNOWN_FORMS = buildKnownForms();
function buildKnownForms() {
  const forms = /* @__PURE__ */ new Set();
  for (const verb of VERBS) {
    forms.add(capyNorm(verb.infinitive));
    for (const part of splitSlashes(verb.past)) forms.add(capyNorm(part));
    for (const part of splitSlashes(verb.participle)) forms.add(capyNorm(part));
    for (const part of verb.variants.past) forms.add(capyNorm(part));
    for (const part of verb.variants.participle) forms.add(capyNorm(part));
    for (const alias of spanishAliases(verb.spanish)) forms.add(capyNorm(alias));
  }
  return forms;
}
function pastForms(verb, mode) {
  const forms = splitSlashes(verb.past);
  if (mode === "standard") forms.push(...verb.variants.past);
  return unique(forms.map((form) => form.toLowerCase()));
}
function participleForms(verb, mode) {
  const forms = splitSlashes(verb.participle);
  if (mode === "standard") forms.push(...verb.variants.participle);
  return unique(forms.map((form) => form.toLowerCase()));
}
function unique(values) {
  return [...new Set(values)];
}
function pairAccepted(forms) {
  if (forms.length < 2) return forms;
  const [a, b] = forms;
  return [
    `${a}/${b}`,
    `${b}/${a}`,
    `${a} / ${b}`,
    `${b} / ${a}`,
    `${a}, ${b}`,
    `${b}, ${a}`,
    `${a},${b}`,
    `${b},${a}`
  ];
}
function expectedDisplay(verb, spec, mode) {
  switch (spec.form) {
    case "infinitive":
      return verb.infinitive;
    case "spanish":
      return verb.spanish;
    case "past":
      return mode === "standard" && verb.variants.past.length ? `${verb.past} (tambi\xE9n ${verb.variants.past.join(", ")})` : verb.past;
    case "past_subject":
      return spec.expect;
    case "participle":
      return mode === "standard" && verb.variants.participle.length ? `${verb.participle} (tambi\xE9n ${verb.variants.participle.join(", ")})` : verb.participle;
    case "both": {
      const past = verb.past;
      const participle = verb.participle;
      return `${past}, ${participle}`;
    }
  }
}
function acceptedNormalized(verb, spec, mode) {
  const raw = rawAccepted(verb, spec, mode);
  return unique(raw.map((value) => capyNorm(value)));
}
function rawAccepted(verb, spec, mode) {
  switch (spec.form) {
    case "infinitive":
      return [verb.infinitive];
    case "spanish":
      return spanishAliases(verb.spanish);
    case "past":
      return spec.pair ? pairAccepted(pastForms(verb, "sheet")) : pastForms(verb, mode);
    case "past_subject":
      return [spec.expect];
    case "participle":
      return participleForms(verb, mode);
    case "both": {
      const pasts = pastForms(verb, mode);
      const parts = participleForms(verb, mode);
      const combos = [];
      for (const past of pasts) {
        for (const part of parts) {
          combos.push(`${past}, ${part}`, `${past},${part}`, `${past}/${part}`, `${past} / ${part}`);
        }
      }
      return combos;
    }
  }
}

// shared/distractors.ts
function meaningChoices(verb, rng) {
  const correctKeys = aliasKey(verb.spanish);
  const pool = VERBS.filter((other) => {
    if (other.id === verb.id) return false;
    const keys = aliasKey(other.spanish);
    for (const key of keys) if (correctKeys.has(key)) return false;
    return capyNorm(other.spanish) !== capyNorm(verb.spanish);
  });
  return buildChoices(verb.spanish, pool.map((item) => item.spanish), rng);
}
function infinitiveChoices(verb, rng) {
  const pool = VERBS.filter((other) => other.id !== verb.id).map((other) => other.infinitive);
  return buildChoices(verb.infinitive, pool, rng);
}
function buildChoices(correct, pool, rng) {
  const used = /* @__PURE__ */ new Set([capyNorm(correct)]);
  const picked = [];
  const bag = shuffle(unique2(pool), rng);
  for (const item of bag) {
    const key = capyNorm(item);
    if (used.has(key)) continue;
    used.add(key);
    picked.push(item);
    if (picked.length === 3) break;
  }
  if (picked.length < 3) {
    throw new Error(`No hay distractores suficientes para \xAB${correct}\xBB`);
  }
  const labels = shuffle([correct, ...picked], rng);
  return labels.map((label, index) => ({ id: "abcd"[index], label }));
}
function unique2(values) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const value of values) {
    const key = capyNorm(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
function shuffle(items, rng) {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function correctChoiceId(options, label) {
  const found = options.find((option) => capyNorm(option.label) === capyNorm(label));
  if (!found) throw new Error(`Opci\xF3n correcta ausente: ${label}`);
  return found.id;
}

// shared/questions.ts
function introQuestion(verb, rng) {
  const skillRoll = rng();
  if (skillRoll < 0.5) {
    const options2 = meaningChoices(verb, rng);
    return {
      kind: "choice",
      skill: "meaning",
      verbId: verb.id,
      prompt: `\xBFQu\xE9 significa ${verb.infinitive}?`,
      help: verb.note,
      options: options2,
      correctId: correctChoiceId(options2, verb.spanish),
      written: false
    };
  }
  const options = infinitiveChoices(verb, rng);
  return {
    kind: "choice",
    skill: "infinitive",
    verbId: verb.id,
    prompt: `\xBFCu\xE1l es el infinitivo de \xAB${verb.spanish}\xBB?`,
    help: verb.note,
    options,
    correctId: correctChoiceId(options, verb.infinitive),
    written: false
  };
}
function writeQuestion(verb, spec, _mode, withContext) {
  const skill = skillOf(spec);
  const phonetic = verb.phonetic ? `Infinitivo ${verb.phonetic.infinitive}; pasado y participio ${verb.phonetic.past}.` : void 0;
  let prompt = "";
  let placeholder = "Escribe aqu\xED";
  switch (spec.form) {
    case "infinitive":
      prompt = `Escribe el infinitivo de \xAB${verb.spanish}\xBB.`;
      break;
    case "spanish":
      prompt = `\xBFQu\xE9 significa ${verb.infinitive}? Escr\xEDbelo en espa\xF1ol.`;
      placeholder = "En espa\xF1ol";
      break;
    case "past":
      prompt = withContext ? `Ayer: I ____ (${verb.infinitive}). Escribe el pasado.` : `Escribe el pasado de ${verb.infinitive}.`;
      break;
    case "past_subject":
      prompt = spec.expect === "was" ? "She ____ happy. Escribe el pasado de be para she." : "They ____ happy. Escribe el pasado de be para they.";
      break;
    case "participle":
      prompt = withContext ? `I have ____ (${verb.infinitive}) an orange. Escribe el participio.` : `Escribe el participio de ${verb.infinitive}.`;
      break;
    case "both":
      prompt = `Escribe el pasado y el participio de ${verb.infinitive}, separados por coma.`;
      placeholder = "pasado, participio";
      break;
  }
  if (spec.form === "past" && spec.pair) {
    prompt = "Escribe las dos formas del pasado de be, separadas por coma o barra.";
    placeholder = "was, were";
  }
  return {
    kind: "write",
    skill,
    verbId: verb.id,
    prompt,
    help: phonetic,
    placeholder,
    write: spec,
    written: true
  };
}
function skillOf(spec) {
  switch (spec.form) {
    case "infinitive":
      return "infinitive";
    case "spanish":
      return "meaning";
    case "participle":
      return "participle";
    default:
      return "past";
  }
}
function buildDuelQuestions(seed, mode, count = 10) {
  const rng = mulberry32(seed);
  const verbs = shuffle(getAllVerbs(), rng).slice(0, count);
  return verbs.map((verb) => {
    const roll = rng();
    if (roll < 0.35) {
      const question2 = introQuestion(verb, rng);
      if (question2.kind !== "choice") throw new Error("Se esperaba opci\xF3n");
      const correct = question2.options.find((option) => option.id === question2.correctId);
      return {
        prompt: {
          kind: "choice",
          skill: question2.skill,
          verbId: verb.id,
          text: question2.prompt,
          help: question2.help,
          options: question2.options
        },
        accepted: [question2.correctId],
        display: correct?.label ?? ""
      };
    }
    const spec = roll < 0.55 ? verb.id === 1 ? { form: "past_subject", expect: rng() < 0.5 ? "was" : "were" } : { form: "past", pair: false } : roll < 0.8 ? { form: "participle" } : { form: "infinitive" };
    const question = writeQuestion(verb, spec, mode, true);
    if (question.kind !== "write") throw new Error("Se esperaba escritura");
    return {
      prompt: {
        kind: "write",
        skill: question.skill,
        verbId: verb.id,
        text: question.prompt,
        help: question.help,
        placeholder: question.placeholder
      },
      accepted: acceptedNormalized(verb, spec, mode),
      display: expectedDisplay(verb, spec, mode)
    };
  });
}
function getAllVerbs() {
  return Array.from({ length: 75 }, (_, index) => getVerb(index + 1));
}
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// edge-src/index.ts
var cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "M\xE9todo no permitido" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Falta la configuraci\xF3n del servidor" }, 500);
  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sesi\xF3n no v\xE1lida" }, 401);
  const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("cf-connecting-ip") ?? "unknown").split(",")[0].trim().slice(0, 64);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.action !== "string") return json({ error: "Petici\xF3n no v\xE1lida" }, 400);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = userData.user.id;
  const action = body.action;
  const call = async (fn, args) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return json({ error: clean(error.message) }, 400);
    return json(data ?? { ok: true }, 200);
  };
  if (action === "create" || action === "rematch") {
    const variant = body.variantMode === "standard" ? "standard" : "sheet";
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
    const rounds = buildDuelQuestions(seed, variant, 10).map((question) => ({
      prompt: question.prompt,
      accepted: question.accepted,
      display: question.display
    }));
    if (action === "create") {
      return call("duel_create", {
        p_user: userId,
        p_ip: ip,
        p_nickname: String(body.nickname ?? ""),
        p_capybara: String(body.capybara ?? "cocoa"),
        p_variant: variant,
        p_seconds: Number(body.seconds ?? 20),
        p_rounds: rounds
      });
    }
    return call("duel_rematch", { p_user: userId, p_room: body.roomId, p_rounds: rounds });
  }
  if (action === "join") {
    return call("duel_join", {
      p_user: userId,
      p_ip: ip,
      p_code: String(body.code ?? "").trim().toUpperCase(),
      p_nickname: String(body.nickname ?? ""),
      p_capybara: String(body.capybara ?? "cocoa")
    });
  }
  if (action === "ready") return call("duel_ready", { p_user: userId, p_room: body.roomId });
  if (action === "configure") {
    return call("duel_configure", {
      p_user: userId,
      p_room: body.roomId,
      p_seconds: Number(body.seconds ?? 20),
      p_variant: body.variantMode === "standard" ? "standard" : "sheet"
    });
  }
  if (action === "submit") {
    return call("duel_submit", {
      p_user: userId,
      p_room: body.roomId,
      p_round: Number(body.round),
      p_answer: String(body.answer ?? "")
    });
  }
  if (action === "advance") return call("duel_advance", { p_user: userId, p_room: body.roomId });
  return json({ error: "Acci\xF3n no v\xE1lida" }, 400);
});
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}
function clean(message) {
  const known = [
    "Sala llena",
    "C\xF3digo no v\xE1lido",
    "La partida ya empez\xF3",
    "Env\xEDo tard\xEDo",
    "Esa ronda ya no est\xE1 activa",
    "La ronda no est\xE1 abierta",
    "No puedes ver esta sala",
    "Demasiados intentos. Espera un poco.",
    "La partida todav\xEDa no ha terminado",
    "Solo quien crea la sala puede cambiar los ajustes"
  ];
  return known.find((item) => message.includes(item)) ?? "No se pudo completar el duelo";
}
