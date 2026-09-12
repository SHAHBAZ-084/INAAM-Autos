import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { printReturnReceipt } from '../../components/sales/ReturnReceiptPrint';
import { useFormShortcuts } from '../../hooks/useFormShortcuts';
import { BarcodeScanField } from '../products/BarcodeScanPage';
import {
  api,
  type BarcodeLookupResult,
  type BusinessSettings,
  type InvoiceForReturn,
  type Product,
  type ProductCategory,
  type ProductVariant,
  type PurchasePaymentMethod,
  type ReturnCondition,
} from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { shortcutLabel } from '../../lib/shortcuts';
import { useLanguage } from '../../contexts/LanguageContext';
import { Trash2 } from 'lucide-react';
import {
  Feedback,
  FieldLabel,
  GhostButton,
  IconButton,
  PageShell,
  Panel,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '../../components/ui/PageShell';
import { HubCloseButton } from '../../components/ui/HubCloseButton';
import {
  PaymentMethodFields,
  toApiPaymentMethod,
  type SimplePayKind,
} from '../../components/ui/PaymentMethodFields';

const SELECT_CLASS = 'w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm';

type ReturnDraft = {
  invoiceItemId: number;
  quantity: string;
  condition: ReturnCondition;
  maxQty: number;
  label: string;
};

type NewItemDraft = {
  key: string;
  productId: number;
  variantId: number | null;
  name: string;
  variantLabel: string | null;
  rate: number;
  quantity: string;
  stock: number;
};

function lineKey(productId: number, variantId: number | null) {
  return `${productId}:${variantId ?? 'p'}`;
}

function lookupToNewItem(result: BarcodeLookupResult): NewItemDraft {
  const variant = result.variant;
  const stock = variant?.currentStock ?? result.product.currentStock;
  const rate = variant?.salePrice ?? result.product.salePrice;
  return {
    key: lineKey(result.product.id, variant?.id ?? null),
    productId: result.product.id,
    variantId: variant?.id ?? null,
    name: result.product.name,
    variantLabel: variant ? [variant.size, variant.colour].filter(Boolean).join(' / ') || null : null,
    rate,
    quantity: '1',
    stock,
  };
}

function productToNewItem(product: Product, variantId?: number | null): NewItemDraft | null {
  if (variantId != null) {
    const variant = product.variants?.find((v) => v.id === variantId);
    if (!variant) return null;
    return {
      key: lineKey(product.id, variant.id),
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      variantLabel: [variant.size, variant.colour].filter(Boolean).join(' / ') || null,
      rate: variant.salePrice ?? product.salePrice,
      quantity: '1',
      stock: variant.currentStock,
    };
  }
  if (product.variants && product.variants.length > 0) {
    return null;
  }
  return {
    key: lineKey(product.id, null),
    productId: product.id,
    variantId: null,
    name: product.name,
    variantLabel: null,
    rate: product.salePrice,
    quantity: '1',
    stock: product.currentStock,
  };
}

export function ReturnExchangePage() {
  const { t } = useLanguage();
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoice, setInvoice] = useState<InvoiceForReturn | null>(null);
  const [returnDrafts, setReturnDrafts] = useState<ReturnDraft[]>([]);
  const [mode, setMode] = useState<'return' | 'exchange'>('return');
  const [newItems, setNewItems] = useState<NewItemDraft[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [paymentKind, setPaymentKind] = useState<SimplePayKind>('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [applyToUdhaar, setApplyToUdhaar] = useState(true);
  const [udhaarApplyAmount, setUdhaarApplyAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const returnFormRef = useRef<HTMLFormElement>(null);
  const lastPrintRef = useRef<{ data: Parameters<typeof printReturnReceipt>[0]; kind: 'return' | 'exchange' } | null>(null);

  const location = useLocation();
  const initialInvoiceHandledRef = useRef<string | null>(null);

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => setSettings(null));
    api.listProductCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const runSearch = useCallback(async () => {
    const q = search.trim();
    if (!q && !categoryId) {
      setSearchResults([]);
      return;
    }
    try {
      const result = await api.listProducts({
        search: q || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        pageSize: 12,
        activeOnly: true,
      });
      setSearchResults(result.items);
    } catch {
      setSearchResults([]);
    }
  }, [search, categoryId]);

  useEffect(() => {
    if (mode !== 'exchange') return;
    const timer = setTimeout(() => void runSearch(), 250);
    return () => clearTimeout(timer);
  }, [runSearch, mode]);

  useEffect(() => {
    const passedInvoice = (location.state as { invoiceNumber?: string } | null)?.invoiceNumber;
    if (passedInvoice && initialInvoiceHandledRef.current !== passedInvoice) {
      initialInvoiceHandledRef.current = passedInvoice;
      const raw = passedInvoice.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, '').trim();
      if (raw) {
        setInvoiceQuery(raw);
        setLoading(true);
        setError('');
        api
          .lookupInvoiceForReturn(raw)
          .then((found) => {
            setInvoice(found);
            setInvoiceQuery(found.invoiceNumber);
            setReturnDrafts(
              found.items
                .filter((i) => i.returnableQty > 0)
                .map((i) => ({
                  invoiceItemId: i.id,
                  quantity: '0',
                  condition: 'GOOD' as ReturnCondition,
                  maxQty: i.returnableQty,
                  label: `${i.product.name}${i.variant ? ` (${[i.variant.size, i.variant.colour].filter(Boolean).join(' / ')})` : ''} — sold ${i.quantity}, returnable ${i.returnableQty}`,
                })),
            );
          })
          .catch((err) => {
            setInvoice(null);
            setReturnDrafts([]);
            setError(err instanceof Error ? err.message : 'Invoice not found');
          })
          .finally(() => {
            setLoading(false);
          });
      }
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  async function onLookup(e?: FormEvent) {
    e?.preventDefault();
    const raw = invoiceQuery.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, '').trim();
    if (!raw) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const found = await api.lookupInvoiceForReturn(raw);
      setInvoice(found);
      setInvoiceQuery(found.invoiceNumber);
      setReturnDrafts(
        found.items
          .filter((i) => i.returnableQty > 0)
          .map((i) => ({
            invoiceItemId: i.id,
            quantity: '0',
            condition: 'GOOD' as ReturnCondition,
            maxQty: i.returnableQty,
            label: `${i.product.name}${i.variant ? ` (${[i.variant.size, i.variant.colour].filter(Boolean).join(' / ')})` : ''} — sold ${i.quantity}, returnable ${i.returnableQty}`,
          })),
      );
      setNewItems([]);
      setUdhaarApplyAmount('');
      setApplyToUdhaar(true);
      setPaymentAccountId('');
    } catch (err) {
      setInvoice(null);
      setReturnDrafts([]);
      setError(err instanceof Error ? err.message : 'Invoice not found');
    } finally {
      setLoading(false);
    }
  }

  const calculatedReturnTotal = useMemo(() => {
    if (!invoice) return 0;
    const gross = returnDrafts.reduce((sum, d) => {
      const qty = Number(d.quantity);
      if (!qty || qty <= 0) return sum;
      const item = invoice.items.find((i) => i.id === d.invoiceItemId);
      if (!item) return sum;
      const unit = item.total / item.quantity;
      return sum + unit * Math.min(qty, d.maxQty);
    }, 0);
    const subtotal = invoice.subtotal ?? invoice.items.reduce((s, i) => s + i.total, 0);
    const discount = invoice.discount ?? 0;
    if (subtotal <= 0 || discount <= 0) return Math.round(gross * 100) / 100;
    const share = (gross / subtotal) * discount;
    return Math.round(Math.max(0, gross - share) * 100) / 100;
  }, [invoice, returnDrafts]);

  const refundAmount = calculatedReturnTotal;

  const newTotal = useMemo(() => {
    return newItems.reduce((sum, line) => {
      const qty = Number(line.quantity);
      if (!qty || qty <= 0) return sum;
      return sum + qty * line.rate;
    }, 0);
  }, [newItems]);

  const netAmount = useMemo(() => newTotal - refundAmount, [newTotal, refundAmount]);

  /** Cash/bank refund the shop owes (exchange uses net after new items). */
  const customerRefundDue =
    mode === 'exchange' ? Math.round(Math.max(0, -netAmount) * 100) / 100 : refundAmount;

  const customerOwed = invoice?.customerBalance ?? 0;
  const maxUdhaarApply = Math.min(customerOwed, customerRefundDue);
  const udhaarApply = useMemo(() => {
    if (!applyToUdhaar || !invoice?.customer || customerRefundDue <= 0) return 0;
    if (udhaarApplyAmount.trim() === '') return maxUdhaarApply;
    const n = Number(udhaarApplyAmount);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(maxUdhaarApply, n);
  }, [applyToUdhaar, invoice?.customer, udhaarApplyAmount, maxUdhaarApply, customerRefundDue]);

  const cashRefundDue = Math.round(Math.max(0, customerRefundDue - udhaarApply) * 100) / 100;
  const showUdhaarRefund = Boolean(invoice?.customer) && customerRefundDue > 0;

  function addOrIncrementNewItem(line: NewItemDraft) {
    setNewItems((prev) => {
      const existing = prev.find((p) => p.key === line.key);
      if (existing) {
        return prev.map((p) =>
          p.key === line.key ? { ...p, quantity: String(Number(p.quantity) + 1) } : p,
        );
      }
      return [...prev, line];
    });
  }

  function addNewFromScan(result: BarcodeLookupResult) {
    addOrIncrementNewItem(lookupToNewItem(result));
  }

  function addNewFromProduct(product: Product, variantId?: number | null) {
    const line = productToNewItem(product, variantId);
    if (!line) return;
    addOrIncrementNewItem(line);
    setSearch('');
    setSearchResults([]);
  }

  function printOpts() {
    return { originalInvoiceDate: invoice?.date ?? null };
  }

  function buildReturnPayload() {
    if (!invoice) throw new Error('Load an invoice first');
    const items = returnDrafts
      .map((d) => ({
        invoiceItemId: d.invoiceItemId,
        quantity: Number(d.quantity),
        condition: d.condition,
        maxQty: d.maxQty,
      }))
      .filter((i) => i.quantity > 0);
    if (!items.length) throw new Error('Select at least one item to return');
    for (const i of items) {
      if (i.quantity > i.maxQty) {
        throw new Error(`Return quantity cannot exceed ${i.maxQty}`);
      }
    }
    return items.map(({ invoiceItemId, quantity, condition }) => ({
      invoiceItemId,
      quantity,
      condition,
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const returnItems = buildReturnPayload();
      const paymentMethod = toApiPaymentMethod(paymentKind) as PurchasePaymentMethod;
      if (paymentKind === 'EPAY' && !paymentAccountId) {
        throw new Error('Select an e-payment account');
      }

      const udhaarPayload = {
        applyToUdhaar: showUdhaarRefund && applyToUdhaar,
        applyToUdhaarAmount:
          showUdhaarRefund && applyToUdhaar ? udhaarApply : undefined,
        refundToCash: !(showUdhaarRefund && applyToUdhaar) || undefined,
        paymentAccountId: paymentAccountId ? Number(paymentAccountId) : undefined,
      };

      if (mode === 'return') {
        const result = await api.createSaleReturn({
          invoiceId: invoice.id,
          items: returnItems,
          refundMethod: paymentMethod,
          refundAmount,
          note: null,
          ...udhaarPayload,
        });
        setMessage(
          `Return recorded. Refund Rs ${formatMoney(result.refundAmount)}` +
            (udhaarApply > 0
              ? ` (udhaar cleared Rs ${formatMoney(udhaarApply)}, cash/bank Rs ${formatMoney(cashRefundDue)})`
              : ''),
        );
        if (settings) {
          printReturnReceipt(result, settings, 'return', printOpts());
          lastPrintRef.current = { data: result, kind: 'return' };
        }
        await onLookup();
      } else {
        if (!newItems.length) throw new Error('Add at least one new item for exchange');
        const result = await api.createExchange({
          invoiceId: invoice.id,
          returnItems,
          newItems: newItems.map((l) => ({
            productId: l.productId,
            variantId: l.variantId,
            quantity: Number(l.quantity),
            rate: l.rate,
          })),
          paymentMethod,
          paidAmount: netAmount > 0 ? Number(paidAmount || netAmount) : 0,
          note: null,
          ...udhaarPayload,
        });
        setMessage(
          netAmount >= 0
            ? `Exchange complete. Customer pays Rs ${formatMoney(result.netAmount)}`
            : `Exchange complete. Refund Rs ${formatMoney(result.refundedAmount)}`,
        );
        if (settings) {
          printReturnReceipt(result, settings, 'exchange', printOpts());
          lastPrintRef.current = { data: result, kind: 'exchange' };
        }
        setNewItems([]);
        await onLookup();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  function clearReturnForm() {
    setNewItems([]);
    setPaidAmount('');
    setError('');
    setMessage('');
  }

  useFormShortcuts({
    onSave: () => returnFormRef.current?.requestSubmit(),
    onPrint:
      settings && lastPrintRef.current
        ? () =>
            printReturnReceipt(
              lastPrintRef.current!.data,
              settings,
              lastPrintRef.current!.kind,
              printOpts(),
            )
        : undefined,
    onClear: clearReturnForm,
    saveEnabled: Boolean(invoice) && !saving && returnDrafts.length > 0,
    printEnabled: Boolean(settings && lastPrintRef.current),
  });

  return (
    <PageShell
      title="Return / Exchange"
      subtitle="Search the original invoice — returns are separate records, invoice is never edited"
      actions={
        <div className="flex flex-wrap gap-2">
          <HubCloseButton to="/sales" />
          <Link to="/sales/list">
            <SecondaryButton type="button">Recent invoices</SecondaryButton>
          </Link>
        </div>
      }
    >
      <Panel className="mb-4">
        <form className="flex flex-wrap gap-3" onSubmit={onLookup}>
          <div className="min-w-[200px] flex-1">
            <FieldLabel>Invoice number / scan barcode</FieldLabel>
            <TextInput
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              placeholder="Type IA-000001 or scan invoice barcode"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
            <p className="mt-1 text-xs text-textMuted">
              Scan the barcode printed at the bottom of the invoice to open return details.
            </p>
          </div>
          <div className="flex items-end">
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? 'Searching…' : 'Find invoice'}
            </PrimaryButton>
          </div>
        </form>
      </Panel>

      {invoice ? (
        <form onSubmit={onSubmit} ref={returnFormRef}>
          <Panel className="mb-4">
            <div className="mb-4 flex flex-wrap gap-4 text-sm">
              <span>
                <strong>{invoice.invoiceNumber}</strong> · {formatDate(invoice.date)}
              </span>
              <span>Total Rs {formatMoney(invoice.totalAmount)}</span>
              {invoice.customer ? <span>Customer: {invoice.customer.name}</span> : <span>Walk-in</span>}
            </div>

            <div className="mb-4 flex gap-2">
              <SecondaryButton
                type="button"
                className={mode === 'return' ? 'ring-2 ring-accent' : ''}
                onClick={() => setMode('return')}
              >
                Return only
              </SecondaryButton>
              <SecondaryButton
                type="button"
                className={mode === 'exchange' ? 'ring-2 ring-accent' : ''}
                onClick={() => setMode('exchange')}
              >
                Exchange
              </SecondaryButton>
            </div>

            <h2 className="mb-3 font-semibold">Items to return</h2>
            <p className="mb-3 text-xs text-textMuted">
              Set quantity for each line. Use 0 to keep an item (not returned). Only lines with qty &gt; 0 are processed.
            </p>
            {returnDrafts.length === 0 ? (
              <p className="text-sm text-textSecondary">Nothing left to return on this invoice.</p>
            ) : (
              <div className="space-y-3">
                {returnDrafts.map((d, idx) => (
                  <div key={d.invoiceItemId} className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-4">
                    <p className="text-sm md:col-span-2">{d.label}</p>
                    <div>
                      <FieldLabel>Return qty (0–{d.maxQty})</FieldLabel>
                      <TextInput
                        type="number"
                        min={0}
                        max={d.maxQty}
                        value={d.quantity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = Math.max(0, Math.min(d.maxQty, Number(raw) || 0));
                          setReturnDrafts((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, quantity: raw === '' ? '' : String(n) } : row,
                            ),
                          );
                        }}
                      />
                    </div>
                    <div>
                      <FieldLabel>Condition</FieldLabel>
                      <select
                        className={SELECT_CLASS}
                        value={d.condition}
                        onChange={(e) => {
                          setReturnDrafts((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, condition: e.target.value as ReturnCondition } : row,
                            ),
                          );
                        }}
                      >
                        <option value="GOOD">Good — restock</option>
                        <option value="DAMAGED">Damaged — no restock</option>
                        <option value="OTHER">Other — restock</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {mode === 'exchange' ? (
            <Panel className="mb-4">
              <h2 className="mb-3 font-semibold">Exchange items (new products)</h2>
              <div className="mb-4">
                <BarcodeScanField onMatch={(r) => addNewFromScan(r)} />
              </div>
              <div className="mb-3 grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel>Search by name or code</FieldLabel>
                  <TextInput
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Type product name or code"
                  />
                </div>
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <select
                    className={SELECT_CLASS}
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {searchResults.length > 0 ? (
                <ul className="mb-4 max-h-52 overflow-y-auto divide-y divide-border rounded-lg border border-border text-sm">
                  {searchResults.map((product) => (
                    <li key={product.id} className="px-3 py-2">
                      <button
                        type="button"
                        className="w-full text-left hover:text-accent"
                        onClick={() => addNewFromProduct(product)}
                        disabled={Boolean(product.variants?.length)}
                      >
                        {product.name}
                        <span className="ml-2 text-textSecondary">
                          Rs {formatMoney(product.salePrice)} · Stock {product.currentStock}
                        </span>
                      </button>
                      {product.variants?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {product.variants.map((v: ProductVariant) => (
                            <GhostButton
                              key={v.id}
                              type="button"
                              className="text-xs"
                              onClick={() => addNewFromProduct(product, v.id)}
                            >
                              {[v.size, v.colour].filter(Boolean).join('/') || v.productCode} (
                              {v.currentStock})
                            </GhostButton>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : search.trim() || categoryId ? (
                <p className="mb-3 text-xs text-textMuted">No products match this search.</p>
              ) : (
                <p className="mb-3 text-xs text-textMuted">Scan a barcode or search to add exchange items.</p>
              )}
              {newItems.length === 0 ? (
                <p className="text-sm text-textSecondary">No exchange items yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-textSecondary">
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-right">Rate</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {newItems.map((line, idx) => (
                        <tr key={line.key} className="border-b border-border/60">
                          <td className="px-2 py-2">
                            {line.name}
                            {line.variantLabel ? (
                              <span className="block text-xs text-textSecondary">{line.variantLabel}</span>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <TextInput
                              type="number"
                              min="1"
                              className="ml-auto w-20 text-right"
                              value={line.quantity}
                              onChange={(e) =>
                                setNewItems((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, quantity: e.target.value } : row,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-2 text-right">{formatMoney(line.rate)}</td>
                          <td className="px-2 py-2 text-right">
                            {formatMoney(Math.max(0, Number(line.quantity) || 0) * line.rate)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <IconButton
                              icon={Trash2}
                              label="Remove line"
                              variant="danger"
                              onClick={() => setNewItems((prev) => prev.filter((_, i) => i !== idx))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          ) : null}

          <Panel className="mb-4">
            <div className="mb-4 space-y-1 rounded-lg border border-border bg-surface1 p-3 text-sm">
              {(invoice.discount ?? 0) > 0 ? (
                <p className="flex justify-between text-textSecondary">
                  <span>Invoice discount considered</span>
                  <span>- Rs {formatMoney(invoice.discount ?? 0)}</span>
                </p>
              ) : null}
              {mode === 'exchange' ? (
                <>
                  <p className="flex justify-between">
                    <span>Returned value</span>
                    <span>Rs {formatMoney(calculatedReturnTotal)}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Exchange items</span>
                    <span>Rs {formatMoney(newTotal)}</span>
                  </p>
                  <p className="flex justify-between font-semibold text-lg">
                    <span>{netAmount >= 0 ? 'Customer pays' : 'Refund to customer'}</span>
                    <span>Rs {formatMoney(Math.abs(netAmount))}</span>
                  </p>
                </>
              ) : (
                <p className="flex justify-between font-semibold text-lg">
                  <span>Refund</span>
                  <span>Rs {formatMoney(refundAmount)}</span>
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <PaymentMethodFields
                  kind={paymentKind}
                  onKindChange={setPaymentKind}
                  accountId={paymentAccountId}
                  onAccountChange={setPaymentAccountId}
                  label="Payment / refund method"
                />
              </div>
              {mode === 'exchange' && netAmount > 0 ? (
                <div>
                  <FieldLabel>Amount received</FieldLabel>
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={String(netAmount || 0)}
                  />
                </div>
              ) : null}
              {showUdhaarRefund ? (
                <div className="space-y-2 rounded-lg border border-border p-3 md:col-span-2">
                  <p className="text-sm font-medium text-textPrimary">
                    Customer udhaar balance: Rs {formatMoney(customerOwed)}
                  </p>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={applyToUdhaar}
                      onChange={(e) => setApplyToUdhaar(e.target.checked)}
                    />
                    <span>
                      Apply part of this refund against outstanding udhaar (with customer permission).
                    </span>
                  </label>
                  {applyToUdhaar ? (
                    <div className="space-y-2 pl-6">
                      <div>
                        <FieldLabel>Amount to clear from udhaar</FieldLabel>
                        <TextInput
                          type="number"
                          min="0"
                          max={maxUdhaarApply}
                          step="0.01"
                          value={udhaarApplyAmount || String(maxUdhaarApply || '')}
                          onChange={(e) => setUdhaarApplyAmount(e.target.value)}
                        />
                        <p className="mt-1 text-xs text-textMuted">
                          Max Rs {formatMoney(maxUdhaarApply)} (lesser of owe and refund).
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-surface1 px-3 py-2 text-sm">
                        <p className="flex justify-between">
                          <span>From udhaar</span>
                          <span>Rs {formatMoney(udhaarApply)}</span>
                        </p>
                        <p className="mt-1 flex justify-between font-semibold">
                          <span>
                            Remaining to return ({paymentKind === 'CASH' ? 'Cash' : 'E-payment'})
                          </span>
                          <span>Rs {formatMoney(cashRefundDue)}</span>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="pl-6 text-xs text-textMuted">
                      Full refund of Rs {formatMoney(customerRefundDue)} via{' '}
                      {paymentKind === 'CASH' ? 'Cash' : 'E-payment'}.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </Panel>

          {message ? <Feedback variant="success" className="mb-3">{message}</Feedback> : null}
          {error ? <Feedback variant="error" className="mb-3">{error}</Feedback> : null}

          <PrimaryButton type="submit" disabled={saving || returnDrafts.length === 0}>
            {saving
              ? t('Processing…')
              : shortcutLabel(
                  t(mode === 'exchange' ? 'Confirm exchange' : 'Confirm return'),
                  'F9',
                )}
          </PrimaryButton>
        </form>
      ) : null}

      {!invoice && error ? <Feedback variant="error">{error}</Feedback> : null}
    </PageShell>
  );
}
