import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100, 200],
  className = ''
}: PaginationProps) {
  if (totalItems === 0) return null;

  const startIndex = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const endIndex = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) {
        pages.push('...');
      }

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-canvas border-t border-hairline text-xs ${className}`}
    >
      {/* Left: Info & Rows per page */}
      <div className="flex items-center gap-3 text-muted">
        <span>
          แสดง <strong className="text-ink font-mono">{startIndex} - {endIndex}</strong> จากทั้งหมด{' '}
          <strong className="text-ink font-mono">{totalItems}</strong> รายการ
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-3 border-l border-hairline">
            <span className="text-[11px]">แถวต่อหน้า:</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="bg-surface-soft hover:bg-surface-strong border border-hairline rounded-lg px-2 py-0.5 text-xs font-bold font-mono text-ink cursor-pointer focus:outline-none focus:border-primary"
            >
              {pageSizeOptions.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Buttons */}
      <div className="flex items-center gap-1 self-center sm:self-auto">
        {/* First Page Button */}
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          className="p-1.5 rounded-lg border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="หน้าแรก"
        >
          <ChevronsLeft size={14} />
        </button>

        {/* Previous Page Button */}
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-1.5 rounded-lg border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="หน้าก่อนหน้า"
        >
          <ChevronLeft size={14} />
        </button>

        {/* Number Buttons */}
        <div className="flex items-center gap-1 mx-1">
          {getPageNumbers().map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`dots-${idx}`} className="px-1.5 text-muted select-none">
                  ...
                </span>
              );
            }

            const pageNum = p as number;
            const isActive = pageNum === currentPage;

            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => onPageChange(pageNum)}
                className={`min-w-7 h-7 px-1.5 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-soft hover:bg-surface-strong text-muted hover:text-ink border border-hairline'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Page Button */}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-1.5 rounded-lg border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="หน้าถัดไป"
        >
          <ChevronRight size={14} />
        </button>

        {/* Last Page Button */}
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          className="p-1.5 rounded-lg border border-hairline bg-canvas hover:bg-surface-soft text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          title="หน้าสุดท้าย"
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  );
}
