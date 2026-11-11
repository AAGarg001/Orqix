import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
export function usePagination<T>(
  items: T[],
  resetKey: unknown = "",
  size = 10,
) {
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(size);
  useEffect(() => setPage(1), [resetKey]);
  const total = items.length,
    pages = Math.max(1, Math.ceil(total / pageSize)),
    current = Math.min(page, pages);
  return {
    items: items.slice((current - 1) * pageSize, current * pageSize),
    total,
    page: current,
    pageSize,
    onPage: setPage,
    onSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
  };
}
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onSize,
  label = "records",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize)),
    current = Math.min(Math.max(1, page), pages);
  if (!total) return null;
  return (
    <nav className="cp-pagination" aria-label={`${label} pagination`}>
      <span>
        {total
          ? `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, total)}`
          : "0"}{" "}
        <span>
          of {total.toLocaleString("en-IN")} {label}
        </span>
      </span>
      <div>
        {onSize ? (
          <label>
            Rows
            <select
              aria-label={`Rows per page for ${label}`}
              value={pageSize}
              onChange={(e) => onSize(Number(e.target.value))}
            >
              {[5, 10, 25, 50].map((n) => (
                <option value={n} key={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          aria-label={`First page of ${label}`}
          disabled={current <= 1}
          onClick={() => onPage(1)}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          aria-label={`Previous page of ${label}`}
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span className="cp-page-number">
          {current} / {pages}
        </span>
        <button
          aria-label={`Next page of ${label}`}
          disabled={current >= pages}
          onClick={() => onPage(current + 1)}
        >
          <ChevronRight size={14} />
        </button>
        <button
          aria-label={`Last page of ${label}`}
          disabled={current >= pages}
          onClick={() => onPage(pages)}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </nav>
  );
}
