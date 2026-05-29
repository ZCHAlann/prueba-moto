import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { SurfaceCard } from "@/components/ui/surface";

/* ─── TableCard ───────────────────────────────────────────────────────────── */
export function TableCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SurfaceCard className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between dark:border-gray-700">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </SurfaceCard>
  );
}

/* ─── Table ───────────────────────────────────────────────────────────────── */
export function Table({
  children,
  className = "",
  minWidth = "min-w-[920px]",
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <table className={`w-full text-left text-sm ${minWidth} ${className}`}>
      {children}
    </table>
  );
}

/* ─── TableHeader ─────────────────────────────────────────────────────────── */
export function TableHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <thead className={className}>
      {children}
    </thead>
  );
}

/* ─── TableBody ───────────────────────────────────────────────────────────── */
export function TableBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tbody className={`divide-y divide-gray-200 dark:divide-gray-700 ${className}`}>
      {children}
    </tbody>
  );
}

/* ─── TableRow ────────────────────────────────────────────────────────────── */
export function TableRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={`transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03] ${className}`}>
      {children}
    </tr>
  );
}

/* ─── TableCell ───────────────────────────────────────────────────────────── */
type TableCellProps = {
  children?: ReactNode;
  isHeader?: boolean;
  className?: string;
} & (
  | ({ isHeader: true }  & ThHTMLAttributes<HTMLTableCellElement>)
  | ({ isHeader?: false } & TdHTMLAttributes<HTMLTableCellElement>)
);

export function TableCell({
  children,
  isHeader = false,
  className = "",
  ...rest
}: TableCellProps) {
  if (isHeader) {
    return (
      <th
        scope="col"
        className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 ${className}`}
        {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}
      >
        {children}
      </th>
    );
  }
  return (
    <td
      className={`px-5 py-3.5 text-gray-700 dark:text-gray-300 ${className}`}
      {...(rest as TdHTMLAttributes<HTMLTableCellElement>)}
    >
      {children}
    </td>
  );
}

/* ─── Legacy aliases (compatibilidad con código existente) ───────────────── */
export const Th = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <TableCell isHeader className={className}>{children}</TableCell>
);

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <TableCell className={className}>{children}</TableCell>
);

export const TableHead = TableHeader;