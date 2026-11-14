import React, { useState, useRef, useEffect, useMemo } from 'react';
import { QrCode, CheckCircle2, AlertTriangle, Thermometer, Droplets, Save, Loader2 } from 'lucide-react';
import QRScannerModal from './QRScannerModal';
import SignaturePad from './SignaturePad';
import KhungGioSelector, { getDefaultKhungGio } from './KhungGioSelector';
import { CONFIG } from '../config/constants';
import { submitRecord, fetchDataRows } from '../services/googleSheets';

export default function TemperatureForm({ dsTu, currentUser }) {
  const [idTu, setIdTu] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [tenTu, setTenTu] = useState('');
  const [viTri, setViTri] = useState('');
  const [nhietDoMin, setNhietDoMin] = useState('');
  const [nhietDoMax, setNhietDoMax] = useState('');
  const [doAmMin, setDoAmMin] = useState('');
  const [doAmMax, setDoAmMax] = useState('');
  const [showHumidity, setShowHumidity] = useState(false);

  const [khungH, setKhungH] = useState('Sáng');
  const [nhietDoDoDc, setNhietDoDoDc] = useState('');
  const [doAmDoDc, setDoAmDoDc] = useState('');
  const [ghiChu, setGhiChu] = useState('');

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signatureRef = useRef(null);

  // ===== Khung giờ đã chấm trong "ngày làm việc" (từ 7:00 hôm nay tới 6:59 sáng hôm sau) =====
  const [dataRows, setDataRows] = useState([]);
  const loadDataRows = () =>
    fetchDataRows()
      .then((rows) => setDataRows(rows))
      .catch((err) => console.error('Lỗi tải DATA (khung đã chấm):', err));
  useEffect(() => {
    loadDataRows();
  }, []);

  const normStr = (v) => String(v || '').normalize('NFC').trim().toLowerCase();

  // Ngày làm việc của 1 thời điểm: lùi 7 tiếng rồi lấy ngày (để L5 23H, L6 3H tính chung ngày với L1)
  const workDayKey = (date) => {
    const d = new Date(date.getTime() - 7 * 3600 * 1000);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };
  const parseRowTime = (r) => {
    const src = (r.ngay_h || r.ngay || '').trim();
    const [datePart, timePart = '12:00:00'] = src.split(' ');
    const [dd, mm, yyyy] = (datePart || '').split('/').map(Number);
    if (!dd || !mm || !yyyy) return null;
    const [hh = 12, mi = 0, ss = 0] = timePart.split(':').map(Number);
    return new Date(yyyy, mm - 1, dd, hh, mi, ss);
  };

  const doneSlots = useMemo(() => {
    const set = new Set();
    if (!tenTu && !idTu) return set;
    const today = workDayKey(new Date());
    const t = normStr(tenTu);
    const id = normStr(idTu);
    dataRows.forEach((r) => {
      const matchTu =
        (t && (normStr(r.ten) === t || normStr(r.id_tu) === t)) ||
        (id && normStr(r.id_tu) === id);
      if (!matchTu || !r.khung_h) return;
      const time = parseRowTime(r);
      if (time && workDayKey(time) === today) set.add(r.khung_h.trim());
    });
    return set;
  }, [dataRows, tenTu, idTu]);

  // Status calculation (ĐẠT / THẤP / CAO) theo cả nhiệt độ và độ ẩm
  const toNumber = (v) => {
    const s = String(v ?? '').trim().replace(',', '.');
    if (s === '') return NaN;
    return parseFloat(s);
  };

  // So sánh 1 giá trị với ngưỡng; ngưỡng trống thì bỏ qua phía đó
  const checkRange = (val, min, max) => {
    if (isNaN(val)) return '';
    if (!isNaN(min) && val < min) return 'THẤP';
    if (!isNaN(max) && val > max) return 'CAO';
    return 'ĐẠT';
  };

  const nhietDoStatus =
    nhietDoMin === '' && nhietDoMax === ''
      ? ''
      : checkRange(toNumber(nhietDoDoDc), toNumber(nhietDoMin), toNumber(nhietDoMax));

  // Độ ẩm: chỉ xét khi là phòng có theo dõi độ ẩm và đã nhập; độ ẩm luôn trong 0 - 100%
  const doAmMinNum = toNumber(doAmMin);
  const doAmMaxNum = toNumber(doAmMax);
  const doAmStatus =
    showHumidity && String(doAmDoDc).trim() !== ''
      ? checkRange(
          toNumber(doAmDoDc),
          isNaN(doAmMinNum) ? 0 : doAmMinNum,
          isNaN(doAmMaxNum) ? 100 : doAmMaxNum
        )
      : '';

  const getKetQua = () => {
    if (!nhietDoStatus) return '';
    // Không đạt nếu nhiệt độ HOẶC độ ẩm vượt ngưỡng (ưu tiên báo nhiệt độ)
    if (nhietDoStatus !== 'ĐẠT') return nhietDoStatus;
    if (doAmStatus && doAmStatus !== 'ĐẠT') return doAmStatus;
    return 'ĐẠT';
  };

  const ketQua = getKetQua();

  // Search cabinet by ID
  const handleCabinetLookup = (searchId) => {
    setIdTu(searchId);
    const cleaned = String(searchId).trim().toLowerCase();
    const found = dsTu.find(
      (t) => String(t.id).trim().toLowerCase() === cleaned
    );

    if (found) {
      setTenTu(found.ten || '');
      setViTri(found.vi_tri || '');
      setNhietDoMin(found.nhiet_do_min || '');
      setNhietDoMax(found.nhiet_do_max || '');
      setDoAmMin(found.do_am_min || '');
      setDoAmMax(found.do_am_max || '');

      const isRoomHumidity =
        found.ten &&
        CONFIG.humidityRoomNames.some(
          (name) => name === found.ten.trim().toLowerCase()
        );
      setShowHumidity(Boolean(isRoomHumidity));

      // Auto update shift if needed
      const defKhung = getDefaultKhungGio(
        found.ten,
        found.nhiet_do_min,
        found.nhiet_do_max
      );
      setKhungH(defKhung);
    } else {
      setTenTu('');
      setViTri('');
      setNhietDoMin('');
      setNhietDoMax('');
      setDoAmMin('');
      setDoAmMax('');
      setShowHumidity(false);
    }
  };

  const handleScanSuccess = (decoded) => {
    setQrCode(decoded);
    handleCabinetLookup(decoded);
  };

  // Humidity validate step 5
  const handleHumidityChange = (e) => {
    const valStr = e.target.value;
    setDoAmDoDc(valStr);
  };

  const handleHumidityBlur = () => {
    if (doAmDoDc === '') return;
    const val = parseFloat(String(doAmDoDc).replace(',', '.'));
    if (isNaN(val)) {
      alert('Độ ẩm đo được phải là số (ví dụ: 55 hoặc 55,5)');
      setDoAmDoDc('');
    }
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!idTu.trim()) {
      alert('Vui lòng quét hoặc nhập mã Tủ (ID Tủ)!');
      return;
    }

    if (nhietDoDoDc === '') {
      alert('Vui lòng nhập nhiệt độ đo được!');
      return;
    }

    if (isNaN(parseFloat(String(nhietDoDoDc).replace(',', '.')))) {
      alert('Nhiệt độ đo được phải là số (ví dụ: 2,6)');
      return;
    }

    if (
      showHumidity &&
      doAmDoDc !== '' &&
      isNaN(parseFloat(String(doAmDoDc).replace(',', '.')))
    ) {
      alert('Độ ẩm đo được phải là số (ví dụ: 55 hoặc 55,5)');
      return;
    }

    if (showHumidity && doAmDoDc !== '') {
      const h = toNumber(doAmDoDc);
      if (h < 0 || h > 100) {
        alert('Độ ẩm đo được phải nằm trong khoảng 0 - 100%');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let chuKyVal = '';
      if (signatureRef.current && !signatureRef.current.isEmpty()) {
        chuKyVal = signatureRef.current.toDataURL();
      }

      await submitRecord({
        idTu: idTu.trim(),
        qrCode: qrCode || idTu.trim(),
        tenTu,
        viTri,
        nhietDoMin,
        nhietDoMax,
        nhietDoDoDc,
        doAmMin,
        doAmMax,
        doAmDoDc,
        ketQua,
        khungH,
        ghiChu,
        chuKy: chuKyVal,
        currentUser,
      });

      alert('Lưu dữ liệu thành công!');

      // Đánh dấu ngay khung vừa lưu là "đã chấm", rồi tải lại DATA cho chắc
      const now = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      setDataRows((rows) => [
        {
          ten: tenTu,
          id_tu: idTu.trim(),
          khung_h: khungH,
          ngay_h: `${p2(now.getDate())}/${p2(now.getMonth() + 1)}/${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`,
        },
        ...rows,
      ]);
      loadDataRows();

      // Reset Form
      setIdTu('');
      setQrCode('');
      setTenTu('');
      setViTri('');
      setNhietDoMin('');
      setNhietDoMax('');
      setDoAmMin('');
      setDoAmMax('');
      setNhietDoDoDc('');
      setDoAmDoDc('');
      setGhiChu('');
      setShowHumidity(false);
      if (signatureRef.current) {
        signatureRef.current.clear();
      }
    } catch (err) {
      console.error(err);
      alert('Lỗi: ' + (err.message || 'Không thể lưu dữ liệu'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl pb-16">
      <div className="form-card p-5 md:p-8">
        {/* Card Title */}
        <div className="mb-6 flex items-center gap-3 border-b-2 border-teal-100 pb-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-100 to-teal-200 text-teal-800 shadow-inner">
            <Thermometer className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight text-teal-900">
              Ghi nhận Nhiệt độ Tủ
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Nhập mã hoặc quét QR để kiểm tra ngưỡng nhiệt độ
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 content-pb">
          {/* Row 1: ID Tu & Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                ID Tủ (Mã QR) <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={idTu}
                  onChange={(e) => handleCabinetLookup(e.target.value)}
                  className="input-modern uppercase font-bold tracking-wide"
                  placeholder="Nhập hoặc quét mã..."
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-teal-600 to-teal-500 px-4 py-3 text-white shadow-md transition hover:from-teal-700 hover:to-teal-600 active:scale-95"
                  title="Mở máy ảnh quét mã QR"
                >
                  <QrCode className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Tên tủ
              </label>
              <input
                type="text"
                value={tenTu}
                readOnly
                className="input-readonly font-semibold"
                placeholder="Tự động điền theo ID"
              />
            </div>
          </div>

          {/* Row 2: Location & Khung Gio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Vị trí
              </label>
              <input
                type="text"
                value={viTri}
                readOnly
                className="input-readonly"
                placeholder="Tự động điền"
              />
            </div>

            <KhungGioSelector
              tenTu={tenTu}
              nhietDoMin={nhietDoMin}
              nhietDoMax={nhietDoMax}
              selectedSlot={khungH}
              onChangeSlot={setKhungH}
              doneSlots={doneSlots}
            />
          </div>

          <div className="my-2 h-[1px] bg-gradient-to-r from-transparent via-teal-200 to-transparent" />

          {/* Row 3: Limits & Measured Temperature */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
            <div>
              <label className="mb-2 block text-xs md:text-sm font-bold text-slate-500">
                Cảnh báo Dưới (°C)
              </label>
              <input
                type="text"
                value={nhietDoMin}
                readOnly
                className="input-readonly text-center font-black text-lg text-slate-700"
                placeholder="--"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs md:text-sm font-bold text-slate-500">
                Cảnh báo Trên (°C)
              </label>
              <input
                type="text"
                value={nhietDoMax}
                readOnly
                className="input-readonly text-center font-black text-lg text-slate-700"
                placeholder="--"
              />
            </div>

            <div className="col-span-2 md:col-span-1 rounded-2xl border-2 border-teal-300 bg-teal-50/70 p-3 shadow-sm">
              <label className="mb-1.5 block text-center text-xs font-black tracking-wide text-teal-900 uppercase">
                NHIỆT ĐỘ ĐO ĐƯỢC <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={nhietDoDoDc}
                onChange={(e) => setNhietDoDoDc(e.target.value)}
                className="w-full rounded-xl border-2 border-teal-500 bg-white px-3 py-2 text-center text-2xl font-black text-teal-800 shadow-inner focus:outline-none focus:ring-4 focus:ring-teal-400/20"
                placeholder="0,0"
              />
              {/* Gợi ý số âm (bàn phím số trên điện thoại thường không có dấu "-") */}
              {(() => {
                const raw = String(nhietDoDoDc).trim();
                const num = parseFloat(raw.replace(',', '.'));
                if (raw === '' || raw.startsWith('-') || isNaN(num) || num === 0) return null;
                const negative = `-${raw}`;
                return (
                  <button
                    type="button"
                    onClick={() => setNhietDoDoDc(negative)}
                    className="mt-1.5 w-full rounded-lg border border-sky-300 bg-white px-2 py-1 text-center text-sm font-bold text-sky-700 shadow-xs hover:bg-sky-50 active:scale-95 transition"
                    title="Bấm để đổi sang số âm"
                  >
                    Gợi ý: <span className="font-black">{negative}</span>
                  </button>
                );
              })()}
            </div>
          </div>

          {/* Conditional Humidity Section */}
          {showHumidity && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 animate-fade-in-up">
              <div className="flex items-center gap-2 mb-3 text-sky-800 font-bold text-sm">
                <Droplets className="h-4 w-4" />
                <span>Theo dõi Độ ẩm phòng</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500">
                    Độ ẩm tối thiểu (%)
                  </label>
                  <input
                    type="text"
                    value={doAmMin}
                    readOnly
                    className="input-readonly text-center font-black text-base"
                    placeholder="--"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-500">
                    Độ ẩm tối đa (%)
                  </label>
                  <input
                    type="text"
                    value={doAmMax}
                    readOnly
                    className="input-readonly text-center font-black text-base"
                    placeholder="--"
                  />
                </div>

                <div className="col-span-2 md:col-span-1 rounded-xl border-2 border-sky-400 bg-white p-2 text-center">
                  <label className="mb-1 block text-xs font-black tracking-wide text-sky-900 uppercase">
                    ĐỘ ẨM ĐO ĐƯỢC (%)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={doAmDoDc}
                    onChange={handleHumidityChange}
                    onBlur={handleHumidityBlur}
                    className="w-full rounded-lg border border-sky-200 bg-slate-50 px-2 py-1 text-center text-xl font-black text-sky-800 focus:bg-white focus:outline-none"
                    placeholder="0"
                  />
                  <span className="text-[10px] text-slate-400">Có thể nhập số lẻ, vd 55,5</span>
                </div>
              </div>
            </div>
          )}

          {/* Row 4: Status and Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Tình trạng (Tự động)
              </label>
              <div
                className={`flex h-12 w-full items-center justify-center rounded-xl border-2 text-lg font-black tracking-wider transition-all shadow-sm ${
                  ketQua === 'ĐẠT'
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-600'
                    : ketQua === 'THẤP'
                    ? 'border-cyan-400 bg-cyan-50 text-cyan-700'
                    : ketQua === 'CAO'
                    ? 'border-rose-400 bg-rose-50 text-rose-600'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                {ketQua || '-'}
              </div>
              {ketQua && doAmStatus && (
                <p className="mt-1.5 text-center text-xs font-semibold text-slate-500">
                  Nhiệt độ:{' '}
                  <span className={nhietDoStatus === 'ĐẠT' ? 'text-emerald-600' : 'text-rose-600'}>
                    {nhietDoStatus}
                  </span>{' '}
                  &bull; Độ ẩm:{' '}
                  <span className={doAmStatus === 'ĐẠT' ? 'text-emerald-600' : 'text-rose-600'}>
                    {doAmStatus}
                  </span>
                </p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                Ghi chú sự cố
              </label>
              <textarea
                rows={2}
                value={ghiChu}
                onChange={(e) => setGhiChu(e.target.value)}
                className="input-modern resize-y"
                placeholder="Ghi nhận sai số, vệ sinh thiết bị..."
              />
            </div>
          </div>

          {/* Signature Canvas */}
          <SignaturePad ref={signatureRef} />

          {/* Submit Button */}
          <div className="pt-4 mobile-sticky-footer">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-600 py-4 text-lg font-black text-white shadow-xl shadow-teal-700/25 transition-all hover:from-teal-800 hover:to-cyan-700 active:scale-98 disabled:opacity-70"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                  <span>ĐANG LƯU DỮ LIỆU...</span>
                </>
              ) : (
                <>
                  <Save className="h-6 w-6" />
                  <span>LƯU DỮ LIỆU</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </div>
  );
}
