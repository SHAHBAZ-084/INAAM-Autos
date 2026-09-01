import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { downloadExcel, downloadPdf } from '../../lib/reportExport';
import { useBusinessReportMeta } from '../../hooks/useBusinessReportMeta';
import { PageShell, Panel, SecondaryButton } from '../../components/ui/PageShell';

export function TrialBalancePage() {
  const reportMeta = useBusinessReportMeta();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getTrialBalance>> | null>(null);

  useEffect(() => {
    api.getTrialBalance().then(setData).catch(() => setData(null));
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
    if (format === 'excel') {
      downloadExcel('trial-balance.xlsx', 'Trial Balance', headers, rows, reportMeta);
    } else {
      downloadPdf('trial-balance.pdf', title, headers, rows, reportMeta);
    }
  }

  return (
    <PageShell
      title="Trial Balance"
      subtitle="Simple books check: left column total should equal right column total"
      wide
      actions={
        <Link to="/accounts/overview">
          <SecondaryButton type="button">Back to Finance Overview</SecondaryButton>
        </Link>
      }
    >
      <Panel className="mb-4 border-accent/30 bg-accent/5">
        <h2 className="text-sm font-semibold text-textPrimary">What is this?</h2>
        <p className="mt-2 text-sm leading-relaxed text-textSecondary">
          Every transaction has two sides. This page lists each account and shows amounts on the left
          (Debit) and right (Credit). If the two grand totals match, your books are balanced — nothing
          is missing from the ledger.
        </p>
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
              <p className="mt-1 text-sm text-textSecondary">
                Left total Rs {formatMoney(data.totalDebit)} · Right total Rs{' '}
                {formatMoney(data.totalCredit)}
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
                <tr className="border-b border-border text-textSecondary">
                  <th className="py-2">Account name</th>
                  <th className="py-2 text-right">Left (Debit)</th>
                  <th className="py-2 text-right">Right (Credit)</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((row, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="py-2 font-medium text-textPrimary">{row.accountName}</td>
                    <td className="py-2 text-right tabular-nums">
                      {row.debit > 0 ? formatMoney(row.debit) : '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.credit > 0 ? formatMoney(row.credit) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-3">Total</td>
                  <td className="py-3 text-right tabular-nums">Rs {formatMoney(data.totalDebit)}</td>
                  <td className="py-3 text-right tabular-nums">Rs {formatMoney(data.totalCredit)}</td>
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
