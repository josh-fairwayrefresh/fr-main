'use strict';

const PDFDocument = require('pdfkit');
const { ButtonReportError } = require('./button_activity_report');

const FIRST_HOUR = 6;
const LAST_HOUR = 21;
const INK = '#52616B';
const MAX_LOCATIONS = 18;
const SERVICE_GREEN = '#2E9E4F';
const SERVICE_OPACITY = 0.22;

function dayDate(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12));
}

function hourLabel(hour) {
  return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

function windowText(report) {
  const format = (day, options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(dayDate(day));
  const first = report.days[0].day;
  const last = report.days[report.days.length - 1].day;
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const dates = first === last ? format(first, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) :
    `${format(first, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })} \u2013 ` +
    format(last, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  return dates;
}

function renderButtonReport(report) {
  if (report.locations.length > MAX_LOCATIONS) {
    throw new ButtonReportError(`More than ${MAX_LOCATIONS} locations exceed the readable legend limit. Choose a shorter range.`, 413);
  }
  const labels = [report.customer.customer_name || report.customer.customer_id, report.course.course_name,
    ...report.locations.map(location => location.label)];
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
    const marker = (series, x, y, color, size = 1) => {
      if (series === 'completed') pdf.circle(x, y, 3.2 * size).fill(color);
      else if (series === 'suspended') pdf.circle(x, y, 3.4 * size).lineWidth(1.15).stroke(color);
      else {
        const r = 3.1 * size;
        pdf.moveTo(x - r, y - r).lineTo(x + r, y + r).moveTo(x - r, y + r).lineTo(x + r, y - r).lineWidth(1.3).stroke(color);
      }
    };
    const colors = new Map(report.locations.map(location => [location.label, location.color]));
    const window = windowText(report);
    const pages = Math.ceil(report.days.length / 12);
    for (let page = 0; page < pages; page++) {
      pdf.addPage();
      const days = report.days.slice(page * 12, page * 12 + 12);
      const title = `${report.customer.customer_name || report.customer.customer_id}: empty attempts and completed button requests`;
      if (pdf.fontSize(15).heightOfString(title, { width: 720 }) > 36 ||
          pdf.fontSize(10).widthOfString(report.course.course_name) > 720) {
        throw new ButtonReportError('Customer or Course name exceeds the readable report heading limit.', 413);
      }
      text(title, 36, 27, 15, { width: 720, lineBreak: true });
      text(report.course.course_name, 36, 64, 10);
      text(window, 36, 80, 8.5, { width: 720 });
      report.locations.forEach((location, index) => {
        const x = 49 + index % 3 * 240, y = 103 + Math.floor(index / 3) * 18;
        if (pdf.fontSize(8).widthOfString(location.label) > 220) {
          throw new ButtonReportError('A location name exceeds the readable legend limit.', 413);
        }
        pdf.rect(x - 3, y, 7, 7).fill(location.color);
        text(location.label, x + 9, y - 0.5, 8, { width: 220 });
      });
      const legendBottom = 107 + Math.ceil(report.locations.length / 3) * 18;
      [['completed', 'Completed'], ['suspended', 'Service suspended'], ['cancelled', 'Cancelled']].forEach(([series, name], index) => {
        const x = 49 + index * 180;
        marker(series, x, legendBottom + 4, INK);
        text(`${name}: ${report.totals[series]}`, x + 9, legendBottom, 8.5);
      });
      pdf.rect(49 + 3 * 180 - 4, legendBottom - 0.5, 9, 9).fillOpacity(SERVICE_OPACITY * 2).fill(SERVICE_GREEN).fillOpacity(1);
      text(`In service: ${report.totals.cart_hours} cart hours`, 49 + 3 * 180 + 9, legendBottom, 8.5);
      const left = 73, right = 755, top = legendBottom + 66, bottom = 540;
      if (bottom - top < 150) throw new ButtonReportError('Report content exceeds the readable page limit. Choose a shorter range.', 413);
      const step = (right - left) / days.length;
      const px = index => left + step * (index + 0.5);
      const py = hour => bottom - (Math.min(LAST_HOUR, Math.max(FIRST_HOUR, hour)) - FIRST_HOUR) / (LAST_HOUR - FIRST_HOUR) * (bottom - top);
      days.forEach((day, index) => {
        if (index % 2 === 0) pdf.rect(left + index * step, top, step, bottom - top).fill('#F5F8FA');
        for (const period of day.service) {
          if (period.end_hour <= FIRST_HOUR || period.start_hour >= LAST_HOUR) continue;
          pdf.rect(left + index * step, py(period.end_hour), step, py(period.start_hour) - py(period.end_hour))
            .fillOpacity(SERVICE_OPACITY).fill(SERVICE_GREEN).fillOpacity(1);
        }
        pdf.moveTo(px(index), top).lineTo(px(index), bottom).lineWidth(0.35).stroke('#E4EAEE');
        if (day.cart_hours !== null) {
          const field = `${day.cart_hours} cart hrs`;
          const width = Math.min(step - 4, pdf.font('Helvetica').fontSize(7).widthOfString(field) + 8);
          pdf.roundedRect(px(index) - width / 2, top - 31, width, 11, 2).fillOpacity(SERVICE_OPACITY * 2).fill(SERVICE_GREEN).fillOpacity(1);
          text(field, px(index) - width / 2, top - 28.5, 7, { width, align: 'center' });
        }
        if (day.completed !== null) {
          const counts = ['completed', 'suspended', 'cancelled'];
          const widths = counts.map(series => 9 + pdf.font('Helvetica').fontSize(7).widthOfString(String(day[series])));
          let x = px(index) - (widths.reduce((sum, width) => sum + width, 0) + 4 * (counts.length - 1)) / 2;
          counts.forEach((series, position) => {
            marker(series, x + 3, top - 10, INK, 0.75);
            text(day[series], x + 8, top - 13, 7);
            x += widths[position] + 4;
          });
        }
        text(new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(dayDate(day.day)),
          px(index) - step / 2, bottom + 7, 7.5, { width: step, align: 'center' });
      });
      for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour++) {
        pdf.moveTo(left, py(hour)).lineTo(right, py(hour)).lineWidth(hour % 3 === 0 ? 0.5 : 0.25).stroke('#D8E0E5');
        text(hourLabel(hour), 29, py(hour) - 3, 7, { width: 39, align: 'right' });
      }
      pdf.rect(left, top, right - left, bottom - top).lineWidth(0.6).stroke('#88969F');
      for (const point of report.points) {
        const index = days.findIndex(day => day.day === point.day);
        if (index >= 0) marker(point.series, px(index), py(point.hour), colors.get(point.label));
      }
      text('Time of day', 36, top - 12, 7);
      if (pages > 1) text(`Page ${page + 1} of ${pages}`, left, bottom + 24, 8, { width: right - left, align: 'center' });
    }
    pdf.end();
  });
}

module.exports = { renderButtonReport, windowText, FIRST_HOUR, LAST_HOUR };
