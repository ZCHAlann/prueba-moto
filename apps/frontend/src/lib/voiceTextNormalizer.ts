// lib/voiceTextNormalizer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Normalizador de texto post-STT para el flujo de voz (jul 2026 v8.6).
//
// PROBLEMA:
//   Vosk transcribe el habla a texto. Lo hace bien para palabras
//   comunes en español, pero muy mal para:
//     - Placas de vehículos: "a v m cuatro seis seis dos" en vez de
//       "abm-4662"
//     - Letras deletreadas: "a" puede transcribir como "a", "ha",
//       "ah"; "b" como "be"; "v" como "uve" o "ve"; "h" como "hache"
//     - Números hablados: "mil doscientos" en vez de "1200"
//     - IDs: "id uno dos tres" en vez de "id 123"
//
// SOLUCIÓN:
//   Pipeline de normalización en 4 pasos:
//
//   PASO 1: Normalizar deletreo de letras.
//     Vosk a veces escribe "ha" en vez de "a", "be" en vez de "b",
//     etc. Reemplazamos por la letra correspondiente. Lo detectamos
//     por CONTEXTO: si hay números o letras cercanas, es deletreo.
//
//   PASO 2: Pegar letras sueltas en siglas.
//     "a b m 4662" → "abm 4662" → "abm-4662"
//
//   PASO 3: Procesar números (cantidad vs concat).
//     Modo concat: "cuatro seis seis dos" → "4662" (placa)
//     Modo cantidad: "mil doscientos" → "1200" (número normal)
//     Modo decimal: "diez coma cinco" → "10.5"
//
//   PASO 4: Auto-guion para placas.
//     "abm 4662" → "abm-4662"
//
// La heurística clave para distinguir concat vs cantidad es:
//   - Si hay tokens de números grandes (mil, millón, cien, cientos)
//     O si la secuencia tiene más de 2 tokens de 1 dígito seguidos
//     → concat (es placa).
//   - Si no → cantidad.
// ─────────────────────────────────────────────────────────────────────────────

// ── Diccionario de deletreo: palabra de Vosk → letra real ────────────
// Esto es lo que más cambia según el acento. Ajustable empíricamente.

const SPELLING_MAP: Record<string, string> = {
  // Letras simples
  a: "a", ha: "a", ah: "a",
  be: "b", be: "b",
  ce: "c", se: "c", ze: "c",
  de: "d", de: "d",
  e: "e", he: "e", ehe: "e",
  efe: "f", fe: "f",
  ge: "g", je: "g", he: "g",
  hache: "h", ache: "h", ache: "h", h: "h",
  i: "i", hi: "i",
  jota: "j", j: "j", iota: "j", j: "j",
  ka: "k", ca: "k", k: "k",
  ele: "l", le: "l", ele: "l",
  eme: "m", me: "m", eme: "m",
  ene: "n", ne: "n", ene: "n",
  eñe: "ñ", ene: "ñ", ñ: "ñ",
  o: "o", ho: "o",
  pe: "p", pe: "p",
  cu: "q", ku: "q", qu: "q",
  ere: "r", re: "r", erre: "r",
  ese: "s", se: "s", ese: "s",
  te: "t", te: "t",
  u: "u", hu: "u",
  uve: "v", ve: "v", doble: "v", v: "v", be: "v", uve: "v",
  doble: "w", uve: "w", doble: "w", dobleuve: "w", dobleve: "w",
  equis: "x", ex: "x", equis: "x",
  i: "y", griega: "y", i: "y", ye: "y", y: "y",
  zeta: "z", se: "z", zeta: "z",
};

// ── Números en español (0 a 99) como strings de dígitos ─────────────

const DIGIT_WORDS: Record<string, string> = {
  cero: "0", un: "1", uno: "1", una: "1", dos: "2", tres: "3", cuatro: "4",
  cinco: "5", seis: "6", siete: "7", ocho: "8", nueve: "9",
  diez: "10", once: "11", doce: "12", trece: "13", catorce: "14", quince: "15",
  dieciseis: "16", dieciséis: "16", diecisiete: "17", diecisiete: "17",
  dieciocho: "18", diecinueve: "19", diecinueve: "19",
  veinte: "20", veintiuno: "21", veintiún: "21",
  veintidos: "22", veintidós: "22", veintitres: "23", veintitrés: "23",
  veinticuatro: "24", veinticinco: "25", veintiseis: "26", veintiséis: "26",
  veintisiete: "27", veintiocho: "28", veintinueve: "29",
  treinta: "30", cuarenta: "40", cincuenta: "50", sesenta: "60",
  setenta: "70", ochenta: "80", noventa: "90",
};

const BIG_NUMBERS: Record<string, number> = {
  cien: 100, cientos: 100, mil: 1000, mill: 1_000_000,
  millón: 1_000_000, millones: 1_000_000, mills: 1_000_000,
};

const CONNECTOR_WORDS = new Set(["y", "e", "coma", "punto"]);

/**
 * Normaliza texto de voz post-STT.
 */
export function normalizeVoiceText(input: string): string {
  if (!input) return input;

  let text = input;

  // ── PASO 1: Reemplazar deletreo ambiguo de letras ───────────────
  text = applySpellingMap(text);

  // ── Tokenizar para los pasos siguientes ─────────────────────────
  const tokens = text.match(/[\wáéíóúñ]+|[^\s\w]/gi) || [];

  // ── PASO 2: Pegar letras sueltas + procesar números ─────────────
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    const normTok = normalizeToken(tok);

    // Si el token es un dígito (palabra-número) o conector, lo metemos
    // en un grupo de números.
    if (isDigitWord(normTok) || normTok === "y" || normTok === "e") {
      // Encontrar el final del grupo.
      let j = i;
      while (j < tokens.length) {
        const t = normalizeToken(tokens[j]);
        if (isDigitWord(t) || t === "y" || t === "e" || t === "coma" || t === "punto") {
          j++;
        } else {
          break;
        }
      }
      const seq = tokens.slice(i, j).filter(t => {
        const n = normalizeToken(t);
        return n !== "coma" && n !== "punto" && n !== "," && n !== ".";
      });
      const hasDecimal = tokens.slice(i, j).some(t => {
        const n = normalizeToken(t);
        return n === "coma" || n === "punto";
      });
      if (hasDecimal) {
        // Decimal: procesamos por separado.
        const decIdx = seq.findIndex(t => {
          const n = normalizeToken(t);
          return n === "coma" || n === "punto";
        });
        const intSeq = seq.slice(0, decIdx);
        const decSeq = seq.slice(decIdx + 1);
        const intPart = processIntGroup(intSeq, []);
        const decPart = processIntGroup(decSeq, []);
        if (intPart != null && decPart != null) {
          out.push(`${intPart}.${decPart}`);
        } else {
          for (let k = i; k < j; k++) out.push(tokens[k]);
        }
      } else {
        const result = processIntGroup(seq, tokens.slice(Math.max(0, i - 2), i));
        if (result != null) {
          out.push(result);
        } else {
          for (let k = i; k < j; k++) out.push(tokens[k]);
        }
      }
      i = j;
    } else if (/^[a-záéíóúñ]$/i.test(tok)) {
      // Letra suelta. La agrupamos con las siguientes letras sueltas.
      let j = i;
      while (j < tokens.length && /^[a-záéíóúñ]$/i.test(tokens[j])) {
        j++;
      }
      // Pegamos como sigla.
      const sigil = tokens.slice(i, j).join("").toUpperCase();
      out.push(sigil);
      i = j;
    } else {
      out.push(tok);
      i++;
    }
  }

  let result = out.join(" ");
  result = result.replace(/\s+/g, " ").trim();

  // ── PASO 3: Auto-guion para placas (2-4 letras + 3-4 dígitos) ──
  result = result.replace(/\b([A-Z]{2,4})\s+(\d{3,4})\b/g, "$1-$2");

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────

function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[áéíóúñ]/g, c => "aeioun"["áéíóúñ".indexOf(c)]);
}

function isDigitWord(t: string): boolean {
  return DIGIT_WORDS.hasOwnProperty(t) || BIG_NUMBERS.hasOwnProperty(t);
}

function applySpellingMap(text: string): string {
  // Reemplazamos palabras deletreadas por letras. Pero SOLO cuando
  // están en contexto de deletreo (rodeadas de otras letras cortas
  // o de números). Si la palabra está en una frase normal (ej: "ha"
  // como verbo "ha"), no la tocamos.
  //
  // Heurística simple: si la palabra está entre letras cortas o
  // números, es deletreo.
  const tokens = text.match(/[\wáéíóúñ]+|[^\s\w]/gi) || [];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const norm = normalizeToken(tok);
    if (SPELLING_MAP.hasOwnProperty(norm) && norm.length <= 5) {
      // Posibles deletreos. Chequeamos contexto:
      //   - Previo o siguiente token es un dígito → deletreo
      //   - Previo o siguiente token es una letra de 1 carácter
      //     → deletreo
      //   - Si el token es exactamente 1 letra (a, b, c, etc.) →
      //     siempre es deletreo (en este contexto)
      const prev = i > 0 ? tokens[i - 1] : "";
      const next = i < tokens.length - 1 ? tokens[i + 1] : "";
      const prevNorm = normalizeToken(prev);
      const nextNorm = normalizeToken(next);
      const isShortLetter = norm.length === 1 && /^[a-záéíóúñ]$/.test(tok);
      const prevIsLetter = /^[a-záéíóúñ]$/i.test(prev);
      const nextIsLetter = /^[a-záéíóúñ]$/i.test(next);
      const prevIsDigit = isDigitWord(prevNorm);
      const nextIsDigit = isDigitWord(nextNorm);
      const prevIsShortLetter = prev.length === 1 && /^[a-záéíóúñ]$/i.test(prev);
      const nextIsShortLetter = next.length === 1 && /^[a-záéíóúñ]$/i.test(next);

      if (isShortLetter ||
          prevIsShortLetter || nextIsShortLetter ||
          prevIsDigit || nextIsDigit) {
        // Es deletreo. Reemplazamos.
        out.push(SPELLING_MAP[norm].toUpperCase());
        continue;
      }
      // Si no parece deletreo, lo dejamos como está.
      out.push(tok);
    } else {
      out.push(tok);
    }
  }
  return out.join(" ");
}

/**
 * Procesa un grupo de tokens-número (sin coma/punto) y devuelve
 * el string. Detecta automáticamente el modo:
 *   - Si hay tokens de números grandes (mil, millón, cien, cientos)
 *     → modo cantidad (suma).
 *   - Si la secuencia tiene 3+ tokens de 1 dígito → modo concat
 *     (es una placa).
 *   - Si no → modo cantidad (número normal).
 */
function processIntGroup(seq: string[], prevTokens: string[]): string | null {
  if (seq.length === 0) return null;

  const tokens = seq.map(normalizeToken);

  const hasBigMultiplier = tokens.some(t => t === "mil" || t === "millón" || t === "millones" || t === "mills");
  const hasHundred = tokens.some(t => t === "cien" || t === "cienta" || t === "cientos");

  // Si hay letras en prevTokens (placa tipo "abm 4662"), concat.
  const hasLettersInPrev = prevTokens.some(t => /^[a-záéíóúñ]+$/i.test(t) && t.length >= 1);

  // Detectar modo.
  let mode: "concat" | "cantidad";
  if (hasBigMultiplier || hasHundred) {
    mode = "cantidad";
  } else if (hasLettersInPrev) {
    // Hay letras inmediatamente antes (sigla de placa), concat.
    mode = "concat";
  } else {
    // Heurística por longitud: si la mayoría de tokens son de 1
    // dígito, concat (es deletreo de placa).
    const oneDigitCount = tokens.filter(t =>
      DIGIT_WORDS.hasOwnProperty(t) && DIGIT_WORDS[t].length === 1
    ).length;
    const twoDigitCount = tokens.filter(t =>
      DIGIT_WORDS.hasOwnProperty(t) && DIGIT_WORDS[t].length === 2
    ).length;
    if (oneDigitCount >= 2 && twoDigitCount === 0) {
      mode = "concat";
    } else if (oneDigitCount >= 3) {
      mode = "concat";
    } else {
      mode = "cantidad";
    }
  }

  if (mode === "cantidad") {
    return sumAsNumber(tokens);
  }
  return concatAsDigits(tokens);
}

/**
 * Modo concatenación: cada token es un dígito (o 2 dígitos para
 * decenas como "cuarenta" = "40"). Los juntamos.
 */
function concatAsDigits(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  let out = "";
  for (const t of tokens) {
    if (t === "y" || t === "e") continue;
    if (DIGIT_WORDS.hasOwnProperty(t)) {
      out += DIGIT_WORDS[t];
    } else if (BIG_NUMBERS.hasOwnProperty(t)) {
      out += String(BIG_NUMBERS[t]);
    } else {
      return null;
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * Modo cantidad: "mil doscientos" = 1200.
 */
function sumAsNumber(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  let total = 0;
  let current = 0;
  let sawMultiplier = false;

  for (const t of tokens) {
    if (t === "y" || t === "e") continue;
    if (DIGIT_WORDS.hasOwnProperty(t)) {
      const n = parseInt(DIGIT_WORDS[t], 10);
      if (n >= 10 && current > 0 && current < 10) {
        current = current + n;
      } else {
        current = current + n;
      }
      sawMultiplier = true;
      continue;
    }
    if (t === "ciento" || t === "cienta") {
      current = current === 0 ? 100 : current + 100;
      sawMultiplier = true;
      continue;
    }
    if (BIG_NUMBERS.hasOwnProperty(t)) {
      const mult = BIG_NUMBERS[t];
      if (mult === 100) {
        current = current === 0 ? mult : current * mult;
      } else if (current === 0) {
        current = mult;
      } else {
        current = current * mult;
      }
      total += current;
      current = 0;
      sawMultiplier = true;
      continue;
    }
    return null;
  }
  total += current;
  if (!sawMultiplier && tokens.length === 0) return null;
  return String(total);
}
