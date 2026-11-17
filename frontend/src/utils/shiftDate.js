// Quy ước ngày theo CA cho tủ 6 lần đo: một "ngày" bắt đầu từ L1 (7h) tới hết L6 (3h sáng hôm sau).
// => L5 / L6 đo trước 7h sáng thuộc về ngày hôm TRƯỚC.

const NIGHT_SLOTS = ['L5', 'L6'];
export const SHIFT_START_HOUR = 7;

const pad2 = (n) => String(n).padStart(2, '0');

/** Khung giờ này đo lúc `date` có phải tính sang ngày hôm trước không */
export function isPrevDaySlot(khungH, date) {
  const k = String(khungH || '').trim().toUpperCase();
  return NIGHT_SLOTS.includes(k) && date.getHours() < SHIFT_START_HOUR;
}

/** Ngày theo ca (Date lúc 00:00) cho thời điểm đo `date` với khung `khungH` */
export function shiftDateFor(khungH, date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (isPrevDaySlot(khungH, date)) d.setDate(d.getDate() - 1);
  return d;
}

/** dd/mm/yyyy */
export function formatDMY(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function parseDMY(s) {
  const [dd, mm, yyyy] = String(s || '').trim().split(' ')[0].split('/').map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd);
}

function parseDMYHMS(s) {
  const str = String(s || '').trim();
  if (!str) return null;
  const [datePart, timePart] = str.split(' ');
  const base = parseDMY(datePart);
  if (!base) return null;
  if (timePart && timePart.includes(':')) {
    const [hh = 0, mi = 0, ss = 0] = timePart.split(':').map(Number);
    base.setHours(hh, mi, ss);
  } else {
    base.setHours(12, 0, 0); // không có giờ -> coi như giữa ngày
  }
  return base;
}

/**
 * Ngày theo ca của 1 dòng DATA (Date lúc 00:00), hoặc null.
 * - Bản ghi mới: cột `ngay` đã được lùi sẵn -> dùng nguyên.
 * - Bản ghi cũ / tạo từ AppSheet: `ngay` trùng ngày của `ngay_h` mà là L5/L6 trước 7h -> lùi 1 ngày.
 */
export function rowShiftDate(r) {
  const measured = parseDMYHMS(r.ngay_h);
  const ngay = parseDMY(r.ngay);
  if (!measured) return ngay;
  if (!ngay) return shiftDateFor(r.khung_h, measured);

  const sameDay =
    ngay.getFullYear() === measured.getFullYear() &&
    ngay.getMonth() === measured.getMonth() &&
    ngay.getDate() === measured.getDate();
  if (sameDay && isPrevDaySlot(r.khung_h, measured)) {
    const d = new Date(ngay);
    d.setDate(d.getDate() - 1);
    return d;
  }
  return ngay;
}

/** "MM/YYYY" theo ngày ca của dòng, fallback về nam_thang ("YYYY/MM") */
export function rowShiftMonthYear(r) {
  const d = rowShiftDate(r);
  if (d) return `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  if (r.nam_thang && r.nam_thang.includes('/')) {
    const [y, m] = r.nam_thang.trim().split('/');
    if (y && m) return `${m.padStart(2, '0')}/${y}`;
  }
  return '';
}

/** Ngày trong tháng (1-31) theo ca, hoặc null */
export function rowShiftDay(r) {
  const d = rowShiftDate(r);
  return d ? d.getDate() : null;
}
