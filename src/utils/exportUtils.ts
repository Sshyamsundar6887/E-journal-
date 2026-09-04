import { jsPDF } from 'jspdf';
import { JournalEntry } from '../types';

/**
 * Security: CSV Formula Injection Prevention (OWASP A03 / LLM02)
 * If cell text begins with formula triggers (=, +, -, @, tab, cr),
 * prefix with a single quote (') to force text evaluation in Excel/Sheets.
 */
function sanitizeCsvCell(value: string | number | undefined | null): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // Check leading character for formula injection risk
  const trimmed = str.trimStart();
  if (trimmed.length > 0) {
    const firstChar = trimmed[0];
    if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
      str = "'" + str;
    }
  }

  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Exports journal entries to a standardized, formula-safe CSV file.
 */
export function exportEntriesToCsv(
  entries: JournalEntry[],
  filenamePrefix = 'aura_journal_backup',
  onError?: (err: string) => void
): boolean {
  if (!entries || entries.length === 0) {
    if (onError) onError('No journal entries available to export.');
    return false;
  }

  // Headers
  const headers = [
    'Entry ID',
    'Date',
    'Title',
    'Mood',
    'Sentiment',
    'Sentiment Score (-1 to 1)',
    'Dominant Themes',
    'AI Summary',
    'Action Items',
    'Has Photo Attachment',
    'Reflection Content'
  ];

  // Rows
  const rows = entries.map((entry) => {
    const actionItemsFormatted = (entry.actionItems || [])
      .map((item) => `[${item.completed ? 'X' : ' '}] ${item.text}${item.dueDate ? ` (Due: ${item.dueDate})` : ''}`)
      .join('; ');

    const themesFormatted = (entry.themes || []).join(', ');

    return [
      sanitizeCsvCell(entry.id),
      sanitizeCsvCell(entry.date ? new Date(entry.date).toISOString() : ''),
      sanitizeCsvCell(entry.title || 'Untitled Reflection'),
      sanitizeCsvCell(entry.mood || 'Reflective'),
      sanitizeCsvCell(entry.sentiment || 'neutral'),
      sanitizeCsvCell(entry.sentimentScore !== undefined ? entry.sentimentScore : 0),
      sanitizeCsvCell(themesFormatted),
      sanitizeCsvCell(entry.summary || ''),
      sanitizeCsvCell(actionItemsFormatted),
      sanitizeCsvCell(entry.imageUrl ? 'Yes' : 'No'),
      sanitizeCsvCell(entry.content || '')
    ].join(',');
  });

  // UTF-8 BOM for Microsoft Excel / Sheets compatibility
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  link.href = url;
  link.setAttribute('download', `${filenamePrefix}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports journal entries to a formatted, multi-page PDF document.
 */
export function exportEntriesToPdf(
  entries: JournalEntry[],
  filenamePrefix = 'aura_journal_backup',
  onError?: (err: string) => void
): boolean {
  if (!entries || entries.length === 0) {
    if (onError) onError('No journal entries available to export.');
    return false;
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  const checkPageBreak = (neededHeight: number) => {
    if (cursorY + neededHeight > pageHeight - margin) {
      doc.addPage();
      cursorY = margin;
      return true;
    }
    return false;
  };

  // Header - Aura Journal Branding
  doc.setFillColor(15, 17, 21); // #0F1115
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('AURA JOURNAL', margin, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(160, 165, 185);
  doc.text('Personal Journal Archive & Local Backup', margin, 20);

  const exportDateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  doc.text(`Generated: ${exportDateStr} | Total Logs: ${entries.length}`, pageWidth - margin, 17, { align: 'right' });

  cursorY = 36;

  // Render each entry
  entries.forEach((entry, index) => {
    // Check if we need room for entry header block
    checkPageBreak(35);

    // Entry separator divider if not first
    if (index > 0) {
      doc.setDrawColor(220, 225, 235);
      doc.setLineWidth(0.3);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 6;
    }

    // Date & Entry Index Tag
    const entryDate = entry.date ? new Date(entry.date).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : 'Undated Entry';

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(110, 115, 135);
    doc.text(`ENTRY #${index + 1}  •  ${entryDate.toUpperCase()}`, margin, cursorY);
    cursorY += 5;

    // Title
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(25, 30, 45);
    const titleLines = doc.splitTextToSize(entry.title || 'Untitled Reflection', contentWidth);
    doc.text(titleLines, margin, cursorY);
    cursorY += titleLines.length * 5.5 + 2;

    // Badges: Mood, Sentiment, Themes
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 85, 105);

    const moodTag = `Mood: ${entry.mood || 'Reflective'}`;
    const sentimentTag = `Sentiment: ${entry.sentiment || 'neutral'} (${entry.sentimentScore !== undefined ? entry.sentimentScore.toFixed(2) : '0.00'})`;
    const themesTag = entry.themes && entry.themes.length > 0 ? `Themes: ${entry.themes.join(', ')}` : '';
    const badgeText = [moodTag, sentimentTag, themesTag].filter(Boolean).join('  |  ');
    doc.text(badgeText, margin, cursorY);
    cursorY += 6;

    // Summary Quote Block if available
    if (entry.summary) {
      checkPageBreak(18);
      doc.setFillColor(245, 246, 250);
      doc.setDrawColor(123, 97, 255); // Purple accent bar
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(60, 65, 80);

      const summaryLines = doc.splitTextToSize(`"${entry.summary}"`, contentWidth - 10);
      const boxHeight = summaryLines.length * 4.5 + 5;

      doc.rect(margin, cursorY, contentWidth, boxHeight, 'F');
      doc.setLineWidth(1.2);
      doc.line(margin, cursorY, margin, cursorY + boxHeight); // left accent border

      doc.text(summaryLines, margin + 5, cursorY + 4.5);
      cursorY += boxHeight + 4;
    }

    // Reflection Content
    if (entry.content) {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 45, 60);

      const contentLines = doc.splitTextToSize(entry.content, contentWidth);
      
      // Print lines with page-break awareness
      contentLines.forEach((line: string) => {
        checkPageBreak(5);
        doc.text(line, margin, cursorY);
        cursorY += 4.5;
      });
      cursorY += 3;
    }

    // Action Items Checklist if present
    if (entry.actionItems && entry.actionItems.length > 0) {
      checkPageBreak(15);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(90, 95, 115);
      doc.text('Action Items & Commitments:', margin, cursorY);
      cursorY += 4.5;

      doc.setFont('helvetica', 'normal');
      entry.actionItems.forEach((item) => {
        checkPageBreak(5);
        const checkMark = item.completed ? '[X]' : '[ ]';
        const itemLine = `${checkMark}  ${item.text}${item.dueDate ? ` (Due: ${item.dueDate})` : ''}`;
        const actionLines = doc.splitTextToSize(itemLine, contentWidth - 6);
        doc.text(actionLines, margin + 3, cursorY);
        cursorY += actionLines.length * 4.2;
      });
      cursorY += 2;
    }

    // Photo indicator if present
    if (entry.imageUrl) {
      checkPageBreak(6);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(120, 125, 140);
      doc.text('[Photo Attached in Digital Archive]', margin, cursorY);
      cursorY += 5;
    }

    cursorY += 6; // Extra space after entry
  });

  // Footer: Add page numbers to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 155, 170);
    doc.text(
      `Page ${i} of ${totalPages}  •  Aura Journal Local Backup`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`${filenamePrefix}_${dateStr}.pdf`);
}
