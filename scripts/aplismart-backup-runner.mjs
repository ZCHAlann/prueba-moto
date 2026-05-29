#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const apiBase = process.env.APLISMART_API_BASE || "http://127.0.0.1:3300";
const appRoot = process.env.APLISMART_APP_ROOT || "/www/wwwroot/motors.aplismart.com";
const backupRoot = process.env.APLISMART_BACKUP_ROOT || "/www/backup_aplismart/automaticos";
const uploadsDir = process.env.APLISMART_UPLOADS_DIR || join(appRoot, "apps/web/public/uploads");
const weekdays = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function pad(value) {
  return `${value}`.padStart(2, "0");
}

function nowStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fileStamp(date = new Date()) {
  return nowStamp(date).replace(/[: ]/g, "-");
}

function parseLocalStamp(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0,
  );
}

function parseRunTime(value) {
  const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return { hours: 23, minutes: 0 };
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function getNextRunAt(settings, baseDate = new Date()) {
  const next = new Date(baseDate);
  const { hours, minutes } = parseRunTime(settings.runAt);
  next.setHours(hours, minutes, 0, 0);

  if (settings.frequency === "Semanal") {
    const currentDay = next.getDay() === 0 ? 6 : next.getDay() - 1;
    const targetDay = Math.max(0, weekdays.indexOf(settings.weekday || "Domingo"));
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd < 0 || (daysToAdd === 0 && next <= baseDate)) daysToAdd += 7;
    next.setDate(next.getDate() + daysToAdd);
    return nowStamp(next);
  }

  if (settings.frequency === "Mensual") {
    const day = Math.min(28, Math.max(1, Number(settings.monthDay) || 1));
    next.setDate(day);
    if (next <= baseDate) next.setMonth(next.getMonth() + 1, day);
    return nowStamp(next);
  }

  if (next <= baseDate) next.setDate(next.getDate() + 1);
  return nowStamp(next);
}

function sanitizeSlug(value) {
  return String(value || "empresa")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "empresa";
}

async function fetchJson(path, options) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path} respondio ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`);
  }
  return payload;
}

async function directorySize(path) {
  if (!existsSync(path)) return 0;
  const entries = await readdir(path, { withFileTypes: true });
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const currentPath = join(path, entry.name);
      if (entry.isDirectory()) return directorySize(currentPath);
      if (!entry.isFile()) return 0;
      return (await stat(currentPath)).size;
    }),
  );
  return sizes.reduce((total, value) => total + value, 0);
}

function sizeLabel(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

async function createInformationBackup(company, state, companyDir, stamp) {
  const fileName = `${sanitizeSlug(company.slug || company.name)}-informacion-${stamp}.json`;
  const outputPath = join(companyDir, fileName);
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
        },
        generatedAt: nowStamp(),
        state,
      },
      null,
      2,
    ),
    "utf8",
  );
  return { fileName, bytes: (await stat(outputPath)).size };
}

async function createFilesBackup(company, companyDir, stamp) {
  if (!existsSync(uploadsDir)) {
    return { fileName: "sin-uploads", bytes: 0 };
  }
  const fileName = `${sanitizeSlug(company.slug || company.name)}-archivos-${stamp}.tar.gz`;
  const outputPath = join(companyDir, fileName);
  await execFileAsync("tar", ["-czf", outputPath, "-C", dirname(uploadsDir), "uploads"]);
  return { fileName, bytes: (await stat(outputPath)).size };
}

function shouldRun(settings, now) {
  if (!settings?.enabled) return false;
  const scheduledAt = parseLocalStamp(settings.nextRunAt);
  if (!scheduledAt) return true;
  return scheduledAt <= now;
}

async function runCompanyBackup(company, operationState, settings, now) {
  const companyDir = join(backupRoot, sanitizeSlug(company.slug || company.name));
  await mkdir(companyDir, { recursive: true });
  const stamp = fileStamp(now);
  const artifacts = [];

  if (settings.target === "Base de datos" || settings.target === "Completo") {
    artifacts.push(await createInformationBackup(company, operationState, companyDir, stamp));
  }

  if (settings.target === "Archivos" || settings.target === "Completo") {
    artifacts.push(await createFilesBackup(company, companyDir, stamp));
  }

  const totalBytes = artifacts.reduce((total, artifact) => total + artifact.bytes, 0);
  const startedAt = nowStamp(now);
  const run = {
    id: createId("backup-run"),
    tenantId: settings.tenantId,
    settingsId: settings.id,
    status: "Correcto",
    startedAt,
    finishedAt: nowStamp(),
    frequency: settings.frequency,
    target: settings.target,
    destination: settings.destination,
    sizeLabel: sizeLabel(totalBytes),
    fileName: artifacts.map((artifact) => artifact.fileName).join(" + "),
    notes: "Respaldo automatico generado por job del VPS.",
  };

  const nextSettings = {
    ...settings,
    lastRunAt: startedAt,
    nextRunAt: getNextRunAt(settings, now),
  };

  return {
    ...operationState,
    backupSettings: [
      ...(operationState.backupSettings || []).filter((item) => item.tenantId !== settings.tenantId),
      nextSettings,
    ],
    backupRuns: [run, ...(operationState.backupRuns || [])],
    auditEntries: [
      {
        id: createId("audit"),
        tenantId: settings.tenantId,
        actor: "Job automatico VPS",
        at: startedAt,
        entity: "backupRuns",
        entityId: run.id,
        action: "generate",
        description: `Respaldo automatico ${settings.target.toLowerCase()} generado.`,
      },
      ...(operationState.auditEntries || []),
    ],
  };
}

async function main() {
  const now = new Date();
  const platform = await fetchJson("/platform/state");
  const companies = Array.isArray(platform.companies) ? platform.companies : [];
  let generated = 0;

  for (const company of companies) {
    if (company.status && company.status !== "Activa") continue;
    const payload = await fetchJson(`/platform/operation-state/${encodeURIComponent(company.id)}`);
    const operationState = payload.state || {};
    const tenantId = `tenant-company-${company.id}`;
    const settings = (operationState.backupSettings || []).find((item) => item.tenantId === tenantId);
    if (!shouldRun(settings, now)) continue;

    const nextState = await runCompanyBackup(company, operationState, settings, now);
    await fetchJson(`/platform/operation-state/${encodeURIComponent(company.id)}`, {
      method: "PUT",
      body: JSON.stringify({ state: nextState }),
    });
    generated += 1;
  }

  console.log(`[${nowStamp(now)}] respaldos generados: ${generated}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
