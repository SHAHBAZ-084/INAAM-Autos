import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type BusinessSettings, type DateRangePreset, type PaginatedResult } from '../../lib/api';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { downloadCsv, downloadExcel, downloadPdf, type ReportExportMeta } from '../../lib/reportExport';
import { resolveLogoDataUrl } from '../../lib/electronPrint';
import {
  buildPrintDocumentHeaderHtml,
  printHeaderCss,
  printHeaderFromSettings,
} from '../../components/print/PrintDocumentHeader';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { HubCloseButton } from '../../components/ui/HubCloseButton';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  URDU_PRINT_FONT_LINKS,
  URDU_PRINT_FONT_STACK,
  containsArabicScript,
  isRtlUiLanguage,
} from '../../i18n/printFonts';
import { Printer } from 'lucide-react';
import {
  FieldLabel,
  Feedback,
  IconButton,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { RomanUrduInput } from '../../components/ui/RomanUrduInput';

const BRAND_ACCENT = '#C8102E';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim();
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return [200, 16, 46];
}

export function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStartInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const PRESET_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'lifetime', label: 'Lifetime' },
  { value: 'custom', label: 'Custom' },
];

type ReportShellProps = {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: (string | number)[][];
  loading: boolean;
  error: string;
  onLoad: () => void;
  /** True after at least one successful/failed load attempt finished. */
  hasLoaded?: boolean;
  /** Shown when hasLoaded && rows empty (overrides default). */
  emptyMessage?: string;
  children?: ReactNode;
  preset?: DateRangePreset;
  onPresetChange?: (p: DateRangePreset) => void;
  fromDate?: string;
  toDate?: string;
  onFromDate?: (v: string) => void;
  onToDate?: (v: string) => void;
  search?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  page?: number;
  totalPages?: number;
  onPage?: (p: number) => void;
  summary?: ReactNode;
  exportMeta?: ReportExportMeta;
  /** Statement-style summary boxes under header line (left of title). */
  headerStats?: Array<{ label: string; value: string; tone?: 'default' | 'success' | 'danger' }>;
  /** When set, PDF/Excel/CSV/Print use these rows (e.g. all pages) instead of the current page. */
  resolveExportRows?: () => Promise<(string | number)[][]>;
  /** Hide date-range preset control (stock reports, etc.). */
  hidePreset?: boolean;
};

function ReportStatBoxes({
  stats,
}: {
  stats: Array<{ label: string; value: string; tone?: 'default' | 'success' | 'danger' }>;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap gap-2">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`min-w-[120px] rounded-md px-3 py-2 text-left ${
            s.tone === 'success'
              ? 'bg-success/10 text-success'
              : s.tone === 'danger'
                ? 'bg-danger/10 text-danger'
                : 'bg-[#f3f3f3] text-textPrimary'
          }`}
        >
          <div className="text-[10px] font-semibold opacity-80">{t(s.label)}</div>
          <div className="mt-0.5 text-sm font-extrabold tabular-nums">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

export function ReportShell({
  title,
  subtitle,
  headers,
  rows,
  loading,
  error,
  onLoad,
  hasLoaded = false,
  emptyMessage,
  children,
  preset,
  onPresetChange,
  fromDate,
  toDate,
  onFromDate,
  onToDate,
  search,
  onSearch,
  searchPlaceholder,
  page,
  totalPages,
  onPage,
  summary,
  exportMeta,
  headerStats,
  resolveExportRows,
  hidePreset = false,
}: ReportShellProps) {
  const { t, language } = useLanguage();
  const [businessMeta, setBusinessMeta] = useState<ReportExportMeta>({});
  const [printSettings, setPrintSettings] = useState<BusinessSettings | null>(null);
  const [exporting, setExporting] = useState(false);
  const accent = printSettings?.secondaryColor?.trim() || BRAND_ACCENT;
  const displayTitle = t(title);
  const displayHeaders = headers.map((h) => t(h));
  const presetOptions = PRESET_OPTIONS.map((o) => ({ ...o, label: t(o.label) }));
  const emptyText = emptyMessage ? t(emptyMessage) : t('No rows to show');
  const urduRtl = isRtlUiLanguage(language);

  useEffect(() => {
    api
      .getSettings()
      .then(async (settings) => {
        setPrintSettings(settings);
        const logoSrc = await resolveLogoDataUrl(settings.logoUrl);
        const phone = [settings.phoneLabel, settings.phone].filter(Boolean).join(' ').trim();
        const accentHex = settings.secondaryColor?.trim() || BRAND_ACCENT;
        setBusinessMeta({
          businessName: settings.businessName,
          address: settings.address,
          phone,
          logoSrc,
          accentRgb: hexToRgb(accentHex),
        });
      })
      .catch(() => undefined);
  }, []);

  const meta: ReportExportMeta = {
    ...businessMeta,
    ...exportMeta,
    generatedAt: exportMeta?.generatedAt ?? formatDateTime(new Date()),
    accentRgb: exportMeta?.accentRgb ?? businessMeta.accentRgb ?? hexToRgb(accent),
    summaryStats:
      exportMeta?.summaryStats ??
      headerStats?.map((s) => ({ label: t(s.label), value: s.value })),
  };

  async function rowsForExport() {
    if (resolveExportRows) return resolveExportRows();
    return rows;
  }

  async function exportReport(format: 'pdf' | 'excel' | 'csv') {
    setExporting(true);
    try {
      const exportRows = await rowsForExport();
      const base = title.replace(/\s+/g, '-').toLowerCase();
      if (format === 'pdf') await downloadPdf(`${base}.pdf`, displayTitle, displayHeaders, exportRows, meta);
      else if (format === 'excel') downloadExcel(`${base}.xlsx`, displayTitle.slice(0, 31), displayHeaders, exportRows, meta);
      else downloadCsv(`${base}.csv`, displayHeaders, exportRows, meta);
    } finally {
      setExporting(false);
    }
  }

  async function printReport() {
    setExporting(true);
    try {
      const exportRows = await rowsForExport();
      const headerHtml = printSettings
        ? buildPrintDocumentHeaderHtml(
            printHeaderFromSettings(printSettings, {
              title: displayTitle,
              logoSrc: meta.logoSrc,
              generatedAt: meta.generatedAt,
              dateRange: meta.dateRange,
            }),
          )
        : `<h1>${displayTitle}</h1>`;
      const statsHtml =
        headerStats && headerStats.length
          ? `<div class="print-summary-row">${headerStats
              .map(
                (s) =>
                  `<div class="print-summary-box">${t(s.label)}<strong>${s.value}</strong></div>`,
              )
              .join('')}</div>`
          : '';
      const printProbe = [
        displayTitle,
        ...displayHeaders,
        ...(headerStats?.map((s) => t(s.label)) ?? []),
        ...exportRows.flatMap((row) => row.map(String)),
      ].join(' ');
      const needsUrduFonts = containsArabicScript(printProbe);
      const htmlLangAttrs = urduRtl ? ' lang="ur" dir="rtl"' : '';
      const fontLinks = needsUrduFonts ? URDU_PRINT_FONT_LINKS : '';
      const bodyFont = needsUrduFonts
        ? URDU_PRINT_FONT_STACK
        : 'Arial,sans-serif';
      const html = `<!DOCTYPE html><html${htmlLangAttrs}><head><meta charset="utf-8"/>${fontLinks}<title>${displayTitle}</title><style>
      ${printHeaderCss(accent)}
      body{font-family:${bodyFont};padding:16px;color:#111;background:#fff${urduRtl ? ';direction:rtl' : ''}}
      table{border-collapse:collapse;width:100%;margin-top:4px}
      th,td{border-bottom:1px solid #e5e5e5;padding:8px 10px;text-align:start;font-size:${needsUrduFonts ? '13px' : '11px'};vertical-align:top}
      th{background:${accent};color:#fff;font-weight:700;border-bottom:none}
      tr:nth-child(even){background:#fafafa}
      .num{text-align:end}
      .items-detail{font-size:10px;color:#666;font-weight:500;margin-top:2px;line-height:1.35}
    </style></head><body class="print-doc-wrap">${headerHtml}${statsHtml}
    <table class="print-table-accent"><thead><tr>${displayHeaders.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${exportRows.map((row) => `<tr>${row.map((c) => `<td>${String(c).replace(/\n/g, '<br/>')}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(html);
      w.document.close();
      w.onload = () => w.print();
    } finally {
      setExporting(false);
    }
  }

  const phoneLine = meta.phone?.trim() || '';
  const addressLine = meta.address?.trim() || '';
  const canExport = rows.length > 0 || Boolean(resolveExportRows);

  return (
    <PageShell
      title={title}
      subtitle={subtitle}
      actions={<HubCloseButton to="/reports" label="Close" />}
    >
      <Panel className="mb-4 overflow-hidden p-0">
        <div className="border-b-2 px-4 py-4 sm:px-5" style={{ borderColor: accent }}>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-start">
            <div className="flex min-h-[56px] items-start">
              {meta.logoSrc ? (
                <img src={meta.logoSrc} alt="" className="max-h-14 max-w-[140px] object-contain bg-white" />
              ) : null}
            </div>
            <div className="text-center">
              {meta.businessName ? (
                <div className="text-base font-extrabold leading-snug text-textPrimary sm:text-lg">
                  {meta.businessName}
                </div>
              ) : null}
              <div className="mt-1 text-base font-extrabold text-textPrimary sm:text-lg">{displayTitle}</div>
            </div>
            <div className="text-right text-xs font-semibold leading-relaxed text-textSecondary">
              {addressLine ? <div className="max-w-[220px] sm:ml-auto">{addressLine}</div> : null}
              {phoneLine ? <div>{phoneLine}</div> : null}
              {meta.dateRange ? <div>{meta.dateRange}</div> : null}
              <div>
                {t('Generated')}: {meta.generatedAt}
              </div>
            </div>
          </div>
          {headerStats?.length ? (
            <div className="mt-4">
              <ReportStatBoxes stats={headerStats} />
            </div>
          ) : null}
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-5">
          {!hidePreset && onPresetChange && preset ? (
            <SegmentedControl value={preset} onChange={(v) => onPresetChange(v as DateRangePreset)} options={presetOptions} />
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            {preset === 'custom' && onFromDate && onToDate ? (
              <>
                <FieldLabel>From</FieldLabel>
                <TextInput type="date" value={fromDate ?? ''} onChange={(e) => onFromDate(e.target.value)} />
                <FieldLabel>To</FieldLabel>
                <TextInput type="date" value={toDate ?? ''} onChange={(e) => onToDate(e.target.value)} />
              </>
            ) : null}
            {onSearch ? (
              <>
                <FieldLabel>Search</FieldLabel>
                <RomanUrduInput
                  value={search ?? ''}
                  onValueChange={onSearch}
                  placeholder={searchPlaceholder ?? 'Search…'}
                />
              </>
            ) : null}
            {children}
            <PrimaryButton type="button" onClick={onLoad} disabled={loading}>
              {loading ? 'Loading…' : hasLoaded ? 'Refresh' : 'Load Report'}
            </PrimaryButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton type="button" onClick={() => void exportReport('pdf')} disabled={!canExport || exporting}>
              Download PDF
            </SecondaryButton>
            <SecondaryButton type="button" onClick={() => void exportReport('excel')} disabled={!canExport || exporting}>
              Download Excel
            </SecondaryButton>
            <SecondaryButton type="button" onClick={() => void exportReport('csv')} disabled={!canExport || exporting}>
              Download CSV
            </SecondaryButton>
            <IconButton
              icon={Printer}
              label={t('Print report')}
              variant="neutral"
              size="md"
              onClick={() => void printReport()}
              disabled={!canExport || exporting}
            >
              Print
            </IconButton>
          </div>
          {error ? <Feedback variant="error">{error}</Feedback> : null}
          {summary}
        </div>
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="app-report-table w-full min-w-[480px] text-start text-sm">
            <thead>
              <tr style={{ backgroundColor: accent }}>
                {displayHeaders.map((h) => (
                  <th key={h} className="px-3 py-2.5 font-semibold text-white">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={headers.length} className="px-3 py-4 text-textMuted">
                    {loading
                      ? t('Loading…')
                      : hasLoaded
                        ? emptyText
                        : t('Load report to see data.')}
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="border-b border-border/70 odd:bg-white even:bg-surface1/40 last:border-0">
                    {row.map((cell, j) => {
                      const numeric =
                        typeof cell === 'number' ||
                        (typeof cell === 'string' && /^-?[\d,.]+$/.test(cell.trim()));
                      return (
                        <td
                          key={j}
                          className={`whitespace-pre-line px-3 py-2.5 align-middle text-textPrimary ${
                            numeric ? 'text-end tabular-nums' : 'text-start'
                          }`}
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {page != null && totalPages != null && onPage && totalPages > 1 ? (
          <div className="flex items-center gap-2 border-t border-border px-3 py-3 text-sm">
            <SecondaryButton type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
              Prev
            </SecondaryButton>
            <span>
              Page {page} of {totalPages}
            </span>
            <SecondaryButton type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
              Next
            </SecondaryButton>
          </div>
        ) : null}
      </Panel>
    </PageShell>
  );
}

function usePaginatedReport<T extends Record<string, unknown>>(
  path: string,
  mapRow: (item: T) => (string | number)[],
  mapHeaders: () => string[],
  options?: { autoLoad?: boolean; emptyMessage?: string },
) {
  const autoLoad = options?.autoLoad !== false;
  const [preset, setPreset] = useState<DateRangePreset>('month');
  const [fromDate, setFromDate] = useState(monthStartInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<(PaginatedResult<T> & { emptyMessage?: string }) | null>(null);
  const [extraParams, setExtraParams] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<PaginatedResult<T> & { emptyMessage?: string }>(path, {
        preset,
        fromDate: preset === 'custom' ? fromDate : undefined,
        toDate: preset === 'custom' ? toDate : undefined,
        page,
        pageSize: 20,
        search: debouncedSearch || undefined,
        ...extraParams,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
      setResult(null);
    } finally {
      setHasLoaded(true);
      setLoading(false);
    }
  }, [path, preset, fromDate, toDate, page, debouncedSearch, extraParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, preset]);

  useEffect(() => {
    if (!autoLoad) return;
    void load();
  }, [autoLoad, load]);

  const headers = mapHeaders();
  const rows = (result?.items ?? []).map(mapRow);

  const fetchAllRows = useCallback(async () => {
    const pageSize = 500;
    let pageNum = 1;
    let totalPages = 1;
    const all: (string | number)[][] = [];
    do {
      const data = await api.fetchReport<PaginatedResult<T>>(path, {
        preset,
        fromDate: preset === 'custom' ? fromDate : undefined,
        toDate: preset === 'custom' ? toDate : undefined,
        page: pageNum,
        pageSize,
        search: debouncedSearch || undefined,
        ...extraParams,
      });
      all.push(...data.items.map(mapRow));
      totalPages = data.totalPages;
      pageNum += 1;
    } while (pageNum <= totalPages);
    return all;
  }, [path, preset, fromDate, toDate, debouncedSearch, extraParams, mapRow]);

  return {
    preset,
    setPreset,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    search,
    setSearch,
    page,
    setPage,
    loading,
    hasLoaded,
    error,
    load,
    headers,
    rows,
    totalPages: result?.totalPages ?? 1,
    setExtraParams,
    emptyMessage: result?.emptyMessage ?? options?.emptyMessage,
    result,
    fetchAllRows,
  };
}

function reportDateRangeLabel(preset: DateRangePreset, fromDate: string, toDate: string): string {
  if (preset === 'custom') return `${fromDate} – ${toDate}`;
  const labels: Record<DateRangePreset, string> = {
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    year: 'This Year',
    lifetime: 'Lifetime',
    custom: `${fromDate} – ${toDate}`,
  };
  return labels[preset] ?? preset;
}

function bindPaginatedReport(
  r: ReturnType<typeof usePaginatedReport>,
  overrides: Partial<ReportShellProps> = {},
): ReportShellProps {
  return {
    preset: r.preset,
    onPresetChange: r.setPreset,
    fromDate: r.fromDate,
    toDate: r.toDate,
    onFromDate: r.setFromDate,
    onToDate: r.setToDate,
    search: r.search,
    onSearch: r.setSearch,
    page: r.page,
    totalPages: r.totalPages,
    onPage: r.setPage,
    loading: r.loading,
    hasLoaded: r.hasLoaded,
    emptyMessage: r.emptyMessage,
    error: r.error,
    onLoad: () => void r.load(),
    headers: r.headers,
    rows: r.rows,
    title: '',
    exportMeta: { dateRange: reportDateRangeLabel(r.preset, r.fromDate, r.toDate) },
    ...overrides,
  };
}

// ─── Sales reports ───────────────────────────────────────────────────────────

export function SalesRangeReportPage() {
  const r = usePaginatedReport<{
    date: string;
    invoiceNumber: string;
    customerName: string | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentMethod: string;
    itemsSummary?: string;
    lineItems?: Array<{ name: string; quantity: number; rate: number; discount: number; total: number }>;
  }>(
    '/sales/range',
    (i) => {
      const detail =
        i.lineItems && i.lineItems.length
          ? i.lineItems
              .map((li) => `${li.name} ×${li.quantity} @ ${formatMoney(li.rate)}${li.discount > 0 ? ` (−${formatMoney(li.discount)})` : ''} = ${formatMoney(li.total)}`)
              .join('\n')
          : i.itemsSummary || '—';
      return [
        formatDate(i.date),
        i.invoiceNumber,
        i.customerName ?? 'Walk-in',
        detail,
        formatMoney(i.totalAmount),
        formatMoney(i.paidAmount),
        formatMoney(i.remainingAmount),
        i.paymentMethod,
      ];
    },
    () => ['Date', 'Invoice', 'Customer', 'Items sold', 'Total', 'Paid', 'Remaining', 'Method'],
  );
  return (
    <ReportShell
      {...bindPaginatedReport(r, {
        title: 'Sales — Date Range',
        subtitle: 'Complete invoice lines — what was sold in the period',
        searchPlaceholder: 'Invoice or customer…',
      })}
    />
  );
}

export function ProductProfitReportPage() {
  const r = usePaginatedReport<{ name: string; sku: string; categoryName: string | null; quantitySold: number; revenue: number; costOfGoodsSold: number; grossProfit: number }>(
    '/sales/product-profit',
    (i) => [i.name, i.sku, i.categoryName ?? '—', i.quantitySold, formatMoney(i.revenue), formatMoney(i.costOfGoodsSold), formatMoney(i.grossProfit)],
    () => ['Product', 'SKU', 'Category', 'Qty', 'Revenue', 'COGS', 'Gross Profit'],
  );
  return (
    <ReportShell
      {...bindPaginatedReport(r, {
        title: 'Product-wise Profit',
        subtitle: 'Includes exchanges; returns remove only the returned product margin from profit',
      })}
    />
  );
}

type BestSellingRow = {
  srNo: number;
  name: string;
  quantitySold: number;
  stockRemaining: number;
  revenue: number;
  profit: number;
};

type BestSellingSort =
  | 'sold_desc'
  | 'sold_asc'
  | 'name_asc'
  | 'name_desc'
  | 'stock_desc'
  | 'stock_asc'
  | 'revenue_desc'
  | 'profit_desc';

type BestSellingSummary = {
  productCount: number;
  totalSoldQty: number;
  totalRevenue: number;
  totalProfit: number;
  minSoldQty: number | null;
  maxSoldQty: number | null;
  sortBy?: BestSellingSort;
};

type QtyFilterMode = 'none' | 'min' | 'max';

const BEST_SELLING_SORT_OPTIONS: { value: BestSellingSort; label: string }[] = [
  { value: 'sold_desc', label: 'Most to least (sold qty)' },
  { value: 'sold_asc', label: 'Least to most (sold qty)' },
  { value: 'name_asc', label: 'A to Z (name)' },
  { value: 'name_desc', label: 'Z to A (name)' },
  { value: 'stock_desc', label: 'Stock high to low' },
  { value: 'stock_asc', label: 'Stock low to high' },
  { value: 'revenue_desc', label: 'Revenue high to low' },
  { value: 'profit_desc', label: 'Profit high to low' },
];

export function BestSellingProductsReportPage() {
  const { t } = useLanguage();
  const r = usePaginatedReport<BestSellingRow>(
    '/sales/best-selling',
    (i) => [
      i.srNo,
      i.name,
      i.quantitySold,
      i.stockRemaining,
      formatMoney(i.revenue),
      formatMoney(i.profit),
    ],
    () => ['Sr No', 'Product Name', 'Sold Qty', 'Stock Remaining', 'Revenue', 'Profit'],
  );
  const [qtyFilterMode, setQtyFilterMode] = useState<QtyFilterMode>('none');
  const [qtyFilterValue, setQtyFilterValue] = useState('');
  const [sortBy, setSortBy] = useState<BestSellingSort>('sold_desc');
  const summary = (r.result as { summary?: BestSellingSummary } | null)?.summary;

  useEffect(() => {
    const next: Record<string, string> = { sortBy };
    if (qtyFilterMode !== 'none') {
      const n = Math.max(0, Math.floor(Number(qtyFilterValue) || 0));
      if (qtyFilterMode === 'min') next.minSoldQty = String(n);
      if (qtyFilterMode === 'max') next.maxSoldQty = String(n);
    }
    r.setExtraParams(next);
    r.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when filters change
  }, [qtyFilterMode, qtyFilterValue, sortBy]);

  const headerStats = summary
    ? [
        { label: 'Products', value: String(summary.productCount) },
        { label: 'Sold Qty', value: String(summary.totalSoldQty) },
        { label: 'Revenue', value: `Rs ${formatMoney(summary.totalRevenue)}` },
        { label: 'Profit', value: `Rs ${formatMoney(summary.totalProfit)}`, tone: 'success' as const },
      ]
    : undefined;

  return (
    <ReportShell
      {...bindPaginatedReport(r, {
        title: 'Best Selling Products',
        subtitle: 'Product-wise sales overview — choose sort and min/max sold qty filter',
        searchPlaceholder: 'Product name or code…',
        headerStats,
      })}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <FieldLabel>Sort by</FieldLabel>
          <select
            className="min-w-[11rem] rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as BestSellingSort)}
          >
            {BEST_SELLING_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.label)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Sold qty filter</FieldLabel>
          <select
            className="min-w-[9rem] rounded-lg border border-border bg-surface2 px-3 py-2 text-sm"
            value={qtyFilterMode}
            onChange={(e) => {
              const mode = e.target.value as QtyFilterMode;
              setQtyFilterMode(mode);
              if (mode !== 'none' && qtyFilterValue.trim() === '') setQtyFilterValue('1');
            }}
          >
            <option value="none">{t('No qty filter')}</option>
            <option value="min">{t('Min sold qty')}</option>
            <option value="max">{t('Max sold qty')}</option>
          </select>
        </div>
        {qtyFilterMode !== 'none' ? (
          <div>
            <FieldLabel>{qtyFilterMode === 'min' ? 'Min value' : 'Max value'}</FieldLabel>
            <TextInput
              type="number"
              min={0}
              step={1}
              className="w-28"
              value={qtyFilterValue}
              onChange={(e) => setQtyFilterValue(e.target.value)}
              title={
                qtyFilterMode === 'min'
                  ? t('Show products sold at least this many times')
                  : t('Show products sold at most this many times (leave empty for all)')
              }
            />
          </div>
        ) : null}
      </div>
    </ReportShell>
  );
}

export function CategoryProfitReportPage() {
  const r = usePaginatedReport<{ categoryName: string; quantitySold: number; revenue: number; costOfGoodsSold: number; grossProfit: number }>(
    '/sales/category-profit',
    (i) => [i.categoryName, i.quantitySold, formatMoney(i.revenue), formatMoney(i.costOfGoodsSold), formatMoney(i.grossProfit)],
    () => ['Category', 'Qty', 'Revenue', 'COGS', 'Gross Profit'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Category-wise Profit' })} />;
}

export function InvoiceProfitReportPage() {
  const r = usePaginatedReport<{ date: string; invoiceNumber: string; customerName: string | null; netSales: number; costOfGoodsSold: number; grossProfit: number }>(
    '/sales/invoice-profit',
    (i) => [formatDate(i.date), i.invoiceNumber, i.customerName ?? 'Walk-in', formatMoney(i.netSales), formatMoney(i.costOfGoodsSold), formatMoney(i.grossProfit)],
    () => ['Date', 'Invoice', 'Customer', 'Net Sales', 'COGS', 'Gross Profit'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Invoice-wise Profit', subtitle: 'Adjusted for returns and linked exchanges on each invoice' })} />;
}

export function UdhaarSalesReportPage() {
  const r = usePaginatedReport<{ date: string; invoiceNumber: string; customerName: string | null; totalAmount: number; udhaarAmount: number }>(
    '/sales/udhaar',
    (i) => [formatDate(i.date), i.invoiceNumber, i.customerName ?? '—', formatMoney(i.totalAmount), formatMoney(i.udhaarAmount)],
    () => ['Date', 'Invoice', 'Customer', 'Total', 'Udhaar'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Udhaar Sales' })} />;
}

export function PaymentMethodReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>('month');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = ['Method', 'Invoices', 'Total', 'Paid'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<Array<{ paymentMethod: string; invoiceCount: number; totalAmount: number; paidAmount: number }>>('/sales/payment-methods', { preset });
      setRows(data.map((d) => [d.paymentMethod, d.invoiceCount, formatMoney(d.totalAmount), formatMoney(d.paidAmount)]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ReportShell title="Payment Method Breakdown" headers={headers} rows={rows} loading={loading} error={error} onLoad={() => void load()} preset={preset} onPresetChange={setPreset} />
  );
}

export function ReturnsExchangesReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>('month');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<{ saleReturns: number; netSales: number; grossProfit: number; netProfit: number } | null>(null);
  const headers = ['Type', 'Date', 'Invoice', 'Returned', 'New sale', 'Net / refund', 'Note'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<{
        returns: PaginatedResult<{
          date: string;
          invoiceNumber: string;
          totalAmount: number;
          refundAmount: number;
          isExchange: boolean;
        }>;
        exchanges: Array<{
          date: string;
          invoiceNumber: string;
          returnTotal: number;
          newSaleTotal: number;
          netAmount: number;
        }>;
        summary?: { saleReturns: number; netSales: number; grossProfit: number; netProfit: number };
      }>('/sales/returns-exchanges', { preset, page: 1, pageSize: 100 });
      const returnRows = data.returns.items
        .filter((r) => !r.isExchange)
        .map((r) => [
          'Return',
          formatDate(r.date),
          r.invoiceNumber,
          formatMoney(r.totalAmount),
          '—',
          formatMoney(r.refundAmount),
          'Refund',
        ]);
      const exchangeRows = data.exchanges.map((e) => [
        'Exchange',
        formatDate(e.date),
        e.invoiceNumber,
        formatMoney(e.returnTotal),
        formatMoney(e.newSaleTotal),
        formatMoney(e.netAmount),
        e.netAmount >= 0 ? 'Customer pays' : 'Refund',
      ]);
      setRows([...returnRows, ...exchangeRows]);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
      setSummary(null);
    } finally {
      setHasLoaded(true);
      setLoading(false);
    }
  }

  const headerStats = summary
    ? [
        { label: 'Returns (period)', value: `Rs ${formatMoney(summary.saleReturns)}` },
        { label: 'Net sales', value: `Rs ${formatMoney(summary.netSales)}` },
        { label: 'Gross profit', value: `Rs ${formatMoney(summary.grossProfit)}` },
        { label: 'Net profit', value: `Rs ${formatMoney(summary.netProfit)}` },
      ]
    : undefined;

  return (
    <ReportShell
      title="Returns & Exchanges"
      subtitle="Returns reduce period sales; exchanges add new sale and profit after deducting returned value"
      headers={headers}
      rows={rows}
      loading={loading}
      hasLoaded={hasLoaded}
      error={error}
      onLoad={() => void load()}
      preset={preset}
      onPresetChange={setPreset}
      headerStats={headerStats}
    />
  );
}

export function DailySalesReportPage() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const initialPreset = (searchParams.get('preset') as DateRangePreset) || 'today';
  const [preset, setPreset] = useState<DateRangePreset>(
    ['today', 'week', 'month', 'year', 'lifetime', 'custom'].includes(initialPreset) ? initialPreset : 'today',
  );
  const [fromDate, setFromDate] = useState(monthStartInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [summary, setSummary] = useState<{
    fullSale: number;
    cash: number;
    ePayment: number;
    profit: number;
    netProfit?: number;
    discount: number;
    returns?: number;
  } | null>(null);
  const [rangeLabel, setRangeLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const headers = ['Date', 'Type', 'Product', 'Qty', 'Discount', 'Amount'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<{
        range: { label: string };
        items: Array<{
          date: string;
          kind: 'SALE' | 'RETURN' | 'EXCHANGE';
          productName: string;
          quantity: number;
          discount: number;
          amount: number;
        }>;
        summary: {
          fullSale: number;
          cash: number;
          ePayment: number;
          profit: number;
          netProfit?: number;
          discount: number;
          returns?: number;
        };
      }>('/sales/daily-detail', {
        fromDate: preset === 'custom' ? fromDate : undefined,
        toDate: preset === 'custom' ? toDate : undefined,
        preset,
      });

      let lastDate = '';
      setRows(
        data.items.map((row) => {
          const showDate = row.date !== lastDate;
          lastDate = row.date;
          const typeLabel =
            row.kind === 'RETURN'
              ? t('Return')
              : row.kind === 'EXCHANGE'
                ? t('Exchange')
                : t('Sale');
          return [
            showDate ? formatDate(`${row.date}T12:00:00`) : '',
            typeLabel,
            row.productName,
            row.quantity,
            formatMoney(row.discount),
            formatMoney(row.amount),
          ];
        }),
      );
      setSummary(data.summary);
      setRangeLabel(data.range?.label || reportDateRangeLabel(preset, fromDate, toDate));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
      setSummary(null);
    } finally {
      setHasLoaded(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when period changes
  }, [preset, fromDate, toDate]);

  const headerStats = summary
    ? [
        { label: 'Net sale', value: `Rs ${formatMoney(summary.fullSale)}` },
        { label: 'Returns', value: `Rs ${formatMoney(summary.returns ?? 0)}` },
        { label: 'Cash', value: `Rs ${formatMoney(summary.cash)}` },
        { label: 'E-payment', value: `Rs ${formatMoney(summary.ePayment)}` },
        { label: 'Gross profit', value: `Rs ${formatMoney(summary.profit)}` },
        { label: 'Net profit', value: `Rs ${formatMoney(summary.netProfit ?? summary.profit)}` },
        { label: 'Discount', value: `Rs ${formatMoney(summary.discount)}` },
      ]
    : undefined;

  return (
    <ReportShell
      title="Sales report"
      subtitle="Sales, returns, and exchanges by day — returns reduce today's sale; profit loses returned margin only"
      headers={headers}
      rows={rows}
      loading={loading}
      hasLoaded={hasLoaded}
      error={error}
      onLoad={() => void load()}
      preset={preset}
      onPresetChange={setPreset}
      fromDate={fromDate}
      toDate={toDate}
      onFromDate={setFromDate}
      onToDate={setToDate}
      headerStats={headerStats}
      exportMeta={{ dateRange: rangeLabel || reportDateRangeLabel(preset, fromDate, toDate) }}
      emptyMessage="No sales, returns, or exchanges in this period."
    />
  );
}

// ─── Stock reports ───────────────────────────────────────────────────────────

export function CurrentStockReportPage() {
  type StockItem = {
    name: string;
    sku: string;
    categoryName: string | null;
    currentStock: number;
    costValue: number;
    sellingValue: number;
  };
  type StockResult = PaginatedResult<StockItem> & {
    summary?: {
      productCount: number;
      fullStockCount: number;
      totalCostValue: number;
      totalSellingValue: number;
    };
  };

  const mapRow = (i: StockItem) =>
    [i.name, i.sku, i.categoryName ?? '—', i.currentStock, formatMoney(i.costValue), formatMoney(i.sellingValue)] as (
      | string
      | number
    )[];
  const r = usePaginatedReport<StockItem>(
    '/stock/current',
    mapRow,
    () => ['Product', 'SKU', 'Category', 'Stock', 'Cost Value', 'Selling Value'],
  );
  const summary = (r.result as StockResult | null)?.summary;
  const headerStats = summary
    ? [
        { label: 'Products', value: String(summary.productCount) },
        { label: 'Full stock count', value: String(summary.fullStockCount) },
        { label: 'Total cost (purchase)', value: `Rs ${formatMoney(summary.totalCostValue)}` },
        { label: 'Estimated sale value', value: `Rs ${formatMoney(summary.totalSellingValue)}` },
      ]
    : undefined;

  return (
    <ReportShell
      {...bindPaginatedReport(r, {
        title: 'Current Stock',
        hidePreset: true,
        headerStats,
        resolveExportRows: r.fetchAllRows,
      })}
    />
  );
}

export function LowStockReportPage() {
  type LowItem = {
    name: string;
    sku: string;
    currentStock: number;
    variantLabel?: string | null;
    lowStockLimit?: number;
    qtyToRestock?: number;
    estimatedPurchaseValue?: number;
  };
  type LowResult = PaginatedResult<LowItem> & {
    summary?: { lowStockCount: number; estimatedPurchaseValue: number; restockLimit: number };
  };

  const mapRow = (i: LowItem) =>
    [
      i.variantLabel ? `${i.name} — ${i.variantLabel}` : i.name,
      i.sku,
      i.currentStock,
      i.lowStockLimit ?? '—',
      i.qtyToRestock ?? '—',
      formatMoney(i.estimatedPurchaseValue ?? 0),
    ] as (string | number)[];

  const r = usePaginatedReport<LowItem>(
    '/stock/low',
    mapRow,
    () => ['Product', 'SKU', 'Stock', 'Limit', 'Qty to buy', 'Est. purchase'],
    { emptyMessage: 'Nothing is low stock from your set limit.' },
  );
  const summary = (r.result as LowResult | null)?.summary;
  const headerStats = summary
    ? [
        { label: 'Low stock products', value: String(summary.lowStockCount) },
        {
          label: `Est. purchase (to limit ${summary.restockLimit})`,
          value: `Rs ${formatMoney(summary.estimatedPurchaseValue)}`,
        },
      ]
    : undefined;

  return (
    <ReportShell
      {...bindPaginatedReport(r, {
        title: 'Low Stock',
        subtitle: 'Products / variants at or below the low-stock limit (includes out of stock)',
        hidePreset: true,
        headerStats,
        resolveExportRows: r.fetchAllRows,
      })}
    />
  );
}

export function OutOfStockReportPage() {
  const r = usePaginatedReport<{
    name: string;
    sku: string;
    currentStock: number;
    variantLabel?: string | null;
  }>(
    '/stock/out',
    (i) => [i.variantLabel ? `${i.name} — ${i.variantLabel}` : i.name, i.sku, i.currentStock],
    () => ['Product', 'SKU', 'Stock'],
    { emptyMessage: 'Nothing is out of stock.' },
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Out of Stock' })} />;
}

export function DamagedStockReportPage() {
  const r = usePaginatedReport<{ date: string; productName: string; sku: string; quantity: number; note: string | null }>(
    '/stock/damaged',
    (i) => [formatDate(i.date), i.productName, i.sku, i.quantity, i.note ?? ''],
    () => ['Date', 'Product', 'SKU', 'Qty', 'Note'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Damaged Stock' })} />;
}

export function StockMovementsReportPage() {
  const r = usePaginatedReport<{ date: string; type: string; productName: string; sku: string; quantity: number }>(
    '/stock/movements',
    (i) => [formatDate(i.date), i.type, i.productName, i.sku, i.quantity],
    () => ['Date', 'Type', 'Product', 'SKU', 'Qty'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Stock Movements' })} />;
}

export function StockValuationReportPage() {
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = ['Metric', 'Value'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<{ stockCostValue: number; expectedSellingValue: number; potentialMarginOnUnsoldInventory: number; note: string }>('/stock/valuation');
      setNote(data.note);
      setRows([
        ['Stock Cost Value', formatMoney(data.stockCostValue)],
        ['Expected Selling Value', formatMoney(data.expectedSellingValue)],
        ['Potential Margin (unsold inventory)', formatMoney(data.potentialMarginOnUnsoldInventory)],
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ReportShell
      title="Stock Valuation"
      subtitle={note || 'Cost value and expected selling value — not included in net profit'}
      headers={headers}
      rows={rows}
      loading={loading}
      error={error}
      onLoad={() => void load()}
    />
  );
}

// ─── Purchase / Supplier reports ─────────────────────────────────────────────

export function PurchasesReportPage() {
  const [period, setPeriod] = useState<'today' | 'month' | 'year' | 'lifetime'>('month');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState<{ totalAmount: number; paidAmount: number; remainingAmount: number } | null>(
    null,
  );
  const headers = ['Date', 'Supplier', 'Products purchased', 'Total', 'Paid', 'Remaining'];

  type PurchaseRow = {
    date: string;
    supplierName: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    itemsSummary?: string;
    lineItems?: Array<{
      name: string;
      sku: string;
      quantity: number;
      purchasePrice: number;
      discount: number;
      lineTotal: number;
    }>;
  };

  function mapPurchaseRows(items: PurchaseRow[]) {
    return items.map((p) => {
      const detail =
        p.lineItems && p.lineItems.length
          ? p.lineItems
              .map(
                (li) =>
                  `${li.name} ×${li.quantity} @ ${formatMoney(li.purchasePrice)}${
                    li.discount > 0 ? ` (−${formatMoney(li.discount)})` : ''
                  } = ${formatMoney(li.lineTotal)}`,
              )
              .join('\n')
          : p.itemsSummary || '—';
      return [
        formatDate(p.date),
        p.supplierName,
        detail,
        formatMoney(p.totalAmount),
        formatMoney(p.paidAmount),
        formatMoney(p.remainingAmount),
      ] as (string | number)[];
    });
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<
        PaginatedResult<PurchaseRow> & {
          summary?: { totalAmount: number; paidAmount: number; remainingAmount: number };
        }
      >('/purchases', { period, page, pageSize: 20 });
      setRows(mapPurchaseRows(data.items));
      setTotalPages(data.totalPages);
      setSummary(data.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
      setSummary(null);
    } finally {
      setHasLoaded(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [period]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, page]);

  const headerStats = summary
    ? [
        { label: 'Paid amount', value: `Rs ${formatMoney(summary.paidAmount)}` },
        { label: 'Remain to pay', value: `Rs ${formatMoney(summary.remainingAmount)}` },
        { label: 'Purchase total', value: `Rs ${formatMoney(summary.totalAmount)}` },
      ]
    : undefined;

  return (
    <ReportShell
      title="Purchases"
      headers={headers}
      rows={rows}
      loading={loading}
      hasLoaded={hasLoaded}
      error={error}
      onLoad={() => void load()}
      page={page}
      totalPages={totalPages}
      onPage={setPage}
      hidePreset
      headerStats={headerStats}
      resolveExportRows={async () => {
        const pageSize = 500;
        let pageNum = 1;
        let pages = 1;
        const all: (string | number)[][] = [];
        do {
          const data = await api.fetchReport<PaginatedResult<PurchaseRow>>('/purchases', {
            period,
            page: pageNum,
            pageSize,
          });
          all.push(...mapPurchaseRows(data.items));
          pages = data.totalPages;
          pageNum += 1;
        } while (pageNum <= pages);
        return all;
      }}
    >
      <FieldLabel>Period</FieldLabel>
      <select
        className="rounded border border-border px-2 py-1 text-sm"
        value={period}
        onChange={(e) => setPeriod(e.target.value as typeof period)}
      >
        <option value="today">Today</option>
        <option value="month">Month</option>
        <option value="year">Year</option>
        <option value="lifetime">Lifetime</option>
      </select>
    </ReportShell>
  );
}

export function SupplierOutstandingReportPage() {
  const r = usePaginatedReport<{ name: string; phone: string; payable: number }>(
    '/suppliers/outstanding',
    (i) => [i.name, i.phone, formatMoney(i.payable)],
    () => ['Supplier', 'Phone', 'Payable'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Supplier Outstanding' })} />;
}

export function SupplierPaymentsReportPage() {
  const r = usePaginatedReport<{ date: string; supplierName: string; amount: number; paymentMethod: string }>(
    '/suppliers/payments',
    (i) => [formatDate(i.date), i.supplierName, formatMoney(i.amount), i.paymentMethod],
    () => ['Date', 'Supplier', 'Amount', 'Method'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Supplier Payments' })} />;
}

export function SupplierPurchasesReportPage() {
  const r = usePaginatedReport<{ date: string; supplierName: string; totalAmount: number }>(
    '/suppliers/purchases',
    (i) => [formatDate(i.date), i.supplierName, formatMoney(i.totalAmount)],
    () => ['Date', 'Supplier', 'Amount'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Supplier Purchases' })} />;
}

export function PurchaseReturnsReportPage() {
  const r = usePaginatedReport<{ date: string; supplierName: string; totalAmount: number }>(
    '/purchases/returns',
    (i) => [formatDate(i.date), i.supplierName, formatMoney(i.totalAmount)],
    () => ['Date', 'Supplier', 'Amount'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Purchase Returns' })} />;
}

// ─── Customer reports ────────────────────────────────────────────────────────

export function CustomerBalancesReportPage() {
  const r = usePaginatedReport<{ name: string; phone: string; balance: number }>(
    '/customers/balances',
    (i) => [i.name, i.phone, formatMoney(i.balance)],
    () => ['Customer', 'Phone', 'Balance'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Customer Balances' })} />;
}

export function CustomerPaymentsReportPage() {
  const r = usePaginatedReport<{ date: string; customerName: string; amount: number; paymentMethod: string }>(
    '/customers/payments',
    (i) => [formatDate(i.date), i.customerName, formatMoney(i.amount), i.paymentMethod],
    () => ['Date', 'Customer', 'Amount', 'Method'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Customer Payments' })} />;
}

export function CustomerPurchasesReportPage() {
  const r = usePaginatedReport<{ date: string; invoiceNumber: string; customerName: string | null; totalAmount: number; remainingAmount: number }>(
    '/customers/purchases',
    (i) => [formatDate(i.date), i.invoiceNumber, i.customerName ?? '—', formatMoney(i.totalAmount), formatMoney(i.remainingAmount)],
    () => ['Date', 'Invoice', 'Customer', 'Total', 'Udhaar'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Customer Purchases' })} />;
}

// ─── Expense reports ─────────────────────────────────────────────────────────

export function ExpensesRangeReportPage() {
  const r = usePaginatedReport<{ date: string; categoryName: string; description: string; amount: number }>(
    '/expenses/range',
    (i) => [formatDate(i.date), i.categoryName, i.description, formatMoney(i.amount)],
    () => ['Date', 'Category', 'Description', 'Amount'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Expenses — Date Range' })} />;
}

export function ExpensesDailyReportPage() {
  const [fromDate, setFromDate] = useState(monthStartInputValue());
  const [toDate, setToDate] = useState(todayInputValue());
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = ['Date', 'Count', 'Total'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<PaginatedResult<{ date: string; expenseCount: number; totalAmount: number }>>('/expenses/daily', { fromDate, toDate, page: 1, pageSize: 100 });
      setRows(data.items.map((d) => [d.date, d.expenseCount, formatMoney(d.totalAmount)]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ReportShell title="Daily Expenses" headers={headers} rows={rows} loading={loading} error={error} onLoad={() => void load()} preset="custom" fromDate={fromDate} toDate={toDate} onFromDate={setFromDate} onToDate={setToDate} />
  );
}

export function ExpensesByCategoryReportPage() {
  const [preset, setPreset] = useState<DateRangePreset>('month');
  const [rows, setRows] = useState<(string | number)[][]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const headers = ['Category', 'Count', 'Total'];

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchReport<Array<{ categoryName: string; expenseCount: number; totalAmount: number }>>('/expenses/by-category', { preset });
      setRows(data.map((d) => [d.categoryName, d.expenseCount, formatMoney(d.totalAmount)]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  return <ReportShell title="Expenses by Category" headers={headers} rows={rows} loading={loading} error={error} onLoad={() => void load()} preset={preset} onPresetChange={setPreset} />;
}

export function OtherIncomeReportPage() {
  const r = usePaginatedReport<{ date: string; categoryName: string; description: string; amount: number }>(
    '/other-income',
    (i) => [formatDate(i.date), i.categoryName, i.description, formatMoney(i.amount)],
    () => ['Date', 'Category', 'Description', 'Amount'],
  );
  return <ReportShell {...bindPaginatedReport(r, { title: 'Other Income' })} />;
}
