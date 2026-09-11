import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { downloadExcel, downloadPdf } from '../../lib/reportExport';
import { useBusinessReportMeta } from '../../hooks/useBusinessReportMeta';
import { resolveLogoDataUrl } from '../../lib/electronPrint';
import { PageShell, Panel, SecondaryButton } from '../../components/ui/PageShell';
import { HubCloseButton } from '../../components/ui/HubCloseButton';

const BRAND_ACCENT = '#C8102E';

export function TrialBalancePage() {
  const reportMeta = useBusinessReportMeta();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getTrialBalance>> | null>(null);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [biz, setBiz] = useState<{ name: string; phone: string; address: string; accent: string } | null>(null);

  useEffect(() => {
    api.getTrialBalance().then(setData).catch(() => setData(null));
    api
      .getSettings()
      .then(async (s) => {
        const logo = await resolveLogoDataUrl(s.logoUrl);
        setLogoSrc(logo);
        setBiz({
          name: s.businessName,
          phone: [s.phoneLabel, s.phone].filter(Boolean).join(' ').trim(),
          address: s.address || '',
          accent: s.secondaryColor?.trim() || BRAND_ACCENT,
        });
      })
      .catch(() => undefined);
  }, []);

  function exportTrialBalance(format: 'pdf' | 'excel') {
    if (!data) return;
    const headers = ['Account', 'Money in (Debit)', 'Money out side (Credit)'];
    const rows = data.accounts.map((row) => [
      row.accountName,
      formatMoney(row.debit),
      formatMoney(row.credit),
    ]);
    rows.push(['Total', formatMoney(data.totalDebit), formatMoney(data.totalCredit)]);
    const title = data.isBalanced
      ? 'Trial Balance — books match'
      : 'Trial Balance — books do not match (check entries)';
    const meta = {
      ...reportMeta,
      summaryStats: [
        { label: 'Total Debit', value: `Rs ${formatMoney(data.totalDebit)}` },
        { label: 'Total Credit', value: `Rs ${formatMoney(data.totalCredit)}` },
        { label: 'Status', value: data.isBalanced ? 'Balanced' : 'Not balanced' },
      ],
    };
    if (format === 'excel') {
      downloadExcel('trial-balance.xlsx', 'Trial Balance', headers, rows, meta);
    } else {
      downloadPdf('trial-balance.pdf', title, headers, rows, meta);
    }
  }

  const accent = biz?.accent || BRAND_ACCENT;
  const balanced = data?.isBalanced ?? false;

  return (
    <PageShell
      title="Trial Balance"
      subtitle="Simple books check: left column total should equal right column total"
      wide
      actions={
        <div className="flex flex-wrap gap-2">
          <HubCloseButton to="/reports" />
          <Link to="/accounts/overview">
            <SecondaryButton type="button">Back to Finance Overview</SecondaryButton>
          </Link>
        </div>
      }
    >
      <Panel className="mb-4 overflow-hidden p-0">
        <div className="border-b-2 px-4 py-4 sm:px-5" style={{ borderColor: accent }}>
          <div className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <div className="flex min-h-[56px] items-center">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="max-h-14 max-w-[140px] object-contain bg-white" />
              ) : (
                <div className="text-lg font-extrabold text-textPrimary">{biz?.name || 'Business'}</div>
              )}
            </div>
            <div className="text-center">
              {logoSrc && biz?.name ? (
                <div className="text-base font-extrabold text-textPrimary sm:text-lg">{biz.name}</div>
              ) : null}
            </div>
            <div className="text-right text-xs font-semibold leading-relaxed text-textSecondary">
              {biz?.phone ? <div>{biz.phone}</div> : null}
              {biz?.address ? <div className="max-w-[220px] sm:ml-auto">{biz.address}</div> : null}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap gap-2">
              <div
                className={`min-w-[140px] rounded-md px-3 py-2 ${
                  data ? (balanced ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger') : 'bg-[#f3f3f3]'
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Total Debit</div>
                <div className="mt-0.5 text-sm font-extrabold tabular-nums">
                  {data ? `Rs ${formatMoney(data.totalDebit)}` : '—'}
                </div>
              </div>
              <div
                className={`min-w-[140px] rounded-md px-3 py-2 ${
                  data ? (balanced ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger') : 'bg-[#f3f3f3]'
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Total Credit</div>
                <div className="mt-0.5 text-sm font-extrabold tabular-nums">
                  {data ? `Rs ${formatMoney(data.totalCredit)}` : '—'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-extrabold text-textPrimary">Trial Balance</div>
              <div className="text-xs font-semibold text-textSecondary">
                Generated: {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        {data ? (
          <>
            <div
              className={`mb-4 rounded-xl border px-4 py-3 ${
                data.isBalanced ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'
              }`}
            >
              <p className={`text-lg font-bold ${data.isBalanced ? 'text-success' : 'text-danger'}`}>
                {data.isBalanced ? '✓ Books are balanced' : '⚠ Books need a check'}
              </p>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <SecondaryButton type="button" onClick={() => exportTrialBalance('pdf')}>
                Download PDF
              </SecondaryButton>
              <SecondaryButton type="button" onClick={() => exportTrialBalance('excel')}>
                Download Excel
              </SecondaryButton>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ backgroundColor: accent }}>
                  <th className="px-3 py-2.5 font-semibold text-white">Account name</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-white">Left (Debit)</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-white">Right (Credit)</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((row, i) => (
                  <tr key={i} className="border-b border-border/70 odd:bg-white even:bg-surface1/40">
                    <td className="px-3 py-2 font-medium text-textPrimary">{row.accountName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.debit > 0 ? formatMoney(row.debit) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.credit > 0 ? formatMoney(row.credit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className={`border-t-2 font-semibold ${
                    data.isBalanced ? 'border-success text-success' : 'border-danger text-danger'
                  }`}
                >
                  <td className="px-3 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">Rs {formatMoney(data.totalDebit)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">Rs {formatMoney(data.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </>
        ) : (
          <p className="text-sm text-textSecondary">Loading…</p>
        )}
      </Panel>
    </PageShell>
  );
}
