import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Send, NotebookPen, MessageSquare, Sparkles, User } from 'lucide-react';
import CockpitModal from '../common/CockpitModal';
import { useAssetNotes } from '../hooks/useAssetNotes';

type Props = { open: boolean; onClose: () => void; assetId: string; companyId: string };

const AVATAR_PALETTE = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-fuchsia-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

function avatarFromName(name?: string | null): string {
  if (!name) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initialsOf(name?: string | null): string {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

function relativeTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1)    return "ahora";
  if (min < 60)   return `hace ${min} min`;
  const hr = Math.round(min / 60);
  if (hr  < 24)   return `hace ${hr} h`;
  const days = Math.round(hr / 24);
  if (days < 7)   return `hace ${days} d`;
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ModalNotas({ open, onClose, assetId, companyId }: Props) {
  const { notes, addNote, removeNote, loading } = useAssetNotes(assetId, companyId);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setBody(""); setConfirmId(null); }
  }, [open]);

  const submit = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await addNote(text);
      setBody('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <CockpitModal
      open={open}
      onClose={onClose}
      title="Notas del vehículo"
    >
      <div className="space-y-4">
        {/* ── Composer ── */}
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gradient-to-br from-blue-50/60 via-white to-violet-50/40 dark:from-blue-500/[0.04] dark:via-white/[0.03] dark:to-violet-500/[0.04] p-3">
          <div className="flex items-start gap-2.5">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${avatarFromName("Tú")} text-white shadow-sm`}>
              <User size={15} />
            </div>
            <div className="flex-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Escribe una nota sobre este vehículo…"
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] px-3 py-2 text-sm text-gray-800 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none transition focus:border-blue-400 dark:focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/10"
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="hidden text-[11px] text-gray-400 dark:text-gray-500 sm:inline">
                  <kbd className="rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">⌘</kbd>
                  <span className="ml-1">+</span>
                  <kbd className="ml-1 rounded border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">Enter</kbd>
                  <span className="ml-1.5">para enviar</span>
                </span>
                <button
                  onClick={submit}
                  disabled={saving || !body.trim()}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition
                    ${body.trim() && !saving
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30 hover:bg-blue-700"
                      : "bg-gray-100 dark:bg-white/[0.06] text-gray-400 dark:text-gray-500 cursor-not-allowed"}`}
                >
                  {saving ? (
                    <>
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Guardando…
                    </>
                  ) : (
                    <>
                      <Send size={12} />
                      Agregar nota
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Lista ── */}
        {loading && notes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-xs text-gray-400 dark:text-gray-500">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-500" />
            Cargando notas…
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-violet-100 text-blue-500 dark:from-blue-500/10 dark:to-violet-500/10 dark:text-blue-300">
              <NotebookPen size={20} />
            </div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sin notas todavía</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Empieza escribiendo arriba. Ideal para recordatorios, observaciones o tareas pendientes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              <MessageSquare size={11} />
              {notes.length} {notes.length === 1 ? "nota" : "notas"}
            </div>
            <AnimatePresence initial={false}>
              {notes.map((n) => {
                const grad = avatarFromName(n.authorName);
                const isConfirming = confirmId === n.id;
                return (
                  <motion.div
                    key={n.id}
                    layout
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="group rounded-xl border border-gray-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.03] p-3.5 transition hover:border-gray-300 dark:hover:border-white/10"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-xs font-bold text-white shadow-sm`}>
                        {initialsOf(n.authorName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white">
                              {n.authorName ?? "Anónimo"}
                            </p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">
                              {relativeTime(n.createdAt)}
                              <span className="mx-1.5">·</span>
                              <time dateTime={n.createdAt} className="tabular-nums">
                                {new Date(n.createdAt).toLocaleString("es-EC", {
                                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                                })}
                              </time>
                            </p>
                          </div>
                          {!isConfirming && (
                            <button
                              onClick={() => setConfirmId(n.id)}
                              aria-label="Eliminar nota"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-300 dark:text-gray-600 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                          {n.body}
                        </p>
                        {isConfirming && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-2 flex items-center gap-2 overflow-hidden rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-2.5 py-2"
                          >
                            <Sparkles size={12} className="text-rose-500" />
                            <p className="flex-1 text-xs font-medium text-rose-700 dark:text-rose-300">
                              ¿Eliminar esta nota?
                            </p>
                            <button
                              onClick={() => setConfirmId(null)}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 transition hover:bg-white/60 dark:hover:bg-white/5"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => { removeNote(n.id); setConfirmId(null); }}
                              className="rounded-md bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-600"
                            >
                              Eliminar
                            </button>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </CockpitModal>
  );
}
