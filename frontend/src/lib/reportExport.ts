import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatMoney } from './format';

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
  lines.push(`Generated: ${meta?.generatedAt ?? new Date().toLocaleString()}`);
  return lines;
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
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename);
}

export function downloadPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  meta?: ReportExportMeta,
) {
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

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  let rightY = 12;
  if (meta?.phone?.trim()) {
    doc.text(meta.phone.trim(), rightX, rightY, { align: 'right', maxWidth: 55 });
    rightY += 4;
  }
  if (meta?.address?.trim()) {
    const addrLines = doc.splitTextToSize(meta.address.trim(), 55) as string[];
    addrLines.slice(0, 3).forEach((ln) => {
      doc.text(ln, rightX, rightY, { align: 'right' });
      rightY += 4;
    });
  }

  startY = Math.max(8 + nameLines.length * 5.5, rightY, 26) + 2;
  const accent = meta?.accentRgb ?? ([200, 16, 46] as [number, number, number]);
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.6);
  doc.line(leftX, startY, rightX, startY);
  startY += 8;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 17, 17);
  doc.text(title, rightX, startY, { align: 'right' });
  startY += 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(85, 85, 85);
  if (meta?.dateRange?.trim()) {
    doc.text(meta.dateRange.trim(), rightX, startY, { align: 'right' });
    startY += 4;
  }
  doc.text(`Generated: ${meta?.generatedAt ?? new Date().toLocaleString()}`, rightX, startY, { align: 'right' });
  startY += 6;
  doc.setTextColor(0, 0, 0);

  if (meta?.summaryStats?.length) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    for (const stat of meta.summaryStats) {
      doc.text(`${stat.label}: ${stat.value}`, leftX, startY);
      startY += 4.5;
    }
    startY += 3;
  }

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

  doc.save(filename);
}
