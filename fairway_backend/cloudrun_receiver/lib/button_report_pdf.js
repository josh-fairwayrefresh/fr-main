'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { ButtonReportError } = require('./button_activity_report');

const FIRST_HOUR = 6;
const LAST_HOUR = 21;
const INK = '#52616B';
const MAX_LOCATIONS = 18;
const SERVICE_GREEN = '#2E9E4F';
const SERVICE_OPACITY = 0.22;
const RAIN_BLUE = '#2F7FC1';
// Trimmed from docs/logo_source_files/fairway-refresh/fairway-refresh-horizontal-transparent.png.
const LOGO = fs.readFileSync(path.join(__dirname, '..', 'assets', 'fairway-refresh-report-logo.png'));
const LOGO_WIDTH = 150;
const TITLE_WIDTH = 560;
const REPORT_TITLE = 'Cart Request Performance Report';
const SALES_HOUR = 20;

function dayDate(day) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date, 12));
}

function currency(minor) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(minor / 100);
}

function hoursText(hours) {
  return Number(hours).toFixed(1);
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
      info: { Title: REPORT_TITLE, Subject: `${report.customer.customer_name} / ${report.course.course_name}` } });
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
    const drop = (x, y, scale = 1) => {
      pdf.circle(x, y, 2.6 * scale).fill(RAIN_BLUE);
      pdf.polygon([x - 2.25 * scale, y - 1.3 * scale], [x + 2.25 * scale, y - 1.3 * scale], [x, y - 5.8 * scale]).fill(RAIN_BLUE);
    };
    const colors = new Map(report.locations.map(location => [location.label, location.color]));
    const window = windowText(report);
    // Every range (up to 31 dates) fits one page; column labels shorten as columns narrow.
    pdf.addPage();
    const days = report.days;
    const subtitle = `${report.customer.customer_name || report.customer.customer_id}  \u00b7  ${report.course.course_name}  \u00b7  ${window}`;
    if (pdf.font('Helvetica').fontSize(10.5).widthOfString(subtitle) > 720) {
      throw new ButtonReportError('Customer or Course name exceeds the readable report heading limit.', 413);
    }
    const NAVY = '#1F3A4D', MUTED = '#6B7A84', RULE = '#C9D3D9';
    const caps = (value, x, y, size, options = {}) => pdf.font('Helvetica-Bold').fontSize(size).fillColor(MUTED)
      .text(value.toUpperCase(), x, y, { lineBreak: false, characterSpacing: 0.6, ...options });
    // Header: title, subtitle and a hairline rule.
    pdf.font('Helvetica-Bold').fontSize(17).fillColor(NAVY).text(REPORT_TITLE, 36, 30, { width: TITLE_WIDTH, lineBreak: false });
    pdf.image(LOGO, 756 - LOGO_WIDTH, 24, { width: LOGO_WIDTH });
    pdf.font('Helvetica').fontSize(10.5).fillColor(MUTED)
      .text(subtitle, 36, 53, { lineBreak: false });
    pdf.moveTo(36, 74).lineTo(756, 74).lineWidth(0.8).stroke(NAVY);
    // Primary legend: what each mark means, with range totals.
    const keyTop = 88, cellWidth = 118;
    const tiles = [['completed', 'Completed'], ['suspended', 'Service suspended'], ['cancelled', 'Cancelled'], ['service', 'Cart hours in service']];
    tiles.forEach(([series, name], index) => {
      const x = 36 + index * cellWidth;
      if (index) pdf.moveTo(x - 8, keyTop + 2).lineTo(x - 8, keyTop + 46).lineWidth(0.5).stroke(RULE);
      if (series === 'service') {
        pdf.rect(x, keyTop + 7, 20, 20).fillOpacity(SERVICE_OPACITY * 2).fill(SERVICE_GREEN).fillOpacity(1);
      } else marker(series, x + 10, keyTop + 17, NAVY, 2.6);
      const value = series === 'service' ? hoursText(report.totals.cart_hours) : report.totals[series];
      pdf.font('Helvetica-Bold').fontSize(24).fillColor(NAVY).text(String(value), x + 28, keyTop + 6, { lineBreak: false });
      caps(name, x, keyTop + 37, 7.5, { width: cellWidth - 14 });
    });
    // Compact location key, grouped in a light panel.
    const keyX = 36 + 4 * cellWidth + 4, keyWidth = 756 - keyX;
    const columns = report.locations.length > 12 ? 3 : 2;
    const columnWidth = (keyWidth - 16) / columns;
    const rows = Math.max(1, Math.ceil(report.locations.length / columns));
    const panelHeight = 20 + rows * 10.5;
    pdf.roundedRect(keyX, keyTop - 4, keyWidth, panelHeight, 3).fill('#F4F7F9');
    caps('Button location', keyX + 8, keyTop + 1, 6.5);
    report.locations.forEach((location, index) => {
      const column = Math.floor(index / rows), row = index % rows;
      const x = keyX + 8 + column * columnWidth, y = keyTop + 14 + row * 10.5;
      if (pdf.fontSize(7.5).widthOfString(location.label) > columnWidth - 14) {
        throw new ButtonReportError('A location name exceeds the readable legend limit.', 413);
      }
      pdf.circle(x + 3, y + 3.2, 3).fill(location.color);
      text(location.label, x + 10, y, 7.5, { width: columnWidth - 12 });
    });
    const legendBottom = Math.max(keyTop + 52, keyTop - 4 + panelHeight) + 8;
    pdf.moveTo(36, legendBottom - 2).lineTo(756, legendBottom - 2).lineWidth(0.5).stroke(RULE);
    const left = 73, right = 755, bottom = 540;
    const step = (right - left) / days.length;
    const width = (value, size = 7, font = 'Helvetica') => pdf.font(font).fontSize(size).widthOfString(String(value));
    const counts = ['completed', 'suspended', 'cancelled'];
    const countWidth = day => counts.reduce((sum, series) => sum + 9 + width(day[series]), 0) + 4 * (counts.length - 1);
    const stacked = days.some(day => day.completed !== null && countWidth(day) > step - 4);
    const extra = stacked ? 18 : 0;
    const top = legendBottom + (report.weather_available ? 62 : 48) + extra;
    if (bottom - top < 150) throw new ButtonReportError('Report content exceeds the readable page limit. Choose a shorter range.', 413);
    const px = index => left + step * (index + 0.5);
    const py = hour => bottom - (Math.min(LAST_HOUR, Math.max(FIRST_HOUR, hour)) - FIRST_HOUR) / (LAST_HOUR - FIRST_HOUR) * (bottom - top);
    // Label formats are chosen once per page so every column reads the same way.
    const shown = days.filter(day => day.cart_hours !== null);
    const hoursLabel = [value => `${value} cart hrs`, value => `${value} hrs`, value => value]
      .find(format => shown.every(day => width(format(hoursText(day.cart_hours))) + 8 <= step - 2)) || (value => value);
    const temperature = day => day.weather ? Math.round(day.weather.avg_f) : null;
    const tempLabel = [value => `Avg ${value ?? '\u2014'}${value === null ? '' : '\u00b0F'}`,
      value => value === null ? '\u2014' : `${value}\u00b0F`, value => value === null ? '\u2014' : `${value}\u00b0`]
      .find(format => shown.every(day => width(format(temperature(day))) + (day.weather?.rain ? 9 : 0) <= step - 3)) ||
      (value => value === null ? '\u2014' : `${value}\u00b0`);
    let tempSize = 7;
    while (tempSize > 5 && shown.some(day => width(tempLabel(temperature(day)), tempSize) + (day.weather?.rain ? 7 : 0) > step - 3)) {
      tempSize -= 0.5;
    }
    const dateFormat = options => day => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(dayDate(day.day));
    const longDate = dateFormat({ weekday: 'short', month: 'short', day: 'numeric' });
    const weekday = dateFormat({ weekday: 'short' });
    const shortDate = dateFormat({ month: 'short', day: 'numeric' });
    const numericDate = dateFormat({ month: 'numeric', day: 'numeric' });
    const dateLines = days.every(day => width(longDate(day), 7.5) <= step - 2) ? [longDate] :
      days.every(day => width(shortDate(day), 7) <= step - 2) ? [weekday, shortDate] : [weekday, numericDate];
    days.forEach((day, index) => {
      if (index % 2 === 0) pdf.rect(left + index * step, top, step, bottom - top).fill('#F5F8FA');
      for (const period of day.service) {
        if (period.end_hour <= FIRST_HOUR || period.start_hour >= LAST_HOUR) continue;
        pdf.rect(left + index * step, py(period.end_hour), step, py(period.start_hour) - py(period.end_hour))
          .fillOpacity(SERVICE_OPACITY).fill(SERVICE_GREEN).fillOpacity(1);
      }
      pdf.moveTo(px(index), top).lineTo(px(index), bottom).lineWidth(0.35).stroke('#E4EAEE');
      if (day.cart_hours !== null) {
        const field = hoursLabel(hoursText(day.cart_hours));
        const fieldWidth = Math.min(step - 2, width(field) + 8);
        pdf.roundedRect(px(index) - fieldWidth / 2, top - 31 - extra, fieldWidth, 11, 2)
          .fillOpacity(SERVICE_OPACITY * 2).fill(SERVICE_GREEN).fillOpacity(1);
        text(field, px(index) - fieldWidth / 2, top - 28.5 - extra, 7, { width: fieldWidth, align: 'center' });
      }
      if (report.weather_available && day.cart_hours !== null) {
        const rain = day.weather?.rain ? 9 : 0;
        const high = tempLabel(temperature(day));
        const dropWidth = rain && tempSize < 7 ? 7 : rain;
        const tempWidth = width(high, tempSize) + dropWidth;
        text(high, px(index) - tempWidth / 2, top - 45 - extra + (7 - tempSize) / 2, tempSize);
        if (rain) drop(px(index) + tempWidth / 2 - 3, top - 40.5 - extra, tempSize < 7 ? 0.8 : 1);
      }
      if (day.completed !== null) {
        if (stacked) {
          counts.forEach((series, position) => {
            const rowWidth = 9 + width(day[series]);
            const x = px(index) - rowWidth / 2;
            const y = top - 10 - (counts.length - 1 - position) * 9;
            marker(series, x + 3, y, INK, 0.75);
            text(day[series], x + 8, y - 3, 7);
          });
        } else {
          let x = px(index) - countWidth(day) / 2;
          counts.forEach(series => {
            marker(series, x + 3, top - 10, INK, 0.75);
            text(day[series], x + 8, top - 13, 7);
            x += 9 + width(day[series]) + 4;
          });
        }
      }
      dateLines.forEach((format, line) => {
        text(format(day), px(index) - step / 2, bottom + 7 + line * 9, dateLines.length > 1 ? 7 : 7.5, { width: step, align: 'center' });
      });
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
    // Recorded total sales float in bold, whole dollars, on each day's 8 PM line above markers.
    days.forEach((day, index) => {
      if (!Number.isSafeInteger(day.sales_minor)) return;
      const amount = currency(day.sales_minor);
      let size = 8.5;
      while (size > 5 && width(amount, size, 'Helvetica-Bold') > step - 4) size -= 0.5;
      const amountWidth = width(amount, size, 'Helvetica-Bold') + 4;
      pdf.roundedRect(px(index) - amountWidth / 2, py(SALES_HOUR) - size / 2 - 2, amountWidth, size + 4, 2)
        .fillOpacity(0.85).fill('#FFFFFF').fillOpacity(1);
      pdf.font('Helvetica-Bold').fontSize(size).fillColor('#253238')
        .text(amount, px(index) - amountWidth / 2, py(SALES_HOUR) - size / 2 + 0.5, { width: amountWidth, align: 'center', lineBreak: false });
    });
    text('Time of day', 36, top - 12, 7);
    if (report.weather_available) text('Avg temp', 36, top - 45 - extra, 7);
    pdf.end();
  });
}

module.exports = { renderButtonReport, windowText, FIRST_HOUR, LAST_HOUR };
