import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Zap, X } from 'lucide-react';
import { fetchCabinets, submitRecordsBatch } from '../services/googleSheets';
import { isSpecialSchedule } from './KhungGioSelector';
import { CONFIG } from '../config/constants';
import { rowShiftDate } from '../utils/shiftDate';
import { formatDecimal } from './MonthlyChartModule';

const pad2 = (n) => String(n).padStart(2, '0');

const SLOTS6 = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const SLOTS2 = ['Sáng', 'Chiều'];
const SLOT_LABEL = { L1: 'L1 7H', L2: 'L2 11H', L3: 'L3 15H', L4: 'L4 19H', L5: 'L5 23H', L6: 'L6 3H', Sáng: 'Sáng', Chiều: 'Chiều' };
// Giờ đo mặc định của từng khung (đổi được ở đầu cột)
const DEFAULT_SLOT_TIME = {
  L1: '07:00', L2: '11:00', L3: '15:00', L4: '19:00', L5: '23:00', L6: '03:00',
  Sáng: '07:30', Chiều: '15:30',
};

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

/**
 * Thời điểm đo cho ngày CA `day` (1-31) của tháng `ym` ("yyyy-mm"), khung `slot`, giờ `hhmm` ("HH:MM").
 * L5/L6 chọn giờ trước 7h sáng => đo vào sáng hôm SAU (vẫn tính cho ngày ca `day`).
 */
function slotDate(ym, day, slot, hhmm) {
  const [y, m] = ym.split('-').map(Number);
  const [hh, mi] = String(hhmm || DEFAULT_SLOT_TIME[slot]).split(':').map(Number);
  const nextDay = (slot === 'L5' || slot === 'L6') && hh < 7 ? 1 : 0;
  return new Date(y, m - 1, day + nextDay, hh || 0, mi || 0, 0);
}

export default function QuickEntryModal({
  onClose,
  onSaved,
  usersList = [],
  currentUser,
  existingRows = [],
}) {
  const now = new Date();
  const [cabinets, setCabinets] = useState([]);
  const [loadingCab, setLoadingCab] = useState(true);
  const [cabId, setCabId] = useState('');
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [staffId, setStaffId] = useState(currentUser?.id || '');
  const [autoNeg, setAutoNeg] = useState(false);
  const [ghiChu, setGhiChu] = useState('Nhập nhanh (ghi bù)');
  const [values, setValues] = useState({}); // key `${day}|${slot}|t` hoặc `|h`
  const [slotTimes, setSlotTimes] = useState({ ...DEFAULT_SLOT_TIME }); // giờ đo của từng khung
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef({});

  useEffect(() => {
    fetchCabinets()
      .then((list) => setCabinets(list.filter((c) => c.id || c.ten)))
      .catch((e) => setError('Không tải được danh sách tủ: ' + e.message))
      .finally(() => setLoadingCab(false));
  }, []);

  const cab = useMemo(() => cabinets.find((c) => String(c.id) === String(cabId)) || null, [cabinets, cabId]);
  const use6 = cab ? isSpecialSchedule(cab.ten, cab.nhiet_do_min, cab.nhiet_do_max) : false;
  const slots = use6 ? SLOTS6 : SLOTS2;
  const isRoom = !!cab && CONFIG.humidityRoomNames.some((n) => n === String(cab.ten || '').trim().toLowerCase());

  // Tủ âm: bật sẵn "tự thêm dấu âm"
  useEffect(() => {
    if (!cab) return;
    setAutoNeg(toNumber(cab.nhiet_do_max) < 0);
    setValues({});
  }, [cabId]);

  const daysInMonth = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return y && m ? new Date(y, m, 0).getDate() : 0;
  }, [month]);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Bản ghi đã có của tủ trong tháng: key `${day}|${slot}`
  const existing = useMemo(() => {
    const map = {};
    if (!cab) return map;
    const [y, m] = month.split('-').map(Number);
    const norm = (v) => String(v || '').normalize('NFC').trim().toLowerCase();
    const t = norm(cab.ten);
    const id = norm(cab.id);
    existingRows.forEach((r) => {
      if (!((t && (norm(r.ten) === t || norm(r.id_tu) === t)) || (id && norm(r.id_tu) === id))) return;
      const d = rowShiftDate(r);
      if (!d || d.getFullYear() !== y || d.getMonth() + 1 !== m) return;
      const key = `${d.getDate()}|${String(r.khung_h || '').trim()}`;
      if (!map[key]) map[key] = r;
    });
    return map;
  }, [existingRows, cab, month]);

  const effTemp = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (autoNeg && !s.startsWith('-') && toNumber(s) !== 0) return '-' + s;
    return s;
  };

  const cellStatus = (tempRaw, humRaw) => {
    if (!cab) return '';
    const t = checkRange(toNumber(effTemp(tempRaw)), toNumber(cab.nhiet_do_min), toNumber(cab.nhiet_do_max));
    if (!t || t !== 'ĐẠT') return t;
    if (isRoom && String(humRaw ?? '').trim() !== '') {
      const h = checkRange(
        toNumber(humRaw),
        isNaN(toNumber(cab.do_am_min)) ? 0 : toNumber(cab.do_am_min),
        isNaN(toNumber(cab.do_am_max)) ? 100 : toNumber(cab.do_am_max)
      );
      if (h && h !== 'ĐẠT') return h;
    }
    return 'ĐẠT';
  };

  // Danh sách ô đã nhập (hợp lệ để lưu)
  const pending = useMemo(() => {
    const list = [];
    days.forEach((d) => {
      slots.forEach((s) => {
        const tRaw = values[`${d}|${s}|t`];
        if (String(tRaw ?? '').trim() === '') return;
        list.push({ day: d, slot: s, tRaw, hRaw: values[`${d}|${s}|h`] || '' });
      });
    });
    return list;
  }, [values, days, slots]);

  const invalid = pending.filter((p) => isNaN(toNumber(effTemp(p.tRaw))));

  // Enter: xuống ô cùng cột ở ngày kế tiếp
  const focusNext = (day, slot, field) => {
    for (let d = day + 1; d <= daysInMonth; d++) {
      const el = inputRefs.current[`${d}|${slot}|${field}`];
      if (el) {
        el.focus();
        el.select();
        return;
      }
    }
  };

  const handleSave = async () => {
    setError('');
    if (!cab) return setError('Vui lòng chọn tủ.');
    const staff =
      usersList.find((u) => String(u.id) === String(staffId)) ||
      (currentUser && String(currentUser.id) === String(staffId) ? currentUser : null);
    if (!staff) return setError('Vui lòng chọn nhân viên.');
    if (pending.length === 0) return setError('Chưa nhập ô nào.');
    if (invalid.length) return setError(`Có ${invalid.length} ô không phải số, vui lòng sửa lại.`);
    if (!window.confirm(`Lưu ${pending.length} bản ghi cho "${cab.ten}" vào Google Sheets?`)) return;

    const records = pending.map((p) => ({
      idTu: String(cab.id).trim(),
      tenTu: cab.ten || '',
      viTri: cab.vi_tri || '',
      nhietDoMin: cab.nhiet_do_min ?? '',
      nhietDoMax: cab.nhiet_do_max ?? '',
      nhietDoDoDc: effTemp(p.tRaw),
      doAmMin: isRoom ? cab.do_am_min ?? '' : '',
      doAmMax: isRoom ? cab.do_am_max ?? '' : '',
      doAmDoDc: isRoom ? p.hRaw : '',
      ketQua: cellStatus(p.tRaw, p.hRaw),
      khungH: p.slot,
      ghiChu,
      currentUser: { id: staff.id, name: staff.name },
      measuredAt: slotDate(month, p.day, p.slot, slotTimes[p.slot]),
    }));

    setSaving(true);
    try {
      const n = await submitRecordsBatch(records);
      setValues({});
      if (onSaved) onSaved();
      alert(`Đã lưu ${n} bản ghi vào Google Sheets!`);
    } catch (err) {
      setError(err.message || 'Lỗi khi lưu.');
    } finally {
      setSaving(false);
    }
  };

  const ctl =
    'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
  const statusColor = (st) =>
    st === 'ĐẠT' ? 'border-emerald-300 bg-emerald-50' : st === 'THẤP' ? 'border-cyan-400 bg-cyan-50' : st === 'CAO' ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Zap className="h-4 w-4 text-amber-500" />
            Nhập nhanh theo tháng
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Đóng">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">Tủ / Phòng *</label>
            <select value={cabId} onChange={(e) => setCabId(e.target.value)} className={ctl} disabled={loadingCab}>
              <option value="">{loadingCab ? 'Đang tải danh sách tủ...' : '-- Chọn tủ --'}</option>
              {cabinets.map((c) => (
                <option key={c.id} value={c.id}>{c.ten || c.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tháng *</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={ctl} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Nhân viên *</label>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={ctl}>
              <option value="">-- Chọn nhân viên --</option>
              {usersList.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.id} ({u.id})</option>
              ))}
            </select>
          </div>
          {cab && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:col-span-2 lg:col-span-4">
              <span>Ngưỡng: <b>{cab.nhiet_do_min} ~ {cab.nhiet_do_max}°C</b>{isRoom && <> &bull; Độ ẩm: <b>{cab.do_am_min || 0} ~ {cab.do_am_max}%</b></>}</span>
              <label className="flex items-center gap-1.5 font-semibold">
                <input type="checkbox" checked={autoNeg} onChange={(e) => setAutoNeg(e.target.checked)} />
                Tự thêm dấu âm (gõ 32 → lưu -32)
              </label>
              <label className="flex items-center gap-1.5">
                Ghi chú:
                <input type="text" value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} className="rounded border border-slate-300 px-2 py-0.5 text-[11px]" />
              </label>
            </div>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {!cab ? (
            <p className="py-10 text-center text-sm text-slate-400">Chọn tủ để bắt đầu nhập.</p>
          ) : (
            <>
              <p className="mb-2 text-[11px] text-slate-500">
                Gõ số vào ô trống, <b>Tab</b> sang khung kế bên, <b>Enter</b> xuống ngày kế tiếp. Ô có ✓ là đã có dữ liệu.
                Giờ đo chọn ở đầu mỗi cột{use6 && ' (L5/L6 chọn giờ trước 7h = sáng hôm sau, vẫn tính cho ngày đó)'}.
              </p>
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100">
                  <tr>
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-bold text-slate-700">Ngày</th>
                    {slots.map((s) => (
                      <th key={s} className="border border-slate-200 px-2 py-1.5 font-bold text-slate-700">
                        <div>{SLOT_LABEL[s]}</div>
                        <input
                          type="time"
                          value={slotTimes[s] || ''}
                          onChange={(e) => setSlotTimes((t) => ({ ...t, [s]: e.target.value || DEFAULT_SLOT_TIME[s] }))}
                          className="mt-0.5 w-full rounded border border-slate-300 bg-white px-1 py-0.5 text-[11px] font-semibold text-slate-700"
                          title={`Giờ đo cho khung ${s}`}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-2 py-1 font-bold text-slate-700">{pad2(d)}</td>
                      {slots.map((s) => {
                        const ex = existing[`${d}|${s}`];
                        if (ex) {
                          return (
                            <td key={s} className="border border-slate-200 bg-slate-50 px-2 py-1 text-center text-slate-500" title={`Đã có: ${ex.ngay_h} — ${ex.id_nv}`}>
                              ✓ {formatDecimal(ex.nhiet_do_do_dc)}{isRoom && ex.do_am_do_dc ? ` / ${formatDecimal(ex.do_am_do_dc)}%` : ''}
                              {ex.ket_qua && (
                                <div className={`text-[9px] font-black ${ex.ket_qua === 'ĐẠT' ? 'text-emerald-600' : 'text-rose-500'}`}>{ex.ket_qua}</div>
                              )}
                            </td>
                          );
                        }
                        if (slotDate(month, d, s, slotTimes[s]) > now) {
                          return <td key={s} className="border border-slate-200 bg-slate-50 px-2 py-1 text-center text-slate-300">—</td>;
                        }
                        const tKey = `${d}|${s}|t`;
                        const hKey = `${d}|${s}|h`;
                        const st = cellStatus(values[tKey], values[hKey]);
                        const bad = String(values[tKey] ?? '').trim() !== '' && !st;
                        return (
                          <td key={s} className="border border-slate-200 p-0.5">
                            <div className="flex gap-0.5">
                              <input
                                ref={(el) => (inputRefs.current[tKey] = el)}
                                type="text"
                                inputMode="decimal"
                                value={values[tKey] || ''}
                                onChange={(e) => setValues((v) => ({ ...v, [tKey]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    focusNext(d, s, 't');
                                  }
                                }}
                                placeholder="°C"
                                className={`w-full min-w-[52px] rounded border px-1.5 py-1 text-center text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-400 ${bad ? 'border-rose-500 bg-rose-100' : statusColor(st)}`}
                                title={st ? `${effTemp(values[tKey])}°C — ${st}` : ''}
                              />
                              {isRoom && (
                                <input
                                  ref={(el) => (inputRefs.current[hKey] = el)}
                                  type="text"
                                  inputMode="decimal"
                                  value={values[hKey] || ''}
                                  onChange={(e) => setValues((v) => ({ ...v, [hKey]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      focusNext(d, s, 'h');
                                    }
                                  }}
                                  placeholder="%"
                                  className="w-full min-w-[44px] rounded border border-slate-300 px-1.5 py-1 text-center text-xs font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                              )}
                            </div>
                            {(st || bad) && (
                              <div
                                className={`mt-0.5 text-center text-[9px] font-black leading-none ${
                                  bad ? 'text-rose-700' : st === 'ĐẠT' ? 'text-emerald-600' : st === 'THẤP' ? 'text-cyan-700' : 'text-rose-600'
                                }`}
                              >
                                {bad ? 'SAI SỐ' : `${formatDecimal(effTemp(values[tKey]))}° ${st}`}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <div className="text-xs text-slate-600">
            Đã nhập <b className="text-blue-700">{pending.length}</b> ô
            {invalid.length > 0 && <span className="ml-2 font-bold text-rose-600">({invalid.length} ô không hợp lệ)</span>}
            {error && <span className="ml-3 font-semibold text-rose-600">{error}</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setValues({})} disabled={!pending.length} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40">
              Xóa các ô đã nhập
            </button>
            <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
              Đóng
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !pending.length} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : `Lưu ${pending.length} bản ghi`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
