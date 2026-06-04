import { useState, useMemo } from "react";
import { StockAlertBanner } from "../components/StockAlertBanner";
import { OilCard } from "../components/OilCard";
import { InventoryTable } from "../components/InventoryTable";
import { OilChangeHistory } from "../components/OilChangeHistory";
import { ItemDetailModal, OilChangeModal } from "../components/Modals";
import { AddOilTypeModal, AddInventoryModal } from "../components/FormModals";
import { useOilTypes } from "../../../hooks/useOilTypes";
import { useOilChanges } from "../../../hooks/useOilChanges";
import { useInventory } from "../../../hooks/useInventory";
import { useAssets } from "../../../hooks/useAssets";
import { useDrivers } from "../../../hooks/useDrivers";
import { usePermissions } from "../../../hooks/usePermissions";
import type { OilType, InventoryItem, OilChange, TabKey } from "../components/types";

// ─── KPI strip ────────────────────────────────────────────────────────────────

interface KpiStripProps {
  oilTypes: OilType[];
  inventory: InventoryItem[];
  oilChanges: OilChange[];
}

function KpiStrip({ oilTypes, inventory, oilChanges }: KpiStripProps) {
  const lowOil = oilTypes.filter((o) => o.stock <= o.minStock).length;
  const lowInv = inventory.filter((i) => i.stock <= i.minStock).length;
  const totalAlerts = lowOil + lowInv;

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      <div className="min-w-[120px] flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Total</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-white">{oilTypes.length + inventory.length}</p>
        <p className="mt-0.5 text-xs text-white/30">ítems</p>
      </div>

      <div className={`min-w-[120px] flex-1 rounded-2xl border px-4 py-3 ${totalAlerts > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-white/[0.07] bg-white/[0.03]"}`}>
        <p className={`text-[10px] font-bold uppercase tracking-widest ${totalAlerts > 0 ? "text-amber-400" : "text-white/40"}`}>
          Alertas de stock
        </p>
        <p className={`mt-1 text-3xl font-black tabular-nums ${totalAlerts > 0 ? "text-amber-400" : "text-white"}`}>
          {totalAlerts}
        </p>
        <div className="mt-0.5 flex items-center gap-1">
          {totalAlerts > 0 && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-400">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          <p className={`text-xs ${totalAlerts > 0 ? "text-amber-400/70" : "text-white/30"}`}>
            {totalAlerts > 0 ? "por reponer" : "sin alertas"}
          </p>
        </div>
      </div>

      <div className="min-w-[120px] flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Aceites</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-white">{oilTypes.length}</p>
        <p className="mt-0.5 text-xs text-white/30">catálogo activo</p>
      </div>

      <div className="min-w-[120px] flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Repuestos</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-white">{inventory.length}</p>
        <p className="mt-0.5 text-xs text-white/30">en inventario</p>
      </div>

      <div className="min-w-[120px] flex-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Cambios</p>
        <p className="mt-1 text-3xl font-black tabular-nums text-white">{oilChanges.length}</p>
        <p className="mt-0.5 text-xs text-white/30">historial acumulado</p>
      </div>
    </div>
  );
}

// ─── Tab button ───────────────────────────────────────────────────────────────

interface TabProps {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}

function Tab({ label, active, onClick, count }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
        active ? "text-white" : "text-white/40 hover:text-white/70"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
          active ? "bg-emerald-500 text-black" : "bg-white/[0.08] text-white/40"
        }`}>
          {count}
        </span>
      )}
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-emerald-500" />
      )}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LubricacionPage() {
  const {
    oilTypes,
    createOilType,
    updateOilType,
    deleteOilType,
  } = useOilTypes();

  const {
    oilChanges,
    createOilChange,
    deleteOilChange,
  } = useOilChanges();

  const {
    inventory,
    createItem: createInventoryItem,
    updateItem: updateInventoryItem,
    deleteItem: deleteInventoryItem,
  } = useInventory();

  const { assets } = useAssets();
  const { drivers } = useDrivers();
  const { can } = usePermissions();

  // ─── Permisos granulares ──────────────────────────────────────────────────
  const canCreate = can("mantenimiento", "inventario", "crear");
  const canEdit   = can("mantenimiento", "inventario", "editar");
  const canDelete = can("mantenimiento", "inventario", "eliminar");

  // ── State: UI ──
  const [tab, setTab] = useState<TabKey>("aceites");
  const [searchInv, setSearchInv] = useState("");

  // ── Modals ──
  const [itemDetail, setItemDetail] = useState<InventoryItem | null>(null);
  const [oilChangeModal, setOilChangeModal] = useState<OilType | Record<string, never> | null>(null);
  const [oilFormModal, setOilFormModal] = useState<OilType | "new" | null>(null);
  const [invFormModal, setInvFormModal] = useState(false);

  // ── Derived ──
  const lowOils = useMemo(
    () => oilTypes.filter((o) => o.stock <= o.minStock),
    [oilTypes]
  );
  const lowInventory = useMemo(
    () => inventory.filter((i) => i.stock <= i.minStock),
    [inventory]
  );

  const filteredInventory = useMemo(() => {
    if (!searchInv) return inventory;
    const q = searchInv.toLowerCase();
    return inventory.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.category ?? "").toLowerCase().includes(q)
    );
  }, [inventory, searchInv]);

  // ── Handlers: oils ──
  const handleDeleteOil = async (oil: OilType) => {
    await deleteOilType(oil.id);
  };

  const handleOilFormSubmit = async (form: Omit<OilType, "id" | "companyId" | "createdAt" | "updatedAt"> & { id?: string }) => {
    try {
      if (oilFormModal !== "new" && oilFormModal?.id) {
        await updateOilType(oilFormModal.id, form);
      } else {
        await createOilType(form);
      }
      setOilFormModal(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Handlers: inventory ──
  const handleInventorySubmit = async (form: Omit<InventoryItem, "id" | "companyId" | "createdAt" | "updatedAt">) => {
    try {
      await createInventoryItem(form);
      setInvFormModal(false);
    } catch (err) {
      console.error(err);
    }
  };

  // ── Handlers: oil changes ──
  const handleOilChangeSubmit = async (form: {
    oilTypeId: string;
    assetId: string;
    date: string;
    reading: string | number;
    nextReading: string | number;
    quantity: string | number;
    technician: string;
    notes: string;
  }) => {
    try {
      await createOilChange({
        assetId: form.assetId,
        oilTypeId: form.oilTypeId,
        date: form.date,
        reading: Number(form.reading),
        nextReading: Number(form.nextReading),
        quantity: Number(form.quantity),
        technician: form.technician || null,
        notes: form.notes || null,
      });
      setOilChangeModal(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteChange = async (chg: OilChange) => {
    await deleteOilChange(chg.id);
  };

  return (
    <div className="space-y-5 p-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Lubricación e inventario
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-white">
            Aceites y repuestos
          </h1>
          <p className="mt-1 text-sm text-white/40">
            Catálogo de lubricantes, stock de repuestos y registro de cambios por activo.
          </p>
        </div>

        {/* Botones de acción — solo si puede crear */}
        {canCreate && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setInvFormModal(true)}
              className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-bold text-white/60 transition hover:bg-white/[0.05] hover:text-white"
            >
              + Repuesto
            </button>
            <button
              onClick={() => setOilFormModal("new")}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-black transition hover:bg-emerald-400 active:scale-95"
            >
              + Aceite
            </button>
          </div>
        )}
      </div>

      {/* ── KPIs ── */}
      <KpiStrip oilTypes={oilTypes} inventory={inventory} oilChanges={oilChanges} />

      {/* ── Alert banner ── */}
      <StockAlertBanner
        lowOils={lowOils}
        lowInventory={lowInventory}
        onOilClick={() => setTab("aceites")}
        onInventoryClick={(item: InventoryItem) => {
          setTab("inventario");
          setItemDetail(item);
        }}
      />

      {/* ── Tabs container ── */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-white/[0.06] px-4">
          <Tab
            label="Aceites"
            active={tab === "aceites"}
            onClick={() => setTab("aceites")}
            count={oilTypes.length}
          />
          <Tab
            label="Inventario"
            active={tab === "inventario"}
            onClick={() => setTab("inventario")}
            count={inventory.length}
          />
          <Tab
            label="Historial de cambios"
            active={tab === "historial"}
            onClick={() => setTab("historial")}
            count={oilChanges.length}
          />
          <div className="ml-auto py-2">
            {tab === "inventario" && (
              <div className="relative">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  value={searchInv}
                  onChange={(e) => setSearchInv(e.target.value)}
                  placeholder="Buscar repuesto..."
                  className="h-8 rounded-xl border border-white/[0.08] bg-white/[0.04] pl-8 pr-3 text-xs text-white placeholder:text-white/20 focus:border-emerald-500/40 focus:outline-none"
                />
              </div>
            )}
            {/* Botón "Registrar cambio" — solo si puede crear */}
            {tab === "historial" && canCreate && (
              <button
                onClick={() => setOilChangeModal({})}
                className="rounded-xl bg-emerald-500/90 px-3 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-500"
              >
                + Registrar cambio
              </button>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="min-h-[300px]">
          {tab === "aceites" && (
            <div className="p-5">
              {oilTypes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16">
                  <p className="text-sm text-white/30">Sin aceites registrados</p>
                  {canCreate && (
                    <button
                      onClick={() => setOilFormModal("new")}
                      className="mt-1 rounded-xl border border-emerald-500/30 px-4 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/10 transition"
                    >
                      Agregar primer aceite
                    </button>
                  )}
                </div>
              ) : (
                <OilCard
                  oils={oilTypes}
                  onEdit={canEdit ? (o) => setOilFormModal(o) : undefined}
                  onDelete={canDelete ? handleDeleteOil : undefined}
                  onRegisterChange={canCreate ? (o) => setOilChangeModal(o) : undefined}
                />
              )}
            </div>
          )}

          {tab === "inventario" && (
            <InventoryTable
              items={filteredInventory}
              onItemClick={setItemDetail}
              onAddItem={canCreate ? () => setInvFormModal(true) : undefined}
            />
          )}

          {tab === "historial" && (
            <div className="p-4">
              <OilChangeHistory
                changes={oilChanges}
                onDelete={canDelete ? handleDeleteChange : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {itemDetail && (
        <ItemDetailModal
          item={itemDetail}
          onClose={() => setItemDetail(null)}
          onEdit={canEdit ? () => {} : undefined}
        />
      )}
      {oilChangeModal !== null && (
        <OilChangeModal
          oilTypes={oilTypes}
          assets={assets}
          drivers={drivers}
          preselectedOil={"id" in oilChangeModal ? oilChangeModal as OilType : null}
          onClose={() => setOilChangeModal(null)}
          onSubmit={handleOilChangeSubmit}
        />
      )}
      {oilFormModal !== null && (
        <AddOilTypeModal
          initial={oilFormModal === "new" ? null : oilFormModal}
          onClose={() => setOilFormModal(null)}
          onSubmit={handleOilFormSubmit}
        />
      )}
      {invFormModal && (
        <AddInventoryModal
          onClose={() => setInvFormModal(false)}
          onSubmit={handleInventorySubmit}
        />
      )}
    </div>
  );
}