"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppAccent } from "@/lib/navigation";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ToastViewport } from "@/components/ui/toast-viewport";

type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
};

export type ConfirmSummaryItem = {
  label: string;
  value: string;
};

type ConfirmActionOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  accent?: AppAccent;
  summary?: ConfirmSummaryItem[];
  successTitle?: string;
  successDescription?: string;
  errorTitle?: string;
  errorDescription?: string;
  action: () => Promise<void> | void;
};

type DialogStatus = "idle" | "loading" | "success" | "error";

type DialogState = ConfirmActionOptions & {
  open: boolean;
  status: DialogStatus;
  runtimeMessage?: string;
  resolve: (value: boolean) => void;
};

type FeedbackContextValue = {
  confirmAction: (options: ConfirmActionOptions) => Promise<boolean>;
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  notifySuccess: (title: string, description?: string) => void;
  notifyError: (title: string, description?: string) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function createFeedbackId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const closeTimerRef = useRef<number | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = createFeedbackId("toast");
      setToasts((current) => [...current, { id, ...toast }]);

      window.setTimeout(() => {
        dismissToast(id);
      }, 4200);
    },
    [dismissToast]
  );

  const notifySuccess = useCallback(
    (title: string, description?: string) => {
      pushToast({ title, description, tone: "success" });
    },
    [pushToast]
  );

  const notifyError = useCallback(
    (title: string, description?: string) => {
      pushToast({ title, description, tone: "error" });
    },
    [pushToast]
  );

  const closeDialog = useCallback((result: boolean) => {
    setDialog((current) => {
      if (!current) {
        return null;
      }

      current.resolve(result);
      return null;
    });
  }, []);

  const confirmAction = useCallback((options: ConfirmActionOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        ...options,
        open: true,
        status: "idle",
        runtimeMessage: undefined,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!dialog) {
      return;
    }

    setDialog((current) =>
      current
        ? {
            ...current,
            status: "loading",
            runtimeMessage: undefined,
          }
        : null
    );

    try {
      await Promise.all([Promise.resolve(dialog.action()), sleep(320)]);

      notifySuccess(
        dialog.successTitle ?? "Accion completada",
        dialog.successDescription ?? "La operacion se registro correctamente."
      );

      setDialog((current) =>
        current
          ? {
              ...current,
              status: "success",
              runtimeMessage:
                dialog.successDescription ?? "La accion se confirmo sin novedades.",
            }
          : null
      );

      closeTimerRef.current = window.setTimeout(() => {
        closeDialog(true);
      }, 720);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : dialog.errorDescription ?? "No fue posible completar la accion.";

      notifyError(dialog.errorTitle ?? "No se pudo completar la accion", message);

      setDialog((current) =>
        current
          ? {
              ...current,
              status: "error",
              runtimeMessage: message,
            }
          : null
      );
    }
  }, [closeDialog, dialog, notifyError, notifySuccess]);

  const handleCancel = useCallback(() => {
    if (dialog?.status === "loading") {
      return;
    }

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeDialog(false);
  }, [closeDialog, dialog?.status]);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      confirmAction,
      pushToast,
      notifySuccess,
      notifyError,
    }),
    [confirmAction, notifyError, notifySuccess, pushToast]
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <ActionDialog dialog={dialog} onCancel={handleCancel} onConfirm={handleConfirm} />
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }

  return context;
}
