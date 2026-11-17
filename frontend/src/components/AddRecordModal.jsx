import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { fetchCabinets, submitRecord } from '../services/googleSheets';
import { isSpecialSchedule } from './KhungGioSelector';
import { CONFIG } from '../config/constants';
import { shiftDateFor, formatDMY, rowShiftDate } from '../utils/shiftDate';
import { formatDecimal } from './MonthlyChartModule';

const pad2 = (n) => String(n).padStart(2, '0');
// Giá trị cho <input type="datetime-local">: yyyy-mm-ddThh:mm
const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

const toNumber = (v) => {
  const s = String(v ?? '').trim().replace(',', '.');
  return s === '' ? NaN : parseFloat(s);
};

const checkRange = (val, min, max) => {
  if (isNaN(val)) return '';
  if (!isNaN(min) && val < min) return 'THẤP';
  if (!isNaN(max) && val > max) return 'CAO';
  return 'ĐẠT';
};

// Khung giờ mặc định theo giờ đo
function slotForHour(hr, use6Slots) {
  if (use6Slots) {
    if (hr >= 7 && hr < 11) return 'L1';
    if (hr >= 11 && hr < 15) return 'L2';
    if (hr >= 15 && hr < 19) return 'L3';
    if (hr >= 19 && hr < 23) return 'L4';
    if (hr >= 23 || hr < 3) return 'L5';
    return 'L6';
  }
  return hr >= 12 ? 'Chiều' : 'Sáng';
}

const SLOTS6 = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const SLOTS6_LABEL = { L1: 'L1 7H', L2: 'L2 11H', L3: 'L3 15H', L4: 'L4 19H', L5: 'L5 23H', L6: 'L6 3H' };
const SLOTS2 = ['Sáng', 'Chiều'];

export default function AddRecordModal({
  onClose,
  onSaved,
  usersList = [],
  currentUser,
  existingRows = [],
  getStaffDisplayName,
}) {
  const [cabinets, setCabinets] = useState([]);
  const [loadingCab, setLoadingCab] = useState(true);

  const [cabId, setCabId] = useState('');
  const [staffId, setStaffId] = useState(currentUser?.id || '');
  const [dateTime, setDateTime] = useState(toLocalInput(new Date()));
  const [khungH, setKhungH] = useState('');
  const [temp, setTemp] = useState('');
  const [hum, setHum] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCabinets()
      .then((list) => setCabinets(list.filter((c) => c.id || c.ten)))
      .catch((e) => setError('Không tải được danh sách tủ: ' + e.message))
      .finally(() => setLoadingCab(false));
  }, []);

  const cab = useMemo(
    () => cabinets.find((c) => String(c.id) === String(cabId)) || null,
    [cabinets, cabId]
  );
  const use6Slots = cab ? isSpecialSchedule(cab.ten, cab.nhiet_do_min, cab.nhiet_do_max) : false;
  const slotOptions = use6Slots ? SLOTS6 : SLOTS2;
  const showHumidity =
    !!cab &&
    CONFIG.humidityRoomNames.some((n) => n === String(cab.ten || '').trim().toLowerCase());

  const measuredAt = useMemo(() => {
    const d = new Date(dateTime);
    return isNaN(d) ? null : d;
  }, [dateTime]);

  // Tự chọn khung giờ theo giờ đo khi đổi tủ / đổi giờ
  useEffect(() => {
    if (!cab || !measuredAt) return;
    setKhungH(slotForHour(measuredAt.getHours(), use6Slots));
  }, [cabId, dateTime, use6Slots]);

  const nhietStatus = cab
    ? checkRange(toNumber(temp), toNumber(cab.nhiet_do_min), toNumber(cab.nhiet_do_max))
    : '';
  const doAmStatus =
    showHumidity && String(hum).trim() !== ''
      ? checkRange(
          toNumber(hum),
          isNaN(toNumber(cab.do_am_min)) ? 0 : toNumber(cab.do_am_min),
          isNaN(toNumber(cab.do_am_max)) ? 100 : toNumber(cab.do_am_max)
        )
      : '';
  const ketQua = !nhietStatus
    ? ''
    : nhietStatus !== 'ĐẠT'
      ? nhietStatus
      : doAmStatus && doAmStatus !== 'ĐẠT'
        ? doAmStatus
        : 'ĐẠT';

  const shiftDayText =
    measuredAt && khungH ? formatDMY(shiftDateFor(khungH, measuredAt)) : '';

  // ===== Kiểm tra đã chấm chưa: các bản ghi của tủ này theo ngày CA =====
  const norm = (v) => String(v || '').normalize('NFC').trim().toLowerCase();
  const cabRows = useMemo(() => {
    if (!cab) return [];
    const t = norm(cab.ten);
    const id = norm(cab.id);
    return existingRows.filter(
      (r) => (t && (norm(r.ten) === t || norm(r.id_tu) === t)) || (id && norm(r.id_tu) === id)
    );
  }, [existingRows, cab]);

  // Ngày CA đang xét = ngày ca của khung đang chọn (L5/L6 trước 7h -> hôm trước)
  const targetDay = measuredAt ? formatDMY(shiftDateFor(khungH, measuredAt)) : '';
  const recordsBySlot = useMemo(() => {
    const map = {};
    if (!targetDay) return map;
    const day = targetDay;
    slotOptions.forEach((s) => {
      map[s] = cabRows.filter((r) => {
        const d = rowShiftDate(r);
        return d && formatDMY(d) === day && String(r.khung_h || '').trim() === s;
      });
    });
    return map;
  }, [cabRows, targetDay, use6Slots]);

  const doneCount = slotOptions.filter((s) => (recordsBySlot[s] || []).length > 0).length;
  const dupRecords = (khungH && recordsBySlot[khungH]) || [];
  const isShifted = measuredAt && shiftDayText && shiftDayText !== formatDMY(measuredAt);

  const tempRaw = String(temp).trim();
  const tempNum = toNumber(temp);
  const showNegHint = tempRaw !== '' && !tempRaw.startsWith('-') && !isNaN(tempNum) && tempNum !== 0;

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    if (!cab) return setError('Vui lòng chọn tủ.');
    if (!measuredAt) return setError('Vui lòng chọn ngày giờ đo.');
    if (measuredAt > new Date()) return setError('Ngày giờ đo không được ở tương lai.');
    if (!khungH) return setError('Vui lòng chọn khung giờ.');
    if (isNaN(tempNum)) return setError('Nhiệt độ phải là số (vd 2,6 hoặc -30).');
    if (showHumidity && String(hum).trim() !== '') {
      const h = toNumber(hum);
      if (isNaN(h) || h < 0 || h > 100) return setError('Độ ẩm phải là số trong khoảng 0 - 100%.');
    }
    const staff =
      usersList.find((u) => String(u.id) === String(staffId)) ||
      (currentUser && String(currentUser.id) === String(staffId) ? currentUser : null);
    if (!staff) return setError('Vui lòng chọn nhân viên.');
    if (
      dupRecords.length > 0 &&
      !window.confirm(
        `Ngày ${shiftDayText} khung ${khungH} đã có ${dupRecords.length} bản ghi. Vẫn lưu thêm bản ghi mới?`
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      await submitRecord({
        idTu: String(cab.id).trim(),
        qrCode: String(cab.id).trim(),
        tenTu: cab.ten || '',
        viTri: cab.vi_tri || '',
        nhietDoMin: cab.nhiet_do_min ?? '',
        nhietDoMax: cab.nhiet_do_max ?? '',
        nhietDoDoDc: temp,
        doAmMin: showHumidity ? cab.do_am_min ?? '' : '',
        doAmMax: showHumidity ? cab.do_am_max ?? '' : '',
        doAmDoDc: showHumidity ? hum : '',
        ketQua,
        khungH,
        ghiChu,
        chuKy: '',
        currentUser: { id: staff.id, name: staff.name },
        measuredAt,
      });
      if (onSaved) onSaved();
      alert('Đã thêm bản ghi vào Google Sheets!');
      onClose();
    } catch (err) {
      setError(err.message || 'Lỗi khi lưu.');
    } finally {
      setSaving(false);
    }
  };

  const label = 'mb-1 block text-xs font-bold text-slate-600';
  const input =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSave}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl animate-fade-in-up"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Plus className="h-4 w-4 text-blue-600" />
            Thêm bản ghi nhiệt độ
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className={label}>Tủ / Phòng *</label>
            <select value={cabId} onChange={(e) => setCabId(e.target.value)} className={input} disabled={loadingCab}>
              <option value="">{loadingCab ? 'Đang tải danh sách tủ...' : '-- Chọn tủ --'}</option>
              {cabinets.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ten || c.id}
                </option>
              ))}
            </select>
            {cab && (
              <p className="mt-1 text-[11px] text-slate-500">
                Vị trí: <b>{cab.vi_tri || '—'}</b> &bull; Ngưỡng: <b>{cab.nhiet_do_min} ~ {cab.nhiet_do_max}°C</b>
                {showHumidity && (
                  <>
                    {' '}&bull; Độ ẩm: <b>{cab.do_am_min || 0} ~ {cab.do_am_max}%</b>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Ngày giờ đo *</label>
              <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Nhân viên *</label>
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={input}>
                <option value="">-- Chọn nhân viên --</option>
                {usersList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.id} ({u.id})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Khung giờ *</label>
            <div className={`grid gap-2 ${use6Slots ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {slotOptions.map((s) => {
                const done = (recordsBySlot[s] || []).length > 0;
                const selected = khungH === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setKhungH(s)}
                    disabled={!cab}
                    title={done ? 'Khung này đã có bản ghi' : ''}
                    className={`rounded-lg px-2 py-2 text-xs font-bold transition ${
                      done ? 'border-2 border-rose-500' : 'border'
                    } ${
                      selected
                        ? `bg-blue-600 text-white ${done ? '' : 'border-blue-600'}`
                        : `bg-white text-slate-600 hover:bg-blue-50 ${done ? '' : 'border-slate-200'}`
                    } disabled:opacity-40`}
                  >
                    {use6Slots ? SLOTS6_LABEL[s] : s}
                    {done ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>
            {cab && measuredAt && (
              <p className={`mt-1 text-[11px] font-semibold ${doneCount ? 'text-rose-600' : 'text-emerald-700'}`}>
                {doneCount
                  ? `Ngày ${targetDay} đã chấm ${doneCount}/${slotOptions.length} khung (viền đỏ ✓).`
                  : `Ngày ${targetDay} chưa có bản ghi nào cho tủ này.`}
              </p>
            )}
            {dupRecords.length > 0 && (
              <div className="mt-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
                <b>⚠ Khung {khungH} ngày {shiftDayText} đã được chấm:</b>
                <ul className="mt-1 list-disc pl-4">
                  {dupRecords.slice(0, 3).map((r, i) => (
                    <li key={i}>
                      {formatDecimal(r.nhiet_do_do_dc)}°C lúc {r.ngay_h} —{' '}
                      {getStaffDisplayName ? getStaffDisplayName(r.id_nv) : r.id_nv}
                    </li>
                  ))}
                </ul>
                Lưu thêm sẽ tạo bản ghi trùng.
              </div>
            )}
            {isShifted && (
              <p className="mt-1 text-[11px] font-semibold text-amber-700">
                {khungH} đo trước 7h sáng nên được tính cho ngày {shiftDayText}.
              </p>
            )}
          </div>

          <div className={`grid gap-3 ${showHumidity ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className={label}>Nhiệt độ đo được (°C) *</label>
              <input type="text" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} className={input} placeholder="vd 2,6 hoặc -30" />
              {showNegHint && (
                <button
                  type="button"
                  onClick={() => setTemp(`-${tempRaw}`)}
                  className="mt-1 w-full rounded-md border border-sky-300 bg-white py-1 text-xs font-bold text-sky-700 hover:bg-sky-50"
                >
                  Gợi ý: -{tempRaw}
                </button>
              )}
            </div>
            {showHumidity && (
              <div>
                <label className={label}>Độ ẩm đo được (%)</label>
                <input type="text" inputMode="decimal" value={hum} onChange={(e) => setHum(e.target.value)} className={input} placeholder="vd 55,5" />
              </div>
            )}
          </div>

          <div>
            <label className={label}>Ghi chú</label>
            <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className={input} placeholder="vd Ghi bù do quên chấm" />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
            <span className="font-semibold text-slate-600">Kết quả (tự động):</span>
            <span
              className={`font-black ${
                ketQua === 'ĐẠT' ? 'text-emerald-600' : ketQua === 'THẤP' ? 'text-cyan-700' : ketQua === 'CAO' ? 'text-rose-600' : 'text-slate-400'
              }`}
            >
              {ketQua || '-'}
            </span>
          </div>
        </div>

        {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{error}</div>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
            Hủy
          </button>
          <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Đang lưu...' : 'Lưu vào Google Sheets'}
          </button>
        </div>
      </form>
    </div>
  );
}
