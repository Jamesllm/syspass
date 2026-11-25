import type { ReactNode } from 'react';
import { cx } from '../lib/format';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** En móvil es el título de la tarjeta (sin etiqueta) */
  primary?: boolean;
  /** En móvil se oculta */
  desktopOnly?: boolean;
}

/**
 * Tabla en escritorio; en móvil cada fila se vuelve una tarjeta apilada
 * (sin scroll horizontal). Las etiquetas salen de `header`.
 */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, empty }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
}) {
  return (
    <table className="t">
      <thead>
        <tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            className={cx(onRowClick && 'click')}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
          >
            {columns.map((c) => (
              <td
                key={c.key}
                className={cx(c.className, c.primary && 'primary', c.desktopOnly && 'desktop-only')}
                data-label={c.primary ? undefined : c.header}
              >
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && empty && (
          <tr className="empty-row"><td colSpan={columns.length} className="muted">{empty}</td></tr>
        )}
      </tbody>
    </table>
  );
}
