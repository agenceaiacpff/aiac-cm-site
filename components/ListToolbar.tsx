"use client";

type Option = { value: string; label: string };

export function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\ufeff${content}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function paginate<T>(items: T[], page: number, pageSize = 8) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  return { items: items.slice((safePage - 1) * pageSize, safePage * pageSize), pages, page: safePage };
}

export default function ListToolbar({
  query,
  onQuery,
  status,
  onStatus,
  options = [],
  count,
  page,
  pages,
  onPage,
  onExport,
  placeholder = "Rechercher…",
}: {
  query: string;
  onQuery: (value: string) => void;
  status?: string;
  onStatus?: (value: string) => void;
  options?: Option[];
  count: number;
  page: number;
  pages: number;
  onPage: (value: number) => void;
  onExport: () => void;
  placeholder?: string;
}) {
  return (
    <div className="listTools">
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        onChange={(event) => { onQuery(event.target.value); onPage(1); }}
      />
      {onStatus && (
        <select value={status} onChange={(event) => { onStatus(event.target.value); onPage(1); }}>
          <option value="all">Tous les états</option>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      )}
      <button type="button" className="secondaryButton" onClick={onExport} disabled={count === 0}>Exporter CSV</button>
      <span className="listCount">{count} résultat(s)</span>
      <div className="pagination" aria-label="Pagination">
        <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1}>Précédent</button>
        <span>{page} / {pages}</span>
        <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages}>Suivant</button>
      </div>
    </div>
  );
}
