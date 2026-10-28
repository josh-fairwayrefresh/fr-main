'use strict';

const PDFDocument = require('pdfkit');
const { ButtonReportError } = require('./button_activity_report');

function renderButtonReport(report) {
  if (report.devices.length > 18) throw new ButtonReportError('More than 18 devices exceed the readable legend limit. Choose a shorter range.', 413);
  const labels = [report.customer.customer_name || report.customer.customer_id, report.course.course_name,
    ...report.devices.map(device => device.label)];
  if (labels.some(label => typeof label !== 'string' ||
      /[^\u0020-\u007e\u00a0-\u00ff\u2013-\u2014\u2018-\u2019\u201c-\u201d]/.test(label))) {
    throw new ButtonReportError('A report name contains characters unsupported by the PDF font. No PDF was generated.', 422);
  }
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 36, autoFirstPage: false,
      info: { Title: 'Button Activity Report', Subject: `${report.customer.customer_name} / ${report.course.course_name}` } });
    const buffers = [];
    pdf.on('data', chunk => buffers.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(buffers)));
    pdf.on('error', reject);
    const text = (value, x, y, size = 8, options = {}) => {
      pdf.font('Helvetica').fontSize(size).fillColor('#253238').text(String(value), x, y, { lineBreak: false, ...options });
    };
    const localBoundary = value => new Intl.DateTimeFormat('en-US', { timeZone: report.course.timezone,
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3,
      timeZoneName: 'short' }).format(new Date(value));
    const pages = Math.ceil(report.days.length / 12);
    for (let page = 0; page < pages; page++) {
      pdf.addPage();
      const days = report.days.slice(page * 12, page * 12 + 12);
      const title = `${report.customer.customer_name || report.customer.customer_id}: empty attempts and completed button requests`;
      const courseTitle = `${report.course.course_name} | ${report.course.timezone} | Plotted at server receipt time`;
      if (pdf.fontSize(15).heightOfString(title, { width: 720 }) > 36 ||
          pdf.fontSize(9).widthOfString(courseTitle) > 720) {
        throw new ButtonReportError('Customer or Course name exceeds the readable report heading limit.', 413);
      }
      text(title, 36, 27, 15, { width: 720, lineBreak: true });
      text(courseTitle, 36, 65, 9);
      const window = `Window: ${localBoundary(report.start)} to ${localBoundary(report.end)} ${report.end_exclusive ? '(end exclusive)' : '(inclusive)'} | As of: ${localBoundary(report.as_of)}`;
      text(window, 36, 80, 7.5, { width: 720, lineBreak: true });
      const devices = new Map(report.devices.map(device => [device.device_id, device]));
      report.devices.forEach((device, index) => {
        const x = 49 + index % 3 * 240, y = 103 + Math.floor(index / 3) * 21;
        if (pdf.fontSize(7.5).heightOfString(device.label, { width: 220 }) > 20) {
          throw new ButtonReportError('A device label exceeds the readable legend limit.', 413);
        }
        pdf.circle(x, y + 3, 2.5).fill(device.color);
        text(device.label, x + 8, y - 2, 7.5, { width: 220, height: 21, lineBreak: true });
      });
      const legendBottom = 107 + Math.ceil(report.devices.length / 3) * 21;
      pdf.circle(49, legendBottom + 3, 2.2).fill('#52616B');
      text(`Empty: ${report.totals.empty} observed rejection attempts (retries included)`, 59, legendBottom - 1, 8);
      pdf.circle(406, legendBottom + 3, 4).lineWidth(1.2).stroke('#52616B');
      text(`Completed: ${report.totals.completed} completed requests`, 417, legendBottom - 1, 8);
      text('Daily counts: empty / completed; N/A = unavailable; * = partial retained coverage', 36, legendBottom + 16, 7);
      const notes = [
        `Retained log window begins ${localBoundary(report.retention_start)}. Coverage: ${report.coverage}. Zero means no observed matching records, not proof of no pushes.`,
        ...report.notes,
      ].join(' ');
      const notesHeight = pdf.fontSize(7).heightOfString(notes, { width: 720, lineGap: 1.5 });
      const left = 73, right = 755, top = legendBottom + 61, bottom = Math.min(457, 576 - notesHeight - 42);
      if (bottom - top < 150) throw new ButtonReportError('Report content exceeds the readable page limit. Choose a shorter range.', 413);
      const step = (right - left) / days.length;
      const px = index => left + step * (index + 0.5);
      const py = hour => bottom - hour / 24 * (bottom - top);
      days.forEach((day, index) => {
        if (index % 2 === 0) pdf.rect(left + index * step, top, step, bottom - top).fill('#F5F8FA');
        pdf.moveTo(px(index), top).lineTo(px(index), bottom).lineWidth(0.35).stroke('#E4EAEE');
        text(`${day.empty ?? 'N/A'}${day.coverage === 'partial' ? '*' : ''} / ${day.completed ?? 'N/A'}`,
          px(index) - step / 2, top - 15, 8, { width: step, align: 'center' });
        text(day.day.slice(5), px(index) - step / 2, bottom + 7, 8, { width: step, align: 'center' });
      });
      for (let hour = 0; hour <= 24; hour += 2) {
        pdf.moveTo(left, py(hour)).lineTo(right, py(hour)).lineWidth(0.4).stroke('#D8E0E5');
        const label = hour === 24 ? 'Midnight' : `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
        text(label, 29, py(hour) - 3, 7, { width: 39, align: 'right' });
      }
      pdf.rect(left, top, right - left, bottom - top).lineWidth(0.6).stroke('#88969F');
      for (const point of report.points) {
        const index = days.findIndex(day => day.day === point.day);
        if (index < 0) continue;
        const color = devices.get(point.device_id).color;
        if (point.series === 'empty') {
          pdf.circle(px(index), py(point.hour), 2.15).fillOpacity(0.7).fill(color).fillOpacity(1);
        } else {
          pdf.circle(px(index), py(point.hour), 4).lineWidth(1.15).stroke(color);
        }
      }
      text(`Date | Page ${page + 1}/${pages} (totals cover the entire selected window)`, 73, bottom + 23, 8, { width: 682, align: 'center' });
      text(notes, 36, bottom + 42, 7, { width: 720, lineBreak: true, lineGap: 1.5 });
      text('Time of day (local)', 36, top - 29, 7);
    }
    pdf.end();
  });
}

module.exports = { renderButtonReport };
