/**
 * Quotation / document PDF generation (pdfkit).
 *
 * Arabic support: pdfkit does not shape Arabic script, so text is passed
 * through arabic-reshaper (presentation forms) + bidi-js (logical→visual
 * reordering) and rendered with the Amiri font (OFL licensed, bundled).
 * English uses DejaVu Sans.
 *
 * NOTE: generated documents are system templates, NOT lawyer-approved legal
 * instruments. This disclaimer is printed on contracts.
 */
import PDFDocument from 'pdfkit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import reshaper from 'arabic-reshaper';
import bidiModule from 'bidi-js';

interface EmbeddingLevelsResult {
  levels: Uint8Array;
  paragraphs: Array<{ start: number; end: number; level: number }>;
}
interface BidiApi {
  getEmbeddingLevels(text: string, dir: string): EmbeddingLevelsResult;
  getReorderSegments(text: string, result: EmbeddingLevelsResult, start?: number, end?: number): Array<[number, number]>;
}
const bidiFactoryFn = ((bidiModule as unknown as { default?: () => BidiApi }).default) ?? (bidiModule as unknown as () => BidiApi);
const bidi: BidiApi = bidiFactoryFn();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(__dirname, '../../assets/fonts');
const AMIRI = path.join(FONT_DIR, 'Amiri-Regular.ttf');
const DEJAVU = path.join(FONT_DIR, 'DejaVuSans.ttf');
const DEJAVU_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

export type PdfLocale = 'ar' | 'en';

const NAVY = '#16324f';
const GREY = '#5b6b7c';
const LIGHT = '#eef1f5';

/** Shape + visually reorder Arabic text for direct rendering. */
export function shapeArabic(text: string): string {
  let shaped = text;
  try {
    shaped = reshaper.convertArabic(text) ?? text;
  } catch {
    shaped = text; // fall back to unshaped rather than failing the export
  }
  const chars = [...shaped];
  const result = bidi.getEmbeddingLevels(shaped, 'auto');
  const segments = bidi.getReorderSegments(shaped, result);
  for (const [start, end] of segments) {
    const seg = chars.slice(start, end + 1).reverse();
    chars.splice(start, seg.length, ...seg);
  }
  return chars.join('');
}

interface PdfText { ar: string; en: string }
function L(locale: PdfLocale, t: PdfText): string {
  return locale === 'ar' ? t.ar : t.en;
}

export interface PdfQuotationLine {
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
}

export interface PdfQuotationData {
  locale: PdfLocale;
  company: { name: string; tagline?: string; address?: string; phone?: string; email?: string; taxId?: string };
  quoteNo: string;
  version: number;
  status: string;
  issuedAt: string;
  validUntil?: string | null;
  currency: 'LBP' | 'USD';
  customer: { name: string; company?: string | null; phone?: string | null; email?: string | null; address?: string | null };
  title?: string | null;
  lines: PdfQuotationLine[];
  subtotal: string;
  discountAmount: string;
  discountPct: string;
  taxAmount: string;
  taxPct: string;
  total: string;
  scopeOfWork?: string | null;
  paymentTerms?: string | null;
  assumptions?: string | null;
  exclusions?: string | null;
}

function fmtAmount(v: string, currency: string): string {
  const n = Number(v || 0);
  const s = currency === 'LBP'
    ? Math.round(n).toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} ${currency}`;
}

export async function generateQuotationPdf(data: PdfQuotationData): Promise<Buffer> {
  const ar = data.locale === 'ar';
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));

  doc.registerFont('body', ar ? AMIRI : DEJAVU);
  doc.registerFont('body-bold', ar ? AMIRI : DEJAVU_BOLD);
  doc.font('body');

  const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const right = doc.page.width - doc.page.margins.right;
  const left = doc.page.margins.left;

  const txt = (s: string): string => (ar ? shapeArabic(s) : s);
  // Draw a (possibly shaped) line; x is the START edge (left for en, right-anchored for ar).
  const line = (s: string, y: number, opts: { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center'; width?: number; x?: number } = {}): number => {
    doc.font(opts.bold ? 'body-bold' : 'body').fontSize(opts.size ?? 10).fillColor(opts.color ?? '#1c2733');
    const width = opts.width ?? W;
    const x = opts.x ?? (ar && (!opts.align || opts.align === 'right') ? right - width : left);
    doc.text(txt(s), x, y, { width, align: opts.align ?? (ar ? 'right' : 'left'), lineGap: 2 });
    return doc.y;
  };

  // ---- header band
  doc.rect(0, 0, doc.page.width, 92).fill(NAVY);
  doc.fillColor('#ffffff');
  const nameY = 22;
  doc.font('body-bold').fontSize(17).text(txt(data.company.name), left, nameY, { width: W * 0.6, align: ar ? 'right' : 'left' });
  doc.font('body').fontSize(9).fillColor('#c9d4e0');
  const contactParts = [data.company.address, data.company.phone, data.company.email].filter(Boolean).join('  ·  ');
  if (contactParts) doc.text(txt(contactParts), left, doc.y + 2, { width: W * 0.6, align: ar ? 'right' : 'left' });

  doc.font('body-bold').fontSize(16).fillColor('#e8c877');
  doc.text(txt(ar ? 'عرض سعر' : 'QUOTATION'), left + W * 0.6, nameY, { width: W * 0.4, align: ar ? 'left' : 'right' });
  doc.font('body').fontSize(9).fillColor('#c9d4e0');
  doc.text(`${data.quoteNo} · v${data.version}`, left + W * 0.6, doc.y + 2, { width: W * 0.4, align: ar ? 'left' : 'right' });

  let y = 110;

  // ---- meta + customer
  const halfW = W / 2 - 10;
  const metaX = ar ? right - halfW : left;
  const custX = ar ? left : left + halfW + 20;
  doc.font('body-bold').fontSize(10).fillColor(GREY);
  doc.text(txt(ar ? 'تفاصيل' : 'DETAILS'), metaX, y, { width: halfW, align: ar ? 'right' : 'left' });
  doc.text(txt(ar ? 'العميل' : 'BILL TO'), custX, y, { width: halfW, align: ar ? 'right' : 'left' });
  y += 16;
  doc.font('body').fontSize(10).fillColor('#1c2733');
  const metaLines = [
    `${L(data.locale, { ar: 'التاريخ', en: 'Date' })}: ${data.issuedAt}`,
    data.validUntil ? `${L(data.locale, { ar: 'صالح حتى', en: 'Valid until' })}: ${data.validUntil}` : '',
    `${L(data.locale, { ar: 'العملة', en: 'Currency' })}: ${data.currency}`,
  ].filter(Boolean);
  let ym = y;
  for (const ml of metaLines) ym = line(ml, ym, { width: halfW, x: metaX, align: ar ? 'right' : 'left' }) + 2;
  let yc = y;
  const custLines = [data.customer.name, data.customer.company, data.customer.phone, data.customer.email, data.customer.address].filter(Boolean) as string[];
  for (const cl of custLines) yc = line(cl, yc, { width: halfW, x: custX, align: ar ? 'right' : 'left' }) + 2;
  y = Math.max(ym, yc) + 8;

  if (data.title) {
    y = line(data.title, y, { bold: true, size: 12 }) + 10;
  }

  // ---- items table
  const cols = ar
    ? [
        { key: 'total', w: 0.16, head: 'المجموع' },
        { key: 'unitPrice', w: 0.16, head: 'سعر الوحدة' },
        { key: 'unit', w: 0.10, head: 'الوحدة' },
        { key: 'qty', w: 0.10, head: 'الكمية' },
        { key: 'description', w: 0.48, head: 'البيان' },
      ]
    : [
        { key: 'description', w: 0.48, head: 'Description' },
        { key: 'qty', w: 0.10, head: 'Qty' },
        { key: 'unit', w: 0.10, head: 'Unit' },
        { key: 'unitPrice', w: 0.16, head: 'Unit price' },
        { key: 'total', w: 0.16, head: 'Total' },
      ];

  const drawHeader = (): void => {
    doc.rect(left, y, W, 22).fill(LIGHT);
    let cx = left;
    doc.font('body-bold').fontSize(9.5).fillColor(NAVY);
    for (const c of cols) {
      const cw = c.w * W;
      const isDesc = c.key === 'description';
      doc.text(txt(c.head), cx + 5, y + 6, { width: cw - 10, align: isDesc ? (ar ? 'right' : 'left') : 'center' });
      cx += cw;
    }
    y += 22;
    doc.font('body');
  };
  drawHeader();

  for (let i = 0; i < data.lines.length; i++) {
    const l = data.lines[i]!;
    // measure row height
    doc.font('body').fontSize(9.5);
    const descH = doc.heightOfString(txt(l.description), { width: cols.find((c) => c.key === 'description')!.w * W - 10 });
    const rowH = Math.max(20, descH + 10);
    if (y + rowH > doc.page.height - 90) {
      doc.addPage();
      y = 50;
      drawHeader();
    }
    if (i % 2 === 1) doc.rect(left, y, W, rowH).fill('#f8fafc');
    doc.fillColor('#1c2733');
    let cx = left;
    for (const c of cols) {
      const cw = c.w * W;
      let val = '';
      if (c.key === 'description') val = l.description;
      else if (c.key === 'qty') val = String(Number(l.qty));
      else if (c.key === 'unit') val = l.unit;
      else if (c.key === 'unitPrice') val = fmtAmount(l.unitPrice, data.currency);
      else val = fmtAmount(l.lineTotal, data.currency);
      const align = c.key === 'description' ? (ar ? 'right' : 'left') : 'center';
      doc.text(txt(val), cx + 5, y + 5, { width: cw - 10, align: align as 'left' | 'right' | 'center' });
      cx += cw;
    }
    doc.moveTo(left, y + rowH).lineTo(left + W, y + rowH).strokeColor('#dfe5ec').lineWidth(0.5).stroke();
    y += rowH;
  }

  // ---- totals
  y += 10;
  const totalsX = ar ? left : left + W * 0.55;
  const totalsW = W * 0.45;
  const totalRow = (label: string, value: string, bold = false): void => {
    doc.font(bold ? 'body-bold' : 'body').fontSize(bold ? 11 : 10).fillColor(bold ? NAVY : '#1c2733');
    if (ar) {
      doc.text(fmtAmount(value, data.currency), totalsX, y, { width: totalsW * 0.5, align: 'left' });
      doc.text(txt(label), totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
    } else {
      doc.text(txt(label), totalsX, y, { width: totalsW * 0.5, align: 'left' });
      doc.text(fmtAmount(value, data.currency), totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
    }
    y += bold ? 20 : 16;
  };
  totalRow(L(data.locale, { ar: 'المجموع الفرعي', en: 'Subtotal' }), data.subtotal);
  if (Number(data.discountPct) > 0) {
    totalRow(L(data.locale, { ar: `خصم (${data.discountPct}%)`, en: `Discount (${data.discountPct}%)` }), data.discountAmount);
  }
  if (Number(data.taxPct) > 0) {
    totalRow(L(data.locale, { ar: `ضريبة (${data.taxPct}%)`, en: `Tax (${data.taxPct}%)` }), data.taxAmount);
  }
  totalRow(L(data.locale, { ar: 'الإجمالي', en: 'TOTAL' }), data.total, true);

  // ---- terms sections
  const sections: Array<[string, string | null | undefined]> = [
    [L(data.locale, { ar: 'نطاق العمل', en: 'Scope of work' }), data.scopeOfWork],
    [L(data.locale, { ar: 'شروط الدفع', en: 'Payment terms' }), data.paymentTerms],
    [L(data.locale, { ar: 'الافتراضات', en: 'Assumptions' }), data.assumptions],
    [L(data.locale, { ar: 'الاستثناءات', en: 'Exclusions' }), data.exclusions],
  ];
  for (const [title, body] of sections) {
    if (!body) continue;
    if (y > doc.page.height - 140) { doc.addPage(); y = 50; }
    y += 6;
    y = line(title, y, { bold: true, size: 10.5, color: NAVY }) + 2;
    for (const b of body.split('\n')) {
      y = line(b.trim(), y, { size: 9.5, color: '#33404e' }) + 1;
    }
  }

  // ---- footer on every page
  const range = doc.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    doc.switchToPage(p);
    doc.rect(0, doc.page.height - 46, doc.page.width, 46).fill('#f4f6f9');
    doc.font('body').fontSize(7.5).fillColor(GREY);
    doc.text(
      txt(L(data.locale, {
        ar: 'هذا المستند مُنشأ إلكترونياً بواسطة نظام إدارة المقاولات وليس وثيقة قانونية معتمدة من محامٍ. تصبح الأسعار نهائية بعد تأكيد الشركة خطياً.',
        en: 'System-generated document (not a lawyer-approved legal instrument). Prices become final only upon written company confirmation.',
      })),
      left, doc.page.height - 40, { width: W, align: 'center' },
    );
    doc.text(`${data.quoteNo} v${data.version} — ${p + 1}/${range.count}`, left, doc.page.height - 20, { width: W, align: 'center' });
  }

  doc.end();
  return done;
}
