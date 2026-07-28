// lib/ai/text-clean.ts
// ─────────────────────────────────────────────────────────────────────────
// Limpieza de texto Markdown → texto plano, apto para ser leído por un
// motor TTS (Kokoro). Dos etapas:
//
//   1) Estructura (tablas, listas, headers, links, bold/italic) —
//      primero regex (rápido, determinista, sin overhead) y después
//      remark/parse como segunda pasada que cubre lo que las regex
//      no agarran (tablas partidas en una sola línea, etc.).
//   2) Símbolos que Kokoro pronuncia mal ($, %, kg, km, etc.) —
//      se reemplazan por la forma hablada.
//
// USO:
//   - jarvis.ts (lib) la usa SIEMPRE al construir `answer`/`answerSpoken`.
//   - routes/company/jarvis.ts la usa en el endpoint POST /tts, para
//     limpiar cualquier texto que llegue directo del frontend.
// ─────────────────────────────────────────────────────────────────────────

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import stripMarkdown from 'strip-markdown';
import remarkStringify from 'remark-stringify';

// ─── Etapa 1: regex para markdown estructural ───────────────────────────

/**
 * Convierte una tabla markdown a una serie de frases habladas.
 * Asume el formato estándar: header row, separadora (---|---), data rows.
 * Devuelve texto hablable: "Vehículo: ABC-123, Gasto: 500."
 */
function convertMarkdownTableToSpeech(tableBlock: string): string {
  const lines = tableBlock
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.includes('|'));

  if (lines.length < 2) return tableBlock;

  const parseRow = (line: string): string[] =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);

  const headerRow = parseRow(lines[0]);
  const dataRows = lines
    .slice(1)
    .filter((l) => !/^[-:\s|]+$/.test(l)) // descarta la fila separadora
    .map(parseRow);

  if (headerRow.length === 0 || dataRows.length === 0) return tableBlock;

  const sentences = dataRows.map((row) => {
    const parts = row.map((cell, i) => {
      const header = headerRow[i] ?? `campo ${i + 1}`;
      return `${header}: ${cell}`;
    });
    return parts.join(', ');
  });

  return sentences.join('. ') + '.';
}

/** Detecta y reemplaza bloques de tabla markdown. */
function replaceMarkdownTables(text: string): string {
  const tableBlockRegex = /(^\|.*\|[ \t]*$\n?){2,}/gm;
  return text.replace(tableBlockRegex, (match) => convertMarkdownTableToSpeech(match));
}

/**
 * Convierte listas markdown (- item / * item / 1. item) en texto
 * conectado para voz: "Primero, item1, item2, por último, item3."
 */
function convertListsToSpeech(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    if (buffer.length === 1) {
      result.push(buffer[0]);
    } else {
      const connected = buffer.map((item, i) => {
        if (i === 0) return `Primero, ${item}`;
        if (i === buffer.length - 1) return `por último, ${item}`;
        return item;
      });
      result.push(connected.join(', '));
    }
    buffer = [];
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.*)/);
    const numberedMatch = line.match(/^\s*\d+\.\s+(.*)/);
    const item = bulletMatch?.[1] ?? numberedMatch?.[1];
    if (item) {
      buffer.push(item);
    } else {
      flushBuffer();
      result.push(line);
    }
  }
  flushBuffer();
  return result.join('\n');
}

/** Quita símbolos markdown inline (bold, italic, headers, links, code). */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')                       // headers
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')               // ***bold italic***
    .replace(/\*\*(.+?)\*\*/g, '$1')                  // **bold**
    .replace(/\*(.+?)\*/g, '$1')                     // *italic*
    .replace(/___(.+?)___/g, '$1')                   // ___bold italic___
    .replace(/__(.+?)__/g, '$1')                     // __bold__
    .replace(/_(.+?)_/g, '$1')                       // _italic_
    .replace(/`([^`]+)`/g, '$1')                     // `código inline`
    .replace(/```[\s\S]*?```/g, '')                  // ```bloque de código```
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')      // [texto](url)
    .replace(/^[-*_]{3,}\s*$/gm, '')               // --- o *** (hr)
    .replace(/^>\s?/gm, '');                        // > blockquote
}

/** Normaliza espacios y saltos de línea sobrantes. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// ─── Etapa 2: remark (parser de AST) como segunda pasada ─────────────────
// Por qué las regex solas no alcanzan:
//   - Si el LLM devuelve todo en una sola línea larga (sin \n reales),
//     `replaceMarkdownTables` no matchea porque el flag `m` espera ^...$.
//   - Si el markdown está malformado, las regex fallan silenciosamente.
// El AST de remark entiende la estructura real del documento y cubre
// esos casos.

const markdownToTextProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)        // tablas, tachado, etc. (GFM)
  .use(stripMarkdown)    // convierte nodos de markdown en texto plano
  .use(remarkStringify);

async function markdownToPlainText(md: string): Promise<string> {
  if (!md || !md.trim()) return '';
  try {
    const file = await markdownToTextProcessor.process(md);
    return String(file).trim();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[text-clean] markdownToPlainText falló, devolviendo texto original:', e);
    return md;
  }
}

// ─── Etapa 3: símbolos que Kokoro pronuncia mal ───────────────────────────
//
// Aplica DESPUÉS de la limpieza de markdown (tablas ya son frases
// separadas por coma, headers ya son oraciones, etc.)

function speakSymbols(text: string): string {
  let out = text;

  out = out.replace(/\$(\d[\d,.]*)/g, '$1 dolares');
  out = out.replace(/(\d[\d,.]*)\s*%/g, (_m, num) => `${num} por ciento`);
  out = out.replace(/(\d[\d,.]*)\s*kg\b/gi, (_m, num) => `${num} kilos`);
  out = out.replace(/(\d[\d,.]*)\s*km\b/gi, (_m, num) => `${num} kilometros`);
  out = out.replace(/(\d[\d,.]*)\s*lt\b/gi, (_m, num) => `${num} litros`);
  out = out.replace(/(\d[\d,.]*)\s*cm\b/gi, (_m, num) => `${num} centimetros`);
  out = out.replace(/(\d[\d,.]*)\s*mm\b/gi, (_m, num) => `${num} milimetros`);
  out = out.replace(/(\d[\d,.]*)\s*hp\b/gi, (_m, num) => `${num} caballos`);
  out = out.replace(/\bUSD\s*(\d[\d,.]*)/gi, (_m, num) => `${num} dolares`);

  // Guiones no-ASCII que Kokoro puede leer raro o saltar.
  out = out.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-');

  out = out.replace(/\n{3,}/g, '\n\n');
  out = out.split('\n').map((l) => l.trim()).join('\n').trim();

  return out;
}

// ─── Función principal ───────────────────────────────────────────────────

/**
 * Limpieza completa: markdown → texto plano → símbolos hablados.
 * Esta es la función que hay que usar en TODO lugar donde el texto vaya
 * a pasar por TTS, sin importar de dónde venga.
 *
 * Orden:
 *   1) replaceMarkdownTables       (regex: tablas markdown)
 *   2) convertListsToSpeech        (regex: listas)
 *   3) stripInlineMarkdown         (regex: bold/italic/headers/links)
 *   4) normalizeWhitespace         (regex: espacios)
 *   5) markdownToPlainText (remark): segunda pasada que cubre
 *      lo que las regex no agarraron (markdown malformado, todo en
 *      una sola línea, etc.). El resultado de remark REEMPLAZA
 *      los problemas residuales de las regex.
 *   6) speakSymbols                (símbolos → forma hablada)
 */
export async function cleanForTts(text: string): Promise<string> {
  if (!text) return '';

  // Etapas 1-4: regex (rápido, determinista, sin overhead async).
  let out = text;
  out = replaceMarkdownTables(out);
  out = convertListsToSpeech(out);
  out = stripInlineMarkdown(out);
  out = normalizeWhitespace(out);

  // Etapa 5: segunda pasada con AST. Si el regex ya limpió bien, esta
  // pasada es un no-op o cambia poco. Si no, rescata el texto.
  out = await markdownToPlainText(out);

  // Etapa 6: símbolos hablados (siempre al final, ya con texto plano).
  out = speakSymbols(out);

  return out;
}
