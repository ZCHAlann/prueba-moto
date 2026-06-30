"use client";

// ─────────────────────────────────────────────────────────────────────────────
// pages/Reports/CanvasBoardsListPage.tsx
//
// Listado de lienzos guardados. Cada card muestra:
//   - Nombre + descripción
//   - Quién lo creó (owner)
//   - Si es compartido o privado
//   - Cantidad de widgets + última edición
//
// Acciones: Abrir / Duplicar / Eliminar.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router";
import {
  Plus, LayoutGrid, Clock, Users, Lock, Share2, Copy,
  Trash2, ArrowRight, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCanvasBoards, createBoard, deleteBoard, type CanvasBoard,
} from "../../hooks/useCanvasBoards";
import { useAuth } from "../../context/AuthContext";
import { usePermissions } from "../../hooks/usePermissions";
import { fmtDateTimeEc } from "@/lib/datetime";
import { ConfirmModal } from "../../components/ui/ConfirmModal";

export function CanvasBoardsListPage() {
  const { session } = useAuth();
  const { can } = usePermissions();
  const navigate = useNavigate();
  const companyId = session?.companyId ? String(session.companyId) : null;
  const { boards, loading, refetch } = useCanvasBoards();

  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [boardToDelete, setBoardToDelete] = useState<CanvasBoard | null>(null);

  const canCreate = can("lienzo", "lienzo", "crear");

  async function handleCreate() {
    if (!companyId) return;
    setCreating(true);
    try {
      const board = await createBoard(companyId, {
        name: "Nuevo lienzo",
        description: null,
        panelModules: [],
        isShared: false,
      });
      toast.success(`Lienzo "${board.name}" creado.`);
      navigate(`/lienzo/${board.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el lienzo");
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(b: CanvasBoard) {
    if (!companyId) return;
    try {
      const dup = await createBoard(companyId, {
        name: `${b.name} (copia)`,
        description: b.description,
        panelModules: b.panelModules,
        isShared: b.isShared,
      });
      toast.success(`Duplicado como "${dup.name}".`);
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al duplicar");
    }
  }

  async function handleDelete(b: CanvasBoard) {
    if (!companyId) return;
    setDeletingId(b.id);
    try {
      await deleteBoard(companyId, b.id);
      toast.success("Lienzo eliminado.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:bg-emerald-500/[0.12] dark:text-emerald-400">
              Cumplimiento
            </span>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-800 dark:text-white">
              <LayoutGrid size={20} className="text-emerald-500" />
              Lienzo de presentación
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Arma lienzos con gráficas y tablas para tus reuniones recurrentes. Arrastra módulos,
              suelta en el canvas y compara activos o conductores.
            </p>
          </div>
          {canCreate && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Nuevo lienzo
            </button>
          )}
        </div>

        {/* Lista */}
        {loading && boards.length === 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.04]" />
            ))}
          </div>
        ) : boards.length === 0 ? (
          <EmptyState canCreate={canCreate} onCreate={handleCreate} creating={creating} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                deleting={deletingId === b.id}
                onOpen={() => navigate(`/lienzo/${b.id}`)}
                onDuplicate={() => handleDuplicate(b)}
                onDelete={() => setBoardToDelete(b)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal confirmación: eliminar lienzo ──────────────────────── */}
      <ConfirmModal
        open={!!boardToDelete}
        title="Eliminar lienzo"
        description={
          <>
            ¿Eliminar el lienzo <strong>"{boardToDelete?.name}"</strong>? Los widgets dentro
            también se borrarán. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={() => {
          if (boardToDelete) void handleDelete(boardToDelete);
          setBoardToDelete(null);
        }}
        onClose={() => setBoardToDelete(null)}
      />
    </>
  );
}

// ─── Sub-componentes ───────────────────────────────────────────────────────

function BoardCard({
  board, deleting, onOpen, onDuplicate, onDelete,
}: {
  board: CanvasBoard;
  deleting: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:border-emerald-300 hover:shadow-md dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-emerald-500/40">
      <button
        onClick={onOpen}
        className="block w-full px-4 py-4 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-bold text-gray-900 dark:text-white">{board.name}</h3>
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              board.isShared
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400"
            }`}
          >
            {board.isShared ? <Share2 size={9} /> : <Lock size={9} />}
            {board.isShared ? "Compartido" : "Privado"}
          </span>
        </div>
        {board.description && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{board.description}</p>
        )}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1">
            <Clock size={11} />
            Editado {fmtDateTimeEc(board.updatedAt)}
          </span>
          {board.ownerUserId && (
            <span className="inline-flex items-center gap-1 truncate">
              <Users size={11} />
              <span className="truncate">por {board.ownerUserId.replace("company-user-", "")}</span>
            </span>
          )}
        </div>
      </button>
      <div className="flex items-center gap-1 border-t border-gray-100 bg-gray-50/60 px-2 py-1.5 dark:border-white/[0.04] dark:bg-white/[0.02]">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
        >
          Abrir <ArrowRight size={11} />
        </button>
        <button
          onClick={onDuplicate}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          <Copy size={11} /> Duplicar
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
        >
          {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          Eliminar
        </button>
      </div>
    </div>
  );
}

function EmptyState({ canCreate, onCreate, creating }: {
  canCreate: boolean; onCreate: () => void; creating: boolean;
}) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50/40 p-10 text-center dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <LayoutGrid size={22} />
      </div>
      <h3 className="mt-3 text-sm font-bold text-gray-800 dark:text-white">Tu primer lienzo</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
        Creá un lienzo para empezar. Vas a poder agregar módulos al panel izquierdo y arrastrarlos
        al canvas como gráficas o tablas.
      </p>
      {canCreate && (
        <button
          onClick={onCreate}
          disabled={creating}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Crear lienzo
        </button>
      )}
    </div>
  );
}