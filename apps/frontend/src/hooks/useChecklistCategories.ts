import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
export type ChecklistCategory = {
  id: string;
  name: string;
  description: string;
  items: string[];
  createdAt: string;
  updatedAt: string;
};

type CreateChecklistCategoryInput = {
  name: string;
  description: string;
  items: string[];
};

export function useChecklistCategories() {
  const { session } = useAuth();
  const companyId = session?.companyId ? String(session.companyId) : null;

  const [categories, setCategories] = useState<ChecklistCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/${companyId}/checklists/checklist-categories`);
      if (!res.ok) throw new Error("Error al cargar categorías");
      const json = await res.json();
      const raw: Array<Record<string, unknown>> = json.data ?? json;
      setCategories(
        raw.map((c) => ({
          id: String(c.id),
          name: String(c.name),
          description: String(c.description ?? ""),
          items: Array.isArray(c.items) ? (c.items as string[]) : [],
          createdAt: String(c.created_at ?? "").slice(0, 16).replace("T", " "),
          updatedAt: String(c.updated_at ?? "").slice(0, 16).replace("T", " "),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const createCategory = useCallback(
    async (input: CreateChecklistCategoryInput) => {
      if (!companyId) return;
      const res = await fetch(`/api/company/${companyId}/checklists/checklist-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al crear categoría");
      }
      await fetchCategories();
    },
    [companyId, fetchCategories]
  );

  const updateCategory = useCallback(
    async (categoryId: string, input: Partial<CreateChecklistCategoryInput>) => {
      if (!companyId) return;
      const res = await fetch(`/api/company/${companyId}/checklists/checklist-categories/${categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al actualizar categoría");
      }
      await fetchCategories();
    },
    [companyId, fetchCategories]
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      if (!companyId) return;
      const res = await fetch(`/api/company/${companyId}/checklists/checklist-categories/${categoryId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al eliminar categoría");
      }
      await fetchCategories();
    },
    [companyId, fetchCategories]
  );

  return { categories, loading, error, createCategory, updateCategory, deleteCategory, refetch: fetchCategories };
}