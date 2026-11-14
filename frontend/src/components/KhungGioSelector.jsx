import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CONFIG } from '../config/constants';

function normalizeScheduleName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

export function isSpecialSchedule(tenTu, minVal, maxVal) {
  const normalizedName = normalizeScheduleName(tenTu);
  const isNormal = CONFIG.normalScheduleCabinets.some((s) =>
    normalizedName.includes(normalizeScheduleName(s))
  );
  const matchesSpecial = CONFIG.specialCabinets.some((s) =>
    normalizedName.includes(normalizeScheduleName(s))
  );
  const isSpecialName = matchesSpecial && !isNormal;

  const min = parseFloat(String(minVal).replace(',', '.'));
  const max = parseFloat(String(maxVal).replace(',', '.'));
  const isPlasmaRange = !isNaN(min) && !isNaN(max) && min >= -35 && max <= -25;

  return isSpecialName || isPlasmaRange;
}

export function getDefaultKhungGio(tenTu, minVal, maxVal) {
  const hr = new Date().getHours();
  const use6Slots = isSpecialSchedule(tenTu, minVal, maxVal);

  if (use6Slots) {
    if (hr >= 7 && hr < 11) return 'L1';
    if (hr >= 11 && hr < 15) return 'L2';
    if (hr >= 15 && hr < 19) return 'L3';
    if (hr >= 19 && hr < 23) return 'L4';
    if (hr >= 23 || hr < 3) return 'L5';
    return 'L6';
  } else {
    return hr >= 16 ? 'Chiều' : 'Sáng';
  }
}

const MODE_KEY = 'khung_gio_view_mode';

export default function KhungGioSelector({
  tenTu,
  nhietDoMin,
  nhietDoMax,
  selectedSlot,
  onChangeSlot,
  doneSlots = new Set(), // các khung giờ đã ghi trong ngày làm việc hiện tại
}) {
  const use6Slots = isSpecialSchedule(tenTu, nhietDoMin, nhietDoMax);

  // 2 kiểu xem: 'mark' = viền đỏ khung đã chấm (vẫn bấm được), 'hide' = ẩn khung đã chấm
  const [viewMode, setViewModeState] = useState(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'hide' ? 'hide' : 'mark';
    } catch {
      return 'mark';
    }
  });
  const setViewMode = (m) => {
    setViewModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const slots6 = [
    { id: 'L1', label: 'L1 7H' },
    { id: 'L2', label: 'L2 11H' },
    { id: 'L3', label: 'L3 15H' },
    { id: 'L4', label: 'L4 19H' },
    { id: 'L5', label: 'L5 23H' },
    { id: 'L6', label: 'L6 3H' },
  ];

  const slots2 = [
    { id: 'Sáng', label: 'Sáng' },
    { id: 'Chiều', label: 'Chiều' },
  ];

  const activeOptions = use6Slots ? slots6 : slots2;
  const isDone = (id) => doneSlots.has(id);
  const visibleOptions =
    viewMode === 'hide' ? activeOptions.filter((o) => !isDone(o.id)) : activeOptions;
  const doneCount = activeOptions.filter((o) => isDone(o.id)).length;

  // When cabinet change switches between 2-slot and 6-slot, re-align if needed
  useEffect(() => {
    const validIds = activeOptions.map((o) => o.id);
    if (!validIds.includes(selectedSlot)) {
      const defaultSlot = getDefaultKhungGio(tenTu, nhietDoMin, nhietDoMax);
      onChangeSlot(defaultSlot);
    }
  }, [use6Slots, tenTu, nhietDoMin, nhietDoMax]);

  // Kiểu "Ẩn": nếu khung đang chọn đã chấm thì tự chuyển sang khung chưa chấm
  useEffect(() => {
    if (viewMode !== 'hide' || !isDone(selectedSlot)) return;
    const def = getDefaultKhungGio(tenTu, nhietDoMin, nhietDoMax);
    const next = visibleOptions.find((o) => o.id === def) || visibleOptions[0];
    if (next) onChangeSlot(next.id);
  }, [viewMode, selectedSlot, doneSlots, use6Slots]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="block text-sm font-bold text-slate-700">Khung giờ</label>
        <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[10px] font-bold">
          <button
            type="button"
            onClick={() => setViewMode('mark')}
            title="Khung đã chấm có viền đỏ, vẫn bấm được"
            className={`rounded-md px-2 py-1 transition ${
              viewMode === 'mark' ? 'bg-white text-rose-600 shadow-xs' : 'text-slate-500'
            }`}
          >
            Viền đỏ
          </button>
          <button
            type="button"
            onClick={() => setViewMode('hide')}
            title="Ẩn các khung đã chấm"
            className={`rounded-md px-2 py-1 transition ${
              viewMode === 'hide' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-500'
            }`}
          >
            Ẩn đã chấm
          </button>
        </div>
      </div>

      {visibleOptions.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-center text-xs font-bold text-emerald-700">
          Đã chấm đủ {activeOptions.length} khung giờ hôm nay
        </div>
      ) : (
        <div className={`grid gap-2 ${use6Slots ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {visibleOptions.map((opt) => {
            const isSelected = selectedSlot === opt.id;
            const done = isDone(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeSlot(opt.id)}
                title={done ? 'Khung giờ này hôm nay đã chấm' : ''}
                className={`relative flex items-center justify-center gap-1 rounded-lg py-2.5 px-2 text-xs font-bold transition-all ${
                  done ? 'border-2 border-rose-500' : 'border'
                } ${
                  isSelected
                    ? `bg-teal-600 text-white shadow-md scale-102 ${done ? '' : 'border-teal-600'}`
                    : `bg-white text-slate-600 hover:bg-teal-50 ${
                        done ? '' : 'border-slate-200 hover:border-teal-300'
                      }`
                }`}
              >
                {opt.label}
                {done && (
                  <CheckCircle2
                    className={`h-3.5 w-3.5 ${isSelected ? 'text-white' : 'text-rose-500'}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {doneCount > 0 && (
        <p className="mt-1.5 text-[10px] font-semibold text-rose-600">
          Hôm nay đã chấm {doneCount}/{activeOptions.length} khung
          {viewMode === 'hide' ? ' (đang ẩn)' : ' (viền đỏ)'}
        </p>
      )}
    </div>
  );
}
