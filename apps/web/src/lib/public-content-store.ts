import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDefaultPublicContentSnapshot } from "@/lib/public-content-defaults";
import type { PublicContentSnapshot } from "@/types/platform";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "public-content.json");

async function ensureStore() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readPublicContent(): Promise<PublicContentSnapshot> {
  await ensureStore();

  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as PublicContentSnapshot;
    return {
      ...createDefaultPublicContentSnapshot(),
      ...parsed,
      settings: {
        ...createDefaultPublicContentSnapshot().settings,
        ...parsed.settings,
      },
    };
  } catch {
    const fallback = createDefaultPublicContentSnapshot();
    await writePublicContent(fallback);
    return fallback;
  }
}

export async function writePublicContent(input: PublicContentSnapshot) {
  await ensureStore();
  await writeFile(DATA_FILE, JSON.stringify(input, null, 2), "utf8");
}
