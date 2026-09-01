import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChevronDown,
  ChevronUp,
  HandCoins,
  Package,
  Plus,
  Receipt,
  ShoppingCart,
  Wallet,
} from 'lucide-react';
import {
  ClickableMetricTile,
  Feedback,
  LoadingState,
  PageShell,
  Panel,
  PrimaryButton,
} from '../components/ui/PageShell';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { api, type DashboardPayload, type DateRangePreset } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'lifetime', label: 'Lifetime' },
  { value: 'custom', label: 'Custom' },
];

const QUICK_ACTIONS = [
  { label: 'New Sale', to: '/sales/new', icon: ShoppingCart },
  { label: 'Add Product', to: '/products/add', icon: Plus },
  { label: 'Add Purchase', to: '/purchases/new', icon: Package },
  { label: 'Add Expense', to: '/finance/expenses/new', icon: Wallet },
  { label: 'Receive Payment', to: '/customers/pay', icon: HandCoins },
  { label: 'Pay Supplier', to: '/purchases/pay', icon: Receipt },
] as const;

const PAYMENT_COLORS: Record<string, string> = {
  CASH: '#1E5C4A',
  CARD: '#1A6B7A',
  EASYPAISA: '#C99618',
  JAZZCASH: '#9A5B00',
  BANK_TRANSFER: '#5A5A5A',
  UDHAAR: '#A32D2D',
};

function paymentLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: 'Cash',
    CARD: 'Card',
    EASYPAISA: 'Easypaisa',
    JAZZCASH: 'JazzCash',
    BANK_TRANSFER: 'Bank Transfer',
    UDHAAR: 'Udhaar',
  };
  return labels[method] ?? method;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function salesLabel(preset: DateRangePreset): string {
  if (preset === 'today') return "Today's Sales";
  if (preset === 'week') return 'Week Sales';
  if (preset === 'month') return 'Month Sales';
  if (preset === 'year') return 'Year Sales';
  return 'Net Sales';
}

export function DashboardPage() {
  const [preset, setPreset] = useState<DateRangePreset>('today');
  const [fromDate, setFromDate] = useState(todayInput());
  const [toDate, setToDate] = useState(todayInput());
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getShopDashboard({
        preset,
        fromDate: preset === 'custom' ? fromDate : undefined,
        toDate: preset === 'custom' ? toDate : undefined,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [preset, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleSalesChanged = () => {
      void load();
    };
    window.addEventListener('sales-changed', handleSalesChanged);
    return () => {
      window.removeEventListener('sales-changed', handleSalesChanged);
    };
  }, [load]);

  const dash = data;
  const comparisons = dash?.comparisons ?? null;

  const paymentChartData = useMemo(() => {
    if (!dash?.paymentMethodBreakdown.length) return [];
    return dash.paymentMethodBreakdown
      .filter((row) => row.totalAmount > 0)
      .map((row) => ({
        name: paymentLabel(row.paymentMethod),
        value: row.totalAmount,
        method: row.paymentMethod,
      }));
  }, [dash?.paymentMethodBreakdown]);

  return (
    <div className="dashboard-page">
      <section className="dashboard-quick-actions" aria-label="Quick actions">
        <div className="dashboard-quick-actions-inner">
          <div className="dashboard-quick-actions-header">
            <h1 className="dashboard-quick-actions-title">Quick Actions</h1>
            <p className="dashboard-quick-actions-subtitle">Shop overview — tap any figure to open its report</p>
          </div>
          <div className="dashboard-quick-actions-grid">
            {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            const isNewSale = a.to === '/sales/new';
            return (
              <Link
                key={a.to}
                to={a.to}
                className={isNewSale ? 'dashboard-quick-action-btn is-primary-action' : 'dashboard-quick-action-btn'}
              >
                <Icon className={isNewSale ? 'h-5 w-5 shrink-0' : 'h-4 w-4 shrink-0'} aria-hidden />
                {a.label}
              </Link>
            );
          })}
          </div>
        </div>
      </section>

      <PageShell wide>
      {error ? <Feedback variant="error" className="mb-3">{error}</Feedback> : null}

      {/* Design plan: frontend/src/pages/dashboard-design-plan.md */}
      <section className="dashboard-command" aria-label="Shop performance summary">
        <div className="dashboard-command__head">
          <div className="min-w-0 flex-1">
            <p className="dashboard-command__period-label">Period</p>
            <SegmentedControl
              value={preset}
              onChange={(v) => setPreset(v as DateRangePreset)}
              options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
              className="dashboard-segmented"
            />
            {dash ? (
              <p className="dashboard-command__range">Showing: {dash.range.label}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {preset === 'custom' ? (
              <div className="dashboard-command__custom-dates">
                <label>
                  From
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </label>
                <label>
                  To
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </label>
                <PrimaryButton type="button" onClick={() => void load()} disabled={loading}>
                  Apply
                </PrimaryButton>
              </div>
            ) : null}
            {loading ? <LoadingState label="Updating…" className="dashboard-command__loading" /> : null}
          </div>
        </div>

        {loading && !dash ? (
          <div className="dashboard-skeleton-hero" aria-hidden>
            <div className="dashboard-skeleton-hero__primary" />
            <div className="dashboard-skeleton-hero__secondary">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-16 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="dashboard-command__kpis">
            <ClickableMetricTile
              label={salesLabel(preset)}
              value={dash ? formatMoney(dash.netSales) : '—'}
              to={`/reports/sales/daily?preset=${preset}`}
              accent="success"
              comparison={comparisons?.netSales}
              size="hero"
              hideLinkHint
            />
            <div className="dashboard-command__secondary">
              <ClickableMetricTile
                label="Net Profit"
                value={dash ? formatMoney(dash.netProfit) : '—'}
                to="/reports/sales/product-profit"
                accent={dash && dash.netProfit >= 0 ? 'success' : 'danger'}
                comparison={comparisons?.netProfit}
                size="gauge"
                hideLinkHint
              />
              <ClickableMetricTile
                label="Customer Outstanding"
                value={dash ? formatMoney(dash.customerOutstanding) : '—'}
                to="/reports/customers/balances"
                accent="success"
                size="gauge"
                hideLinkHint
              />
              <ClickableMetricTile
                label="Supplier Outstanding"
                value={dash ? formatMoney(dash.supplierOutstanding) : '—'}
                to="/reports/suppliers/outstanding"
                accent="danger"
                size="gauge"
                hideLinkHint
              />
              <ClickableMetricTile
                label="Low Stock"
                value={dash ? String(dash.lowStockCount) : '—'}
                to="/reports/stock/low"
                accent="warning"
                size="gauge"
                hideLinkHint
              />
            </div>
          </div>
        )}
      </section>

      {dash?.salesCollectionBreakdown ? (
        <section className="dashboard-collection" aria-label="Sales collection breakdown">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="dashboard-collection__title">How sales were collected</p>
              <p className="dashboard-collection__meta">{dash.range.label}</p>
            </div>
            <Link to={`/reports/sales/daily?preset=${preset}`} className="dashboard-collection__link">
              Open full breakdown
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="dashboard-stat-chip dashboard-stat-chip--success">
              <p className="dashboard-stat-chip__label">Cash</p>
              <p className="dashboard-stat-chip__value">Rs {formatMoney(dash.salesCollectionBreakdown.cash)}</p>
            </div>
            <div className="dashboard-stat-chip dashboard-stat-chip--accent">
              <p className="dashboard-stat-chip__label">E-payment</p>
              <p className="dashboard-stat-chip__value">Rs {formatMoney(dash.salesCollectionBreakdown.ePayment)}</p>
            </div>
            <div className="dashboard-stat-chip dashboard-stat-chip--warning">
              <p className="dashboard-stat-chip__label">Still on udhaar</p>
              <p className="dashboard-stat-chip__value">Rs {formatMoney(dash.salesCollectionBreakdown.udhaar)}</p>
            </div>
          </div>
          {dash.salesCollectionBreakdown.byAccount.length > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm">
              {dash.salesCollectionBreakdown.byAccount.map((row) => (
                <li key={row.accountName} className="flex justify-between gap-3 border-b border-border/50 py-1">
                  <span className="dashboard-collection__breakdown-row">{row.accountName}</span>
                  <span className="dashboard-collection__breakdown-amount">Rs {formatMoney(row.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="dashboard-more">
        <button
          type="button"
          className="dashboard-more__toggle"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
        >
          More details
          {moreOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-textMuted" /> : <ChevronDown className="h-4 w-4 shrink-0 text-textMuted" />}
        </button>
        {moreOpen ? (
          <div className="dashboard-more__body">
            <div className="dashboard-detail-grid">
              <ClickableMetricTile label="Gross Sales" value={dash ? formatMoney(dash.grossSales) : '—'} to="/reports/sales/range" comparison={comparisons?.grossSales} size="compact" hideLinkHint />
              <ClickableMetricTile label="Discounts" value={dash ? formatMoney(dash.discounts) : '—'} to="/reports/sales/range" accent="info" size="compact" hideLinkHint />
              <ClickableMetricTile label="Returns" value={dash ? formatMoney(dash.saleReturns) : '—'} to="/reports/sales/returns-exchanges" accent="warning" size="compact" hideLinkHint />
              <ClickableMetricTile label="COGS" value={dash ? formatMoney(dash.costOfGoodsSold) : '—'} to="/reports/sales/product-profit" size="compact" hideLinkHint />
              <ClickableMetricTile label="Gross Profit" value={dash ? formatMoney(dash.grossProfit) : '—'} to="/reports/sales/product-profit" accent="success" size="compact" hideLinkHint />
              <ClickableMetricTile label="Expenses" value={dash ? formatMoney(dash.expenses) : '—'} to="/reports/expenses/range" accent="warning" comparison={comparisons?.expenses} size="compact" hideLinkHint />
              <ClickableMetricTile label="Other Income" value={dash ? formatMoney(dash.otherIncome) : '—'} to="/reports/other-income" accent="success" size="compact" hideLinkHint />
              <ClickableMetricTile label="Cash Received" value={dash ? formatMoney(dash.cashReceived) : '—'} to="/reports/sales/payment-methods" accent="success" comparison={comparisons?.cashReceived} size="compact" hideLinkHint />
              <ClickableMetricTile label="Udhaar Sales" value={dash ? formatMoney(dash.udhaarSales) : '—'} to="/reports/sales/udhaar" accent="warning" size="compact" hideLinkHint />
              <ClickableMetricTile label="Stock Cost Value" value={dash ? formatMoney(dash.stockCostValue) : '—'} to="/reports/stock/valuation" size="compact" hideLinkHint />
              <ClickableMetricTile
                label="Expected Selling Value"
                value={dash ? formatMoney(dash.expectedSellingValue) : '—'}
                sub="Potential margin on unsold inventory — not actual profit"
                to="/reports/stock/valuation"
                accent="info"
                size="compact"
                hideLinkHint
              />
              <ClickableMetricTile label="Invoices" value={dash ? String(dash.invoiceCount) : '—'} to="/sales/list" comparison={comparisons?.invoiceCount} size="compact" hideLinkHint />
              <ClickableMetricTile label="Out of Stock" value={dash ? String(dash.outOfStockCount) : '—'} to="/reports/stock/out" accent="danger" size="compact" hideLinkHint />
            </div>

            {dash ? (
              <Panel className="dashboard-panel mt-4">
                <p className="dashboard-panel__title">Purchases (separate from sales)</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ClickableMetricTile label="Today" value={formatMoney(dash.purchases.today)} to="/reports/purchases" size="compact" hideLinkHint />
                  <ClickableMetricTile label="This Month" value={formatMoney(dash.purchases.month)} to="/reports/purchases" size="compact" hideLinkHint />
                  <ClickableMetricTile label="This Year" value={formatMoney(dash.purchases.year)} to="/reports/purchases" size="compact" hideLinkHint />
                  <ClickableMetricTile label="Lifetime" value={formatMoney(dash.purchases.lifetime)} to="/reports/purchases" size="compact" hideLinkHint />
                </div>
              </Panel>
            ) : null}

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel className="dashboard-panel">
                <h2 className="dashboard-panel__title">Sales by payment method</h2>
                {paymentChartData.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={paymentChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {paymentChartData.map((entry) => (
                            <Cell key={entry.method} fill={PAYMENT_COLORS[entry.method] ?? '#888888'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatMoney(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 flex flex-wrap gap-4 border-t border-border pt-3 text-sm">
                      <div>
                        <p className="text-xs text-textMuted">Total sales</p>
                        <p className="font-semibold text-textPrimary">Rs {formatMoney(dash?.netSales ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-textMuted">Net profit</p>
                        <p className={`font-semibold ${dash && dash.netProfit >= 0 ? 'text-success' : 'text-danger'}`}>
                          Rs {formatMoney(dash?.netProfit ?? 0)}
                        </p>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-textSecondary">
                      {paymentChartData.map((row) => (
                        <li key={row.method} className="flex justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: PAYMENT_COLORS[row.method] ?? '#888' }}
                            />
                            {row.name}
                          </span>
                          <span>{formatMoney(row.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : loading ? (
                  <LoadingState />
                ) : (
                  <p className="text-sm text-textMuted">No sales in selected period.</p>
                )}
              </Panel>

              <Panel className="dashboard-panel">
                <h2 className="dashboard-panel__title">Sales chart</h2>
                {dash?.salesChart.length ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={dash.salesChart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => formatMoney(v)} labelFormatter={(l) => formatDate(l)} />
                      <Bar dataKey="netSales" fill="var(--fill-accent)" name="Net Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : loading ? (
                  <LoadingState />
                ) : (
                  <p className="text-sm text-textMuted">No sales in selected period.</p>
                )}
              </Panel>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel className="dashboard-panel">
                <h2 className="dashboard-panel__title">Top selling products</h2>
                {dash?.topSellingProducts.length ? (
                  <table className="app-data-table w-full text-left text-sm">
                    <thead>
                      <tr>
                        <th className="py-1 pr-2 font-medium">Product</th>
                        <th className="py-1 pr-2 font-medium">Qty</th>
                        <th className="py-1 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.topSellingProducts.map((p) => (
                        <tr key={p.productId}>
                          <td className="py-1.5 pr-2">{p.name}</td>
                          <td className="py-1.5 pr-2">{p.quantitySold}</td>
                          <td className="py-1.5 text-right">{formatMoney(p.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-textMuted">No sales data.</p>
                )}
              </Panel>

              <Panel className="dashboard-panel">
                <h2 className="dashboard-panel__title">Low stock</h2>
                <p className="mb-2 text-xs text-textMuted">Items at or below the low-stock limit (includes out of stock).</p>
                {dash?.lowStockProducts.length ? (
                  <ul className="space-y-2 text-sm">
                    {dash.lowStockProducts.map((p, idx) => (
                      <li
                        key={`${p.id}-${p.variantLabel ?? 'product'}-${idx}`}
                        className="flex justify-between gap-2 border-b border-border pb-2 last:border-0"
                      >
                        <Link to={`/products/${p.id}`} className="truncate hover:underline">
                          {p.name}
                          {p.variantLabel ? ` — ${p.variantLabel}` : ''}
                        </Link>
                        <span className={`font-medium ${p.currentStock <= 0 ? 'text-danger' : 'text-warning'}`}>
                          {p.currentStock <= 0 ? 'Out of stock' : `${p.currentStock} left`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-success">All stocked up.</p>
                )}
              </Panel>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel className="dashboard-panel">
                <h2 className="dashboard-panel__title">Recent sales</h2>
                {dash?.recentSales.length ? (
                  <ul className="space-y-2 text-sm">
                    {dash.recentSales.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0">
                        <Link to={`/sales/${s.id}`} className="font-medium text-accent hover:underline">
                          {s.invoiceNumber}
                        </Link>
                        <span className="text-success">{formatMoney(s.totalAmount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-textMuted">No recent sales.</p>
                )}
              </Panel>

              <Panel className="dashboard-panel">
                <h2 className="dashboard-panel__title">Recent expenses</h2>
                {dash?.recentExpenses.length ? (
                  <ul className="space-y-2 text-sm">
                    {dash.recentExpenses.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2 border-b border-border pb-2 last:border-0">
                        <span className="truncate">{e.description}</span>
                        <span className="text-warning">{formatMoney(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-textMuted">No recent expenses.</p>
                )}
              </Panel>
            </div>
          </div>
        ) : null}
      </section>
    </PageShell>
    </div>
  );
}
