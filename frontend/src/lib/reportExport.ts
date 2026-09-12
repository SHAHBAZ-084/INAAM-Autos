import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { formatDateTime, formatMoney } from './format';
import {
  URDU_PRINT_FONT_STACK,
  containsArabicScript,
} from '../i18n/printFonts';

export type ReportExportMeta = {
  businessName?: string;
  address?: string;
  phone?: string;
  logoSrc?: string | null;
  dateRange?: string;
  generatedAt?: string;
  /** Brand accent RGB for PDF table headers (default INAAM red). */
  accentRgb?: [number, number, number];
  summaryStats?: Array<{ label: string; value: string }>;
};

function wrapBusinessName(name: string, maxPerLine = 28): string[] {
  const text = name.trim();
  if (!text) return [];
  if (text.length <= maxPerLine) return [text];
  const mid = Math.floor(text.length / 2);
  const space = text.lastIndexOf(' ', mid);
  const idx = space > 8 ? space : mid;
  return [text.slice(0, idx).trim(), text.slice(idx).trim()].filter(Boolean).slice(0, 2);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function looksLikeMoney(header: string): boolean {
  const h = header.toLowerCase();
  return (
    h.includes('amount') ||
    h.includes('total') ||
    h.includes('balance') ||
    h.includes('profit') ||
    h.includes('cost') ||
    h.includes('paid') ||
    h.includes('rs') ||
    h.includes('price') ||
    h.includes('revenue') ||
    h.includes('value') ||
    h.includes('outstanding') ||
    h.includes('refund')
  );
}

function formatCell(header: string, value: string | number): string {
  if (typeof value === 'number' && looksLikeMoney(header)) {
    return formatMoney(value);
  }
  return String(value);
}

function buildHeaderLines(title: string, meta?: ReportExportMeta): string[] {
  const lines: string[] = [];
  if (meta?.businessName?.trim()) lines.push(meta.businessName.trim());
  if (meta?.phone?.trim()) lines.push(meta.phone.trim());
  if (meta?.address?.trim()) lines.push(meta.address.trim());
  lines.push(title);
  if (meta?.dateRange?.trim()) lines.push(`Period: ${meta.dateRange.trim()}`);
  lines.push(`Generated: ${meta?.generatedAt ?? formatDateTime(new Date())}`);
  return lines;
}

function exportTextHasArabic(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  meta?: ReportExportMeta,
): boolean {
  const parts: string[] = [title, ...headers];
  if (meta?.businessName) parts.push(meta.businessName);
  if (meta?.address) parts.push(meta.address);
  if (meta?.phone) parts.push(meta.phone);
  if (meta?.dateRange) parts.push(meta.dateRange);
  if (meta?.summaryStats) {
    for (const s of meta.summaryStats) {
      parts.push(s.label, s.value);
    }
  }
  for (const row of rows) {
    for (const cell of row) parts.push(String(cell));
  }
  return parts.some(containsArabicScript);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureUrduFontStylesheet() {
  if (document.getElementById('inaam-urdu-export-fonts')) return;
  const link = document.createElement('link');
  link.id = 'inaam-urdu-export-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap';
  document.head.appendChild(link);
}

/**
 * Helvetica cannot render Arabic. Build HTML → canvas → real PDF file download
 * (not the browser print dialog).
 */
async function downloadPdfViaHtmlCanvas(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  meta?: ReportExportMeta,
) {
  ensureUrduFontStylesheet();
  const accent = meta?.accentRgb ?? ([200, 16, 46] as [number, number, number]);
  const accentCss = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
  const rtl =
    typeof localStorage !== 'undefined' && localStorage.getItem('inaam.uiLanguage') === 'URDU';
  const generated = meta?.generatedAt ?? formatDateTime(new Date());

  const statsHtml =
    meta?.summaryStats?.length
      ? `<div class="stats">${meta.summaryStats
          .map(
            (s) =>
              `<div class="stat"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.value)}</strong></div>`,
          )
          .join('')}</div>`
      : '';

  const host = document.createElement('div');
  host.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  host.setAttribute('lang', rtl ? 'ur' : 'en');
  host.style.cssText = [
    'position:fixed',
    'left:-14000px',
    'top:0',
    'width:794px',
    'background:#ffffff',
    'padding:28px 24px',
    'box-sizing:border-box',
    `font-family:${URDU_PRINT_FONT_STACK}`,
    'font-size:15px',
    'color:#111111',
    'line-height:1.65',
    'z-index:-1',
  ].join(';');

  host.innerHTML = `
<style>
  .hdr {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
    gap: 12px;
    align-items: start;
    border-bottom: 2px solid ${accentCss};
    padding-bottom: 12px;
    margin-bottom: 12px;
  }
  .hdr-left { text-align: start; }
  .hdr-center { text-align: center; }
  .hdr-right { text-align: end; font-size: 12px; color: #444; line-height: 1.45; font-weight: 600; }
  .hdr-logo { max-height: 64px; max-width: 140px; object-fit: contain; background: #fff; }
  .biz-name { font-size: 18px; font-weight: 800; margin: 0 0 4px; color: #111; }
  .rpt-title { font-size: 16px; font-weight: 800; margin: 0; color: #111; }
  .hdr-right div { margin: 0 0 2px; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; }
  .stat {
    min-width: 130px;
    background: #f3f3f3;
    padding: 8px 10px;
    border-radius: 4px;
  }
  .stat span { display: block; font-size: 12px; opacity: 0.85; }
  .stat strong { display: block; margin-top: 2px; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; margin-top: 8px; }
  th, td {
    border-bottom: 1px solid #e5e5e5;
    padding: 8px 10px;
    text-align: start;
    font-size: 12px;
    vertical-align: top;
  }
  th { background: ${accentCss}; color: #fff; font-weight: 700; border-bottom: none; }
  tr:nth-child(even) { background: #fafafa; }
  .num { text-align: end; font-variant-numeric: tabular-nums; }
</style>
<div class="hdr">
  <div class="hdr-left">
    ${meta?.logoSrc?.trim() ? `<img class="hdr-logo" src="${escapeHtml(meta.logoSrc.trim())}" alt="" />` : ''}
  </div>
  <div class="hdr-center">
    ${meta?.businessName?.trim() ? `<div class="biz-name">${escapeHtml(meta.businessName.trim())}</div>` : ''}
    <div class="rpt-title">${escapeHtml(title)}</div>
  </div>
  <div class="hdr-right">
    ${meta?.address?.trim() ? `<div>${escapeHtml(meta.address.trim())}</div>` : ''}
    ${meta?.phone?.trim() ? `<div>${escapeHtml(meta.phone.trim())}</div>` : ''}
    ${meta?.dateRange?.trim() ? `<div>${escapeHtml(meta.dateRange.trim())}</div>` : ''}
    <div>${escapeHtml(generated)}</div>
  </div>
</div>
<table>
  <thead><tr>${headers
    .map((h) => {
      const cls = looksLikeMoney(h) ? ' class="num"' : '';
      return `<th${cls}>${escapeHtml(h)}</th>`;
    })
    .join('')}</tr></thead>
  <tbody>
    ${rows
      .map(
        (row) =>
          `<tr>${row
            .map((c, idx) => {
              const cell = formatCell(headers[idx] ?? '', c);
              const cls = looksLikeMoney(headers[idx] ?? '') ? ' class="num"' : '';
              return `<td${cls}>${escapeHtml(cell).replace(/\n/g, '<br/>')}</td>`;
            })
            .join('')}</tr>`,
      )
      .join('')}
  </tbody>
</table>
${statsHtml}`;

  document.body.appendChild(host);

  try {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    await new Promise((r) => window.setTimeout(r, 200));

    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.93);
    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const marginMm = 10;
    const usableWidth = pageWidthMm - marginMm * 2;
    const usableHeight = pageHeightMm - marginMm * 2;
    const imgHeightMm = (canvas.height * usableWidth) / canvas.width;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let heightLeft = imgHeightMm;
    let y = marginMm;

    doc.addImage(imgData, 'JPEG', marginMm, y, usableWidth, imgHeightMm);
    heightLeft -= usableHeight;

    while (heightLeft > 1) {
      y = marginMm - (imgHeightMm - heightLeft);
      doc.addPage();
      doc.addImage(imgData, 'JPEG', marginMm, y, usableWidth, imgHeightMm);
      heightLeft -= usableHeight;
    }

    doc.save(filename);
  } finally {
    host.remove();
  }
}

export function downloadExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
  meta?: ReportExportMeta,
) {
  const headerLines = buildHeaderLines(sheetName, meta);
  const worksheet = XLSX.utils.aoa_to_sheet([
    ...headerLines.map((line) => [line]),
    [''],
    headers,
    ...rows.map((row) => row.map((cell, idx) => formatCell(headers[idx] ?? '', cell))),
  ]);
  const colWidths = headers.map((header, idx) => {
    const maxLen = Math.max(header.length, ...rows.map((row) => String(row[idx] ?? '').length));
    return { wch: Math.min(48, Math.max(10, maxLen + 2)) };
  });
  worksheet['!cols'] = colWidths;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  triggerDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
  meta?: ReportExportMeta,
) {
  const escape = (cell: string | number) => {
    const s = String(cell);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const preamble = buildHeaderLines(filename.replace(/\.csv$/i, ''), meta).map(escape);
  const lines = [
    ...preamble,
    '',
    headers.map(escape).join(','),
    ...rows.map((row) => row.map((cell, idx) => escape(formatCell(headers[idx] ?? '', cell))).join(',')),
  ];
  // UTF-8 BOM so Excel correctly shows Urdu / Arabic
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

export async function downloadPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  meta?: ReportExportMeta,
) {
  if (exportTextHasArabic(title, headers, rows, meta)) {
    await downloadPdfViaHtmlCanvas(filename, title, headers, rows, meta);
    return;
  }

  const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? 'landscape' : 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let startY = 12;

  const leftX = 14;
  const rightX = pageWidth - 14;
  const centerX = pageWidth / 2;

  if (meta?.logoSrc && meta.logoSrc.startsWith('data:')) {
    try {
      const format = meta.logoSrc.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(meta.logoSrc, format, leftX, 8, 16, 16);
    } catch {
      /* skip unreadable logo */
    }
  }

  const nameLines = wrapBusinessName(meta?.businessName ?? '');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  nameLines.forEach((line, i) => {
    doc.text(line, centerX, startY + i * 5.5, { align: 'center', maxWidth: pageWidth * 0.46 });
  });
  let centerBottom = startY + Math.max(1, nameLines.length) * 5.5;
  doc.setFontSize(12);
  doc.text(title, centerX, centerBottom + 2, { align: 'center', maxWidth: pageWidth * 0.5 });
  centerBottom += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let rightY = 12;
  if (meta?.address?.trim()) {
    const addrLines = doc.splitTextToSize(meta.address.trim(), 55) as string[];
    addrLines.slice(0, 3).forEach((ln) => {
      doc.text(ln, rightX, rightY, { align: 'right' });
      rightY += 4;
    });
  }
  if (meta?.phone?.trim()) {
    doc.text(meta.phone.trim(), rightX, rightY, { align: 'right', maxWidth: 55 });
    rightY += 4;
  }
  if (meta?.dateRange?.trim()) {
    doc.text(meta.dateRange.trim(), rightX, rightY, { align: 'right', maxWidth: 55 });
    rightY += 4;
  }
  doc.text(`Generated: ${meta?.generatedAt ?? new Date().toLocaleString()}`, rightX, rightY, {
    align: 'right',
    maxWidth: 55,
  });
  rightY += 4;

  startY = Math.max(8 + 16, centerBottom, rightY) + 2;
  const accent = meta?.accentRgb ?? ([200, 16, 46] as [number, number, number]);
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.6);
  doc.line(leftX, startY, rightX, startY);
  startY += 6;
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    head: [headers],
    body: rows.map((row) => row.map((cell, idx) => formatCell(headers[idx] ?? '', cell))),
    startY,
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', lineColor: [220, 220, 220], lineWidth: 0.2 },
    headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    columnStyles: Object.fromEntries(
      headers.map((header, idx) => [
        idx,
        looksLikeMoney(header) ? { halign: 'right' as const } : { halign: 'left' as const },
      ]),
    ),
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' },
      );
      doc.setTextColor(0, 0, 0);
    },
  });

  if (meta?.summaryStats?.length) {
    const finalY =
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
      startY;
    let summaryY = finalY + 8;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (summaryY + meta.summaryStats.length * 5 > pageHeight - 14) {
      doc.addPage();
      summaryY = 16;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    for (const stat of meta.summaryStats) {
      doc.text(`${stat.label}: ${stat.value}`, leftX, summaryY);
      summaryY += 4.5;
    }
  }

  doc.save(filename);
}
