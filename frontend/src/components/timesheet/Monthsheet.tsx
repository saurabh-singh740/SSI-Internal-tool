import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Lock, Unlock, Download, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../api/axios';
import { MonthSheet as MonthSheetType, TimesheetEntry } from '../../types';
import { useAuth } from '../../context/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  month: MonthSheetType;
  projectId: string;
  engineerId: string;
  year: number;
  projectName: string;
  engineerName: string;
  clientName: string;
  totalAuthorizedHours: number;
  projectStartDate?: string;
  projectEndDate?: string;
  onUpdate: (updated: MonthSheetType) => void;
}

const fmt = (d: string) => {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

const fmtHours = (h: number) => h.toFixed(2);

export default function MonthSheet({
  month, projectId, engineerId, year,
  projectName, engineerName, clientName,
  totalAuthorizedHours, projectStartDate, projectEndDate, onUpdate,
}: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isCustomer = user?.role === 'CUSTOMER';
  const canEdit = !isCustomer && !month.isLocked;

  const [saving, setSaving] = useState<string | null>(null); // entryId being saved
  const [locking, setLocking] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Pre-processed logo canvas — white pixels stripped so the logo blends on
  // any coloured PDF background without a visible white rectangle.
  const logoRef = useRef<HTMLCanvasElement | null>(null);
  const [localEntries, setLocalEntries] = useState<TimesheetEntry[]>(month.entries);
  const [localWeeklyTotals, setLocalWeeklyTotals] = useState(month.weeklyTotals);
  const [localMonthlyTotal, setLocalMonthlyTotal] = useState(month.monthlyTotal);
  const [localRemaining, setLocalRemaining] = useState(month.authorizedHoursRemainingAfterMonth);

  // Sync local state when the month prop changes (user switches month tab)
  useEffect(() => {
    setLocalEntries(month.entries);
    setLocalWeeklyTotals(month.weeklyTotals);
    setLocalMonthlyTotal(month.monthlyTotal);
    setLocalRemaining(month.authorizedHoursRemainingAfterMonth);
  }, [month]);

  // Load 2.jpg, strip its white background on an off-screen 2× canvas, and
  // store the result so jsPDF can embed it as a crisp transparent PNG.
  // Using 2× pixel density gives the PDF engine more pixels to work with,
  // which reads sharper at typical PDF print/zoom resolutions.
  useEffect(() => {
    const img = new Image();
    img.src = '/2.jpg';
    img.onload = () => {
      // ── 2× high-DPI canvas ──────────────────────────────────────────────
      const SCALE   = 2;
      const canvas  = document.createElement('canvas');
      canvas.width  = img.naturalWidth  * SCALE;
      canvas.height = img.naturalHeight * SCALE;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.scale(SCALE, SCALE);
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);

      // ── Smooth white-background removal ─────────────────────────────────
      // Instead of a binary on/off threshold we compute each pixel's
      // Euclidean distance from pure white (255,255,255) in RGB space.
      //
      //   dist = 0          → pure white   → alpha = 0   (fully transparent)
      //   dist = FADE_RANGE → logo content → alpha = 255 (fully opaque)
      //   0 < dist < FADE_RANGE            → proportional alpha (smooth edge)
      //
      // This preserves anti-aliased edges — they transition gradually rather
      // than leaving the jagged "dirty border" that a hard cut produces.
      const FADE_RANGE = 80; // RGB units; raise to remove more near-white haze,
                              // lower to keep very light logo tones intact

      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d     = frame.data;

      for (let i = 0; i < d.length; i += 4) {
        const dr   = 255 - d[i];
        const dg   = 255 - d[i + 1];
        const db   = 255 - d[i + 2];
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);

        if (dist < FADE_RANGE) {
          // Linear ramp: 0 at pure white → 255 at the edge of the fade zone.
          // Multiply (don't replace) the existing alpha to respect any existing
          // soft edges encoded in the original image.
          const fade   = dist / FADE_RANGE;          // 0.0 → 1.0
          d[i + 3]     = Math.round(fade * d[i + 3]);
        }
        // Pixels beyond FADE_RANGE are untouched (fully opaque logo content).
      }

      ctx.putImageData(frame, 0, 0);
      logoRef.current = canvas;
    };
  }, []);

  // ── Compute totals from local state ──────────────────────────────────────────
  const recomputeLocal = useCallback((entries: TimesheetEntry[]) => {
    const weekMap: Record<number, number> = {};
    let monthly = 0;
    for (const e of entries) {
      const th = Math.round((e.hours + e.minutes / 60) * 100) / 100;
      weekMap[e.week] = (weekMap[e.week] || 0) + th;
      monthly += th;
    }
    monthly = Math.round(monthly * 100) / 100;
    const weekly = Object.entries(weekMap)
      .map(([w, t]) => ({ week: Number(w), total: Math.round(t * 100) / 100 }))
      .sort((a, b) => a.week - b.week);
    return { weekly, monthly };
  }, []);

  // ── Optimistic field update ───────────────────────────────────────────────────
  const handleChange = (
    entryId: string,
    field: 'projectWork' | 'hours' | 'minutes' | 'remarks',
    value: string
  ) => {
    setLocalEntries(prev => {
      const updated = prev.map(e => {
        if (e._id !== entryId) return e;
        const next = { ...e, [field]: field === 'projectWork' || field === 'remarks' ? value : Number(value) };
        next.totalHours = Math.round((next.hours + next.minutes / 60) * 100) / 100;
        return next;
      });
      const { weekly, monthly } = recomputeLocal(updated);
      setLocalWeeklyTotals(weekly);
      setLocalMonthlyTotal(monthly);
      setLocalRemaining(Math.round(Math.max(0, totalAuthorizedHours - monthly) * 100) / 100);
      return updated;
    });
  };


  // Returns 'before'|'after' when the entry date is outside the project window.
  // Dates are compared using their YYYY-MM-DD string to avoid timezone shifts.
  const toDateStr = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
  const isOutOfProjectRange = (dateStr: string): false | 'before' | 'after' => {
    const entryDay = toDateStr(dateStr);
    if (projectStartDate && entryDay < toDateStr(projectStartDate)) return 'before';
    if (projectEndDate   && entryDay > toDateStr(projectEndDate))   return 'after';
    return false;
  };

  // ── Save entry on blur ────────────────────────────────────────────────────────
  const handleBlur = async (entry: TimesheetEntry) => {
    if (!canEdit) return;
    if (isOutOfProjectRange(entry.date)) return;
    setSaving(entry._id);
    try {
      const res = await api.patch(
        `/timesheets/${projectId}/${engineerId}/${year}/${month.monthIndex}/entries/${entry._id}`,
        {
          projectWork: entry.projectWork,
          hours: entry.hours,
          minutes: entry.minutes,
          remarks: entry.remarks,
        }
      );
      onUpdate(res.data.month);
    } catch (err) {
      console.error('Failed to save entry', err);
    } finally {
      setSaving(null);
    }
  };

  // ── Lock / unlock month (admin only) ─────────────────────────────────────────
  const handleLock = async () => {
    setLocking(true);
    try {
      await api.patch(
        `/timesheets/${projectId}/${engineerId}/${year}/${month.monthIndex}/lock`,
        { lock: !month.isLocked }
      );
      onUpdate({ ...month, isLocked: !month.isLocked });
    } finally {
      setLocking(false);
    }
  };

  // ── PDF download ─────────────────────────────────────────────────────────────
  // Generation runs inside setTimeout(0) so the React state update that shows
  // the loading indicator is painted by the browser BEFORE the synchronous
  // jsPDF work blocks the main thread.
  const handleDownloadPDF = () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    setTimeout(() => {
      try {
        generatePDF();
      } finally {
        setPdfGenerating(false);
      }
    }, 0);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // ── Design tokens ──────────────────────────────────────────────────────────
    const PAGE_W    = 297;
    const PAGE_H    = 210;
    const MARGIN    = 14;
    const CONTENT_W = PAGE_W - MARGIN * 2;
    const HEADER_H  = 36;
    const FOOTER_Y  = PAGE_H - 7;

    // Palette
    const C_PRIMARY    : [number,number,number] = [37,  99, 235];   // #2563EB
    const C_NAVY       : [number,number,number] = [15,  23,  42];   // #0F172A
    const C_SLATE      : [number,number,number] = [71,  85, 105];   // #475569
    const C_MUTED      : [number,number,number] = [148,163,184];    // #94A3B8
    const C_BORDER     : [number,number,number] = [226,232,240];    // #E2E8F0
    const C_BG_CARD    : [number,number,number] = [241,245,249];    // #F1F5F9
    const C_BG_LIGHT   : [number,number,number] = [248,250,252];    // #F8FAFC
    const C_WHITE      : [number,number,number] = [255,255,255];
    const C_ROW_ALT    : [number,number,number] = [249,250,251];    // #F9FAFB
    const C_WEEKEND    : [number,number,number] = [245,245,252];
    const C_WEEK_ROW   : [number,number,number] = [239,246,255];    // #EFF6FF
    const C_MONTH_ROW  : [number,number,number] = [37,  99, 235];   // same as primary
    const C_SUCCESS    : [number,number,number] = [22, 163,  74];   // #16A34A
    const C_SUCCESS_LT : [number,number,number] = [240,253,244];    // #F0FDF4
    const C_DANGER     : [number,number,number] = [220,  38,  38];  // #DC2626
    const C_DANGER_LT  : [number,number,number] = [254,242,242];    // #FEF2F2
    const C_AMBER      : [number,number,number] = [217,119,  6];    // #D97706

    // ── Derived values ─────────────────────────────────────────────────────────
    const remHours = Math.max(0, totalAuthorizedHours - localMonthlyTotal);
    const utilPct  = totalAuthorizedHours > 0
      ? Math.min(100, Math.round((localMonthlyTotal / totalAuthorizedHours) * 100))
      : 0;
    const generatedStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: draw the branded header band (called once per page)
    // ─────────────────────────────────────────────────────────────────────────
    const drawPageHeader = () => {
      // Navy background band
      doc.setFillColor(...C_NAVY);
      doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

      // Blue accent stripe at bottom of header
      doc.setFillColor(...C_PRIMARY);
      doc.rect(0, HEADER_H - 2, PAGE_W, 2, 'F');

      // ── Company logo ──────────────────────────────────────────────────────
      const logoEl = logoRef.current;
      if (logoEl && logoEl.width > 0) {
        // Canvas dimensions give the true pixel size (equivalent of naturalWidth
        // on an img element).  Aspect ratio is preserved; height is fixed so the
        // logo fills the header band without overflowing it.
        const LOGO_H  = 26;                             // mm — prominent in 36 mm header
        const aspect  = logoEl.width / logoEl.height;
        const LOGO_W  = Math.min(aspect * LOGO_H, 70); // cap to leave room for title
        const LOGO_X  = MARGIN;                         // flush with left page margin
        const LOGO_Y  = (HEADER_H - LOGO_H) / 2;       // vertically centred

        // PNG format preserves the alpha channel from the canvas so the logo
        // blends directly onto the navy background with no white rectangle.
        doc.addImage(logoEl, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H);
      } else {
        // Fallback rendered when the image hasn't loaded (e.g. file missing).
        doc.setFillColor(...C_PRIMARY);
        doc.roundedRect(MARGIN, 8, 20, 20, 3, 3, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C_WHITE);
        doc.text('SI', MARGIN + 10, 20.5, { align: 'center' });
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(200, 210, 230);
        doc.text('Stallion SI', MARGIN + 23, 15);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C_MUTED);
        doc.text('Project Management Platform', MARGIN + 23, 20);
      }

      // ── Report title (centre) ─────────────────────────────────────────────
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_WHITE);
      doc.text('EMPLOYEE TIMESHEET REPORT', PAGE_W / 2, 16, { align: 'center' });
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(160, 185, 215);
      doc.text(`${month.monthName.toUpperCase()} ${year}`, PAGE_W / 2, 23, { align: 'center' });

      // ── Right meta block ──────────────────────────────────────────────────
      const RX = PAGE_W - MARGIN;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C_MUTED);
      doc.text('Generated', RX, 11, { align: 'right' });
      doc.setTextColor(200, 215, 235);
      doc.text(generatedStr, RX, 15.5, { align: 'right' });
      doc.setTextColor(...C_MUTED);
      doc.text('Status', RX, 20, { align: 'right' });
      if (month.isLocked) {
        doc.setTextColor(253, 186, 116);
        doc.text('LOCKED', RX, 24.5, { align: 'right' });
      } else {
        doc.setTextColor(134, 239, 172);
        doc.text('ACTIVE', RX, 24.5, { align: 'right' });
      }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: draw a labelled info pair inside a card
    // ─────────────────────────────────────────────────────────────────────────
    const drawInfoPair = (label: string, value: string, x: number, y: number) => {
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C_MUTED);
      doc.text(label.toUpperCase(), x, y);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C_NAVY);
      doc.text(value || '—', x, y + 4.5);
    };

    // ═════════════════════════════════════════════════════════════════════════
    // 1. HEADER
    // ═════════════════════════════════════════════════════════════════════════
    drawPageHeader();

    // ═════════════════════════════════════════════════════════════════════════
    // 2. PROJECT INFO CARD
    // ═════════════════════════════════════════════════════════════════════════
    const CARD_Y = HEADER_H + 5;
    const CARD_H = 30;

    doc.setFillColor(...C_BG_CARD);
    doc.roundedRect(MARGIN, CARD_Y, CONTENT_W, CARD_H, 3, 3, 'F');
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.25);
    doc.roundedRect(MARGIN, CARD_Y, CONTENT_W, CARD_H, 3, 3, 'S');

    // Left-edge primary accent bar
    doc.setFillColor(...C_PRIMARY);
    doc.roundedRect(MARGIN, CARD_Y, 3, CARD_H, 1.5, 1.5, 'F');

    const col1X = MARGIN + 8;
    const col2X = MARGIN + CONTENT_W * 0.27;
    const col3X = MARGIN + CONTENT_W * 0.54;
    const col4X = MARGIN + CONTENT_W * 0.76;
    const infoRowY = CARD_Y + 9;

    drawInfoPair('Project', projectName,  col1X, infoRowY);
    drawInfoPair('Client',  clientName || 'N/A', col2X, infoRowY);
    drawInfoPair('Engineer', engineerName, col3X, infoRowY);
    drawInfoPair('Reporting Period', `${month.monthName} ${year}`, col4X, infoRowY);

    const infoRow2Y = CARD_Y + 20;
    drawInfoPair('Authorized Hours', `${totalAuthorizedHours} hrs`, col1X, infoRow2Y);
    drawInfoPair('Logged This Month', `${fmtHours(localMonthlyTotal)} hrs`, col2X, infoRow2Y);
    drawInfoPair('Remaining After Month', `${fmtHours(remHours)} hrs`, col3X, infoRow2Y);
    drawInfoPair('Utilization', `${utilPct}%`, col4X, infoRow2Y);

    // Thin vertical separators
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.2);
    for (const x of [col2X - 4, col3X - 4, col4X - 4]) {
      doc.line(x, CARD_Y + 6, x, CARD_Y + CARD_H - 6);
    }

    const TABLE_START_Y = CARD_Y + CARD_H + 4;

    // ═════════════════════════════════════════════════════════════════════════
    // 3. BUILD TABLE ROWS WITH METADATA
    // ═════════════════════════════════════════════════════════════════════════
    type RowMeta = {
      cells: (string | number)[];
      kind: 'normal' | 'weekend' | 'weekTotal' | 'monthTotal' | 'remaining';
      alt: boolean;
    };

    const tableRows: RowMeta[] = [];
    let seenWeek = 0;
    let flipAlt  = false;

    for (const e of localEntries) {
      const isWeekend = e.dayOfWeek === 'Saturday' || e.dayOfWeek === 'Sunday';

      // Inject week-total separator before a new week begins (skip for first)
      if (e.week !== seenWeek) {
        if (seenWeek !== 0) {
          const wt = localWeeklyTotals.find(t => t.week === seenWeek);
          tableRows.push({
            cells: ['', '', '', `WEEK ${seenWeek} TOTAL`, '', '', '', fmtHours(wt?.total ?? 0), ''],
            kind: 'weekTotal', alt: false,
          });
        }
        seenWeek = e.week;
        flipAlt  = false;
      }

      tableRows.push({
        cells: [
          e.sno,
          `Wk ${e.week}`,
          e.dayOfWeek,
          fmt(e.date),
          e.projectWork || '',
          e.hours || '',
          e.minutes || '',
          e.totalHours > 0 ? fmtHours(e.totalHours) : '',
          e.remarks || '',
        ],
        kind: isWeekend ? 'weekend' : 'normal',
        alt:  !isWeekend && flipAlt,
      });
      if (!isWeekend) flipAlt = !flipAlt;
    }

    // Final week total
    if (seenWeek !== 0) {
      const wt = localWeeklyTotals.find(t => t.week === seenWeek);
      tableRows.push({
        cells: ['', '', '', `WEEK ${seenWeek} TOTAL`, '', '', '', fmtHours(wt?.total ?? 0), ''],
        kind: 'weekTotal', alt: false,
      });
    }

    tableRows.push({
      cells: ['', '', '', 'MONTHLY TOTAL', '', '', '', fmtHours(localMonthlyTotal), ''],
      kind: 'monthTotal', alt: false,
    });
    tableRows.push({
      cells: ['', '', '', 'Authorized Hours Remaining After Month', '', '', '', fmtHours(remHours), ''],
      kind: 'remaining', alt: false,
    });

    // ═════════════════════════════════════════════════════════════════════════
    // 4. AUTOTABLE — premium styling
    // ═════════════════════════════════════════════════════════════════════════
    autoTable(doc, {
      startY: TABLE_START_Y,
      margin: { left: MARGIN, right: MARGIN, bottom: 14 }, // bottom clearance for footer
      head: [[
        { content: 'S.No',     styles: { halign: 'center' } },
        { content: 'Week',     styles: { halign: 'center' } },
        { content: 'Day',      styles: { halign: 'left'   } },
        { content: 'Date',     styles: { halign: 'center' } },
        { content: 'Project Work Description', styles: { halign: 'left' } },
        { content: 'Hours',    styles: { halign: 'center' } },
        { content: 'Mins',     styles: { halign: 'center' } },
        { content: 'Total Hrs',styles: { halign: 'center' } },
        { content: 'Remarks',  styles: { halign: 'left'   } },
      ]],
      body: tableRows.map(r => r.cells),
      styles: {
        fontSize: 7.5,
        cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
        lineColor: C_BORDER,
        lineWidth: 0.2,
        textColor: C_NAVY,
        font: 'helvetica',
        overflow: 'linebreak',
        minCellHeight: 6,
      },
      headStyles: {
        fillColor:   C_PRIMARY,
        textColor:   C_WHITE,
        fontStyle:   'bold',
        fontSize:    8,
        cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
        lineWidth:   0,
      },
      alternateRowStyles: { fillColor: C_WHITE }, // disabled — we control it below
      columnStyles: {
        0: { cellWidth: 11,    halign: 'center' },
        1: { cellWidth: 14,    halign: 'center' },
        2: { cellWidth: 22,    halign: 'left'   },
        3: { cellWidth: 22,    halign: 'center' },
        4: { cellWidth: 65,    halign: 'left'   },
        5: { cellWidth: 16,    halign: 'center' },
        6: { cellWidth: 14,    halign: 'center' },
        7: { cellWidth: 22,    halign: 'center', fontStyle: 'bold' },
        8: { cellWidth: 'auto',halign: 'left'   },
      },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const row = tableRows[data.row.index];
        if (!row) return;

        const col = data.column.index;

        if (row.kind === 'monthTotal') {
          data.cell.styles.fillColor  = C_MONTH_ROW;
          data.cell.styles.textColor  = C_WHITE;
          data.cell.styles.fontStyle  = 'bold';
          data.cell.styles.fontSize   = 8.5;
          if (col === 3) data.cell.styles.halign = 'right';
          if (col === 7) data.cell.styles.fontSize = 10;

        } else if (row.kind === 'weekTotal') {
          data.cell.styles.fillColor  = C_WEEK_ROW;
          data.cell.styles.textColor  = C_PRIMARY;
          data.cell.styles.fontStyle  = 'bold';
          data.cell.styles.fontSize   = 7.5;
          if (col === 3) { data.cell.styles.halign = 'right'; }
          if (col === 7) { data.cell.styles.textColor = C_PRIMARY; }

        } else if (row.kind === 'remaining') {
          const isNeg = remHours <= 0;
          data.cell.styles.fillColor  = isNeg ? C_DANGER_LT  : C_SUCCESS_LT;
          data.cell.styles.textColor  = isNeg ? C_DANGER     : C_SUCCESS;
          data.cell.styles.fontStyle  = 'bold';
          if (col === 3) data.cell.styles.halign = 'right';

        } else if (row.kind === 'weekend') {
          data.cell.styles.fillColor  = C_WEEKEND;
          data.cell.styles.textColor  = col === 2 ? [120, 80, 180] : [100, 110, 130];

        } else {
          // Normal row — alt row tinting
          data.cell.styles.fillColor  = row.alt ? C_ROW_ALT : C_WHITE;

          // Green tint for total hours column when non-zero
          if (col === 7 && data.cell.raw !== '' && Number(data.cell.raw) > 0) {
            data.cell.styles.textColor = C_SUCCESS;
          }
        }
      },
    });

    const tableEndY: number = (doc as any).lastAutoTable.finalY ?? TABLE_START_Y + 40;

    // ═════════════════════════════════════════════════════════════════════════
    // 5. MONTHLY SUMMARY SECTION
    // ═════════════════════════════════════════════════════════════════════════
    const SUMMARY_H    = 30;
    const spaceLeft    = PAGE_H - tableEndY - 16; // 16 = footer clearance
    let sumY           = tableEndY + 5;

    if (spaceLeft < SUMMARY_H + 4) {
      doc.addPage();
      drawPageHeader();
      sumY = HEADER_H + 8;
    }

    // Summary card
    doc.setFillColor(...C_BG_LIGHT);
    doc.roundedRect(MARGIN, sumY, CONTENT_W, SUMMARY_H, 3, 3, 'F');
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.25);
    doc.roundedRect(MARGIN, sumY, CONTENT_W, SUMMARY_H, 3, 3, 'S');

    // Section label
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C_PRIMARY);
    doc.text('MONTHLY SUMMARY', MARGIN + 5, sumY + 6.5);

    // 4 metric tiles
    const metrics: { label: string; value: string; color: [number,number,number] }[] = [
      { label: 'Total Hours Logged',  value: `${fmtHours(localMonthlyTotal)} hrs`, color: C_PRIMARY  },
      { label: 'Authorized Hours',    value: `${totalAuthorizedHours} hrs`,         color: C_SLATE    },
      { label: 'Remaining Hours',     value: `${fmtHours(remHours)} hrs`,           color: remHours <= 0 ? C_DANGER : C_SUCCESS },
      { label: 'Utilization',         value: `${utilPct}%`,                          color: utilPct >= 100 ? C_DANGER : utilPct >= 80 ? C_AMBER : C_SUCCESS },
    ];

    const TILE_MARGIN  = 5;
    const TILE_GAP     = 3;
    const TILE_AREA    = CONTENT_W - TILE_MARGIN * 2;
    const TILE_W       = (TILE_AREA - TILE_GAP * 3) / 4;
    const TILE_Y       = sumY + 9;
    const TILE_H       = 14;

    metrics.forEach(({ label, value, color }, i) => {
      const tx = MARGIN + TILE_MARGIN + i * (TILE_W + TILE_GAP);

      doc.setFillColor(...C_WHITE);
      doc.roundedRect(tx, TILE_Y, TILE_W, TILE_H, 2, 2, 'F');
      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(tx, TILE_Y, TILE_W, TILE_H, 2, 2, 'S');

      // Colored top accent bar
      doc.setFillColor(...color);
      doc.roundedRect(tx, TILE_Y, TILE_W, 1.5, 1, 1, 'F');
      doc.rect(tx, TILE_Y + 0.5, TILE_W, 1, 'F'); // flatten bottom of rounded rect

      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C_MUTED);
      doc.text(label.toUpperCase(), tx + TILE_W / 2, TILE_Y + 6.5, { align: 'center' });

      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...color);
      doc.text(value, tx + TILE_W / 2, TILE_Y + 11.5, { align: 'center' });
    });

    // Progress bar
    const BAR_Y  = sumY + SUMMARY_H - 6.5;
    const BAR_H  = 3;
    const BAR_X  = MARGIN + 5;
    const BAR_W  = CONTENT_W - 10;

    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C_SLATE);
    doc.text(`Utilization  ${utilPct}%`, BAR_X, BAR_Y - 1.5);
    doc.setTextColor(...C_MUTED);
    doc.text(
      `${fmtHours(localMonthlyTotal)} logged of ${totalAuthorizedHours} authorized hours`,
      MARGIN + CONTENT_W - 5, BAR_Y - 1.5, { align: 'right' }
    );

    // Track
    doc.setFillColor(...C_BORDER);
    doc.roundedRect(BAR_X, BAR_Y, BAR_W, BAR_H, 1.5, 1.5, 'F');

    // Fill
    if (utilPct > 0) {
      const fillW = Math.max(3, (BAR_W * Math.min(utilPct, 100)) / 100);
      const barColor: [number,number,number] = utilPct >= 100 ? C_DANGER : utilPct >= 80 ? C_AMBER : C_PRIMARY;
      doc.setFillColor(...barColor);
      doc.roundedRect(BAR_X, BAR_Y, fillW, BAR_H, 1.5, 1.5, 'F');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 6. STAMP FOOTER ON EVERY PAGE
    // ═════════════════════════════════════════════════════════════════════════
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);

      // Thin separator line
      doc.setDrawColor(...C_BORDER);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, FOOTER_Y - 3, PAGE_W - MARGIN, FOOTER_Y - 3);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');

      // Left — generator credit
      doc.setTextColor(...C_MUTED);
      doc.text('Generated by Stallion SI Project Management System', MARGIN, FOOTER_Y);

      // Centre — page number
      doc.setTextColor(...C_SLATE);
      doc.text(`Page ${p} of ${totalPages}`, PAGE_W / 2, FOOTER_Y, { align: 'center' });

      // Right — confidential notice
      doc.setTextColor(...C_MUTED);
      doc.text('Confidential – Internal Use Only', PAGE_W - MARGIN, FOOTER_Y, { align: 'right' });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 7. SAVE
    // ═════════════════════════════════════════════════════════════════════════
    const safeName    = engineerName.replace(/\s+/g, '_');
    const safeProject = projectName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
    doc.save(`Timesheet_${safeName}_${safeProject}_${month.monthName}_${year}.pdf`);
  }; // end generatePDF

  // ── Group entries by week for rendering ──────────────────────────────────────
  const weeks: Record<number, TimesheetEntry[]> = {};
  for (const e of localEntries) {
    if (!weeks[e.week]) weeks[e.week] = [];
    weeks[e.week].push(e);
  }

  const utilizationPct = totalAuthorizedHours > 0
    ? Math.round((localMonthlyTotal / totalAuthorizedHours) * 100)
    : 0;

  return (
    <div className="space-y-3">
      {/* Month header bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold text-ink-100">{month.monthName} {year}</h3>
          {month.isLocked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/15 text-red-400 text-xs rounded-full font-medium">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Authorized hours summary */}
          <span className="text-xs text-ink-400 hidden sm:block">
            Remaining after month:&nbsp;
            <span className={clsx('font-semibold', localRemaining <= 0 ? 'text-red-400' : 'text-emerald-400')}>
              {fmtHours(localRemaining)} hrs
            </span>
          </span>
          <button
            onClick={handleDownloadPDF}
            disabled={pdfGenerating}
            className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-60"
            title="Download PDF"
          >
            {pdfGenerating
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
              : <><Download className="h-3.5 w-3.5" /> PDF</>
            }
          </button>
          {isAdmin && (
            <button
              onClick={handleLock}
              disabled={locking}
              className={clsx('text-xs py-1.5 px-3 inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors',
                month.isLocked
                  ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                  : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
              )}
            >
              {locking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : month.isLocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {month.isLocked ? 'Unlock' : 'Lock'}
            </button>
          )}
        </div>
      </div>

      {/* Premium dark table */}
      <div
        className="overflow-x-auto rounded-xl"
        style={{
          background: '#111827',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <table className="w-full text-xs border-collapse" id={`sheet-${month.monthIndex}`}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {(['S.No', 'Week', 'Day', 'Date', 'Project Work', 'Work Hours', 'Minutes', 'Total Hours', 'Remarks'] as const).map((h, i) => (
                <th
                  key={h}
                  className={clsx(
                    'px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500',
                    'border-r border-white/5 last:border-r-0',
                    i <= 3 || i === 5 || i === 6 || i === 7 ? 'text-center' : 'text-left',
                    i === 4 ? 'min-w-[200px]' : i === 8 ? 'min-w-[160px]' : '',
                  )}
                  style={{ background: '#111827' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(weeks).map(([weekNum, entries]) => {
              const wTotal = localWeeklyTotals.find(t => t.week === Number(weekNum))?.total || 0;
              return (
                <React.Fragment key={`week-${weekNum}`}>
                  {entries.map((entry, idx) => {
                    const isSaving    = saving === entry._id;
                    const isWeekend   = entry.dayOfWeek === 'Saturday' || entry.dayOfWeek === 'Sunday';
                    const outOfRange  = isOutOfProjectRange(entry.date);
                    const rowCanEdit  = canEdit && !outOfRange;

                    const rowTitle = outOfRange === 'before'
                      ? `Before project start (${new Date(projectStartDate!).toLocaleDateString()}) — editing not allowed`
                      : outOfRange === 'after'
                        ? `After project end (${new Date(projectEndDate!).toLocaleDateString()}) — editing not allowed`
                        : undefined;

                    return (
                      <tr
                        key={entry._id}
                        className={clsx(
                          'group transition-all duration-150',
                          'border-b border-white/[0.04]',
                          outOfRange
                            ? 'opacity-30 cursor-not-allowed'
                            : isWeekend
                              ? 'bg-violet-500/[0.04] hover:bg-violet-500/[0.08]'
                              : 'hover:bg-white/[0.04] hover:-translate-y-px',
                        )}
                        title={rowTitle}
                      >
                        <td className="border-r border-white/5 px-3 py-1.5 text-center text-gray-600 tabular-nums">{entry.sno}</td>
                        <td className="border-r border-white/5 px-3 py-1.5 text-center text-gray-500 font-medium">
                          {idx === 0 ? `Wk ${entry.week}` : ''}
                        </td>
                        <td className={clsx(
                          'border-r border-white/5 px-3 py-1.5 font-medium',
                          isWeekend ? 'text-violet-400' : 'text-gray-300'
                        )}>
                          {entry.dayOfWeek}
                        </td>
                        <td className="border-r border-white/5 px-3 py-1.5 text-center text-gray-400 tabular-nums">
                          {fmt(entry.date)}
                        </td>
                        <td className="border-r border-white/5 p-0">
                          {rowCanEdit ? (
                            <input
                              id={`entry-work-${entry._id}`}
                              name={`entry-work-${entry._id}`}
                              value={entry.projectWork}
                              onChange={e => handleChange(entry._id, 'projectWork', e.target.value)}
                              onBlur={() => handleBlur(entry)}
                              className="w-full px-3 py-1.5 bg-transparent text-white placeholder-gray-700 focus:outline-none focus:bg-white/5 focus:ring-1 focus:ring-inset focus:ring-indigo-500/50 transition-all duration-150"
                              placeholder="Describe work done…"
                            />
                          ) : (
                            <span className="block px-3 py-1.5 text-gray-300">{entry.projectWork || <span className="text-gray-700">—</span>}</span>
                          )}
                        </td>
                        <td className="border-r border-white/5 p-0">
                          {rowCanEdit ? (
                            <input
                              id={`entry-hours-${entry._id}`}
                              name={`entry-hours-${entry._id}`}
                              type="number" min="0" max="23"
                              value={entry.hours || ''}
                              onChange={e => handleChange(entry._id, 'hours', e.target.value)}
                              onBlur={() => handleBlur(entry)}
                              className="w-full px-3 py-1.5 bg-transparent text-white text-center focus:outline-none focus:bg-white/5 focus:ring-1 focus:ring-inset focus:ring-indigo-500/50 transition-all duration-150"
                            />
                          ) : (
                            <span className="block px-3 py-1.5 text-center text-gray-300">{entry.hours || <span className="text-gray-700">—</span>}</span>
                          )}
                        </td>
                        <td className="border-r border-white/5 p-0">
                          {rowCanEdit ? (
                            <input
                              id={`entry-minutes-${entry._id}`}
                              name={`entry-minutes-${entry._id}`}
                              type="number" min="0" max="59"
                              value={entry.minutes || ''}
                              onChange={e => handleChange(entry._id, 'minutes', e.target.value)}
                              onBlur={() => handleBlur(entry)}
                              className="w-full px-3 py-1.5 bg-transparent text-white text-center focus:outline-none focus:bg-white/5 focus:ring-1 focus:ring-inset focus:ring-indigo-500/50 transition-all duration-150"
                            />
                          ) : (
                            <span className="block px-3 py-1.5 text-center text-gray-300">{entry.minutes || <span className="text-gray-700">—</span>}</span>
                          )}
                        </td>
                        <td className={clsx(
                          'border-r border-white/5 px-3 py-1.5 text-center tabular-nums font-semibold',
                          entry.totalHours > 0 ? 'text-emerald-400' : 'text-gray-700'
                        )}>
                          {entry.totalHours > 0 ? fmtHours(entry.totalHours) : '—'}
                          {isSaving && <Loader2 className="h-3 w-3 animate-spin inline ml-1 text-indigo-400" />}
                          {!isSaving && entry.totalHours > 0 && (
                            <CheckCircle className="h-3 w-3 inline ml-1 text-emerald-500/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </td>
                        <td className="p-0">
                          {rowCanEdit ? (
                            <input
                              id={`entry-remarks-${entry._id}`}
                              name={`entry-remarks-${entry._id}`}
                              value={entry.remarks}
                              onChange={e => handleChange(entry._id, 'remarks', e.target.value)}
                              onBlur={() => handleBlur(entry)}
                              className="w-full px-3 py-1.5 bg-transparent text-gray-400 placeholder-gray-700 focus:outline-none focus:bg-white/5 focus:ring-1 focus:ring-inset focus:ring-indigo-500/50 focus:text-gray-200 transition-all duration-150"
                              placeholder="Optional notes…"
                            />
                          ) : (
                            <span className="block px-3 py-1.5 text-gray-500">{entry.remarks || <span className="text-gray-700">—</span>}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Week subtotal row */}
                  <tr
                    className="font-medium"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <td colSpan={4} className="border-r border-white/5 px-3 py-1.5 text-right text-indigo-300 text-[10px] uppercase tracking-wider">
                      Week {weekNum} Total
                    </td>
                    <td className="border-r border-white/5" />
                    <td className="border-r border-white/5" />
                    <td className="border-r border-white/5" />
                    <td className="border-r border-white/5 px-3 py-1.5 text-center text-indigo-300 tabular-nums font-semibold">
                      {fmtHours(wTotal)}
                    </td>
                    <td />
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Monthly total row */}
            <tr
              className="font-semibold"
              style={{
                background: 'rgba(99,102,241,0.10)',
                borderTop: '1px solid rgba(99,102,241,0.20)',
              }}
            >
              <td colSpan={4} className="border-r border-indigo-500/20 px-3 py-2.5 text-right text-indigo-200 text-[11px] uppercase tracking-wider">
                Monthly Total
              </td>
              <td className="border-r border-indigo-500/20" />
              <td className="border-r border-indigo-500/20" />
              <td className="border-r border-indigo-500/20" />
              <td className="border-r border-indigo-500/20 px-3 py-2.5 text-center tabular-nums text-indigo-200 text-sm">
                {fmtHours(localMonthlyTotal)}
              </td>
              <td />
            </tr>

            {/* Authorized hours remaining row */}
            <tr
              className="font-medium"
              style={{
                background: localRemaining <= 0 ? 'rgba(239,68,68,0.07)' : 'rgba(16,185,129,0.07)',
                borderTop: `1px solid ${localRemaining <= 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}`,
              }}
            >
              <td colSpan={4} className="border-r border-white/5 px-3 py-2 text-right">
                <span className={clsx(
                  'inline-flex items-center justify-end gap-1 text-[10px] uppercase tracking-wider',
                  localRemaining <= 0 ? 'text-red-400' : 'text-emerald-400'
                )}>
                  {localRemaining <= 0 && <AlertTriangle className="h-3 w-3" />}
                  Authorized Hours Remaining
                </span>
              </td>
              <td className="border-r border-white/5" />
              <td className="border-r border-white/5" />
              <td className="border-r border-white/5" />
              <td className={clsx(
                'border-r border-white/5 px-3 py-2 text-center tabular-nums font-semibold',
                localRemaining <= 0 ? 'text-red-400' : 'text-emerald-400'
              )}>
                {fmtHours(localRemaining)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Progress bar */}
      {totalAuthorizedHours > 0 && localMonthlyTotal > 0 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs text-ink-400 w-28 flex-shrink-0">Monthly utilization</span>
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={clsx('h-1.5 rounded-full', utilizationPct >= 100 ? 'bg-red-500' : utilizationPct >= 80 ? 'bg-amber-500' : 'bg-green-500')}
              style={{ width: `${Math.min(utilizationPct, 100)}%` }}
            />
          </div>
          <span className="text-xs text-ink-400 tabular-nums w-12 text-right">{utilizationPct}%</span>
        </div>
      )}
    </div>
  );
}