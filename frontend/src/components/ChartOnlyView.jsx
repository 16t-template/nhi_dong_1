import React, { useState, useEffect, useMemo } from 'react';
import { fetchDataRows } from '../services/googleSheets';
import MonthlyChartModule from './MonthlyChartModule';

// Chế độ "chỉ hiện biểu đồ" khi mở link dạng:
//   /data/<tên tủ hoặc mã tủ>/<tháng>
//   ví dụ: /data/HE-sp-003/07-2026
//          /data/Phiếu theo dõi nhiệt độ và độ ẩm phòng nhận mẫu/7-2026
// Tháng chấp nhận: 07-2026, 7-2026, 07/2026 (đã encode), 2026-07, 072026

const cleanStr = (s) =>
  String(s || '')
    .normalize('NFC')
    .trim()
    .toLowerCase();

const getMonthYear = (r) => {
  if (r.nam_thang && r.nam_thang.includes('/')) {
    const parts = r.nam_thang.trim().split('/');
    if (parts.length === 2) return `${parts[1].padStart(2, '0')}/${parts[0]}`;
  }
  if (r.ngay) {
    const parts = r.ngay.trim().split('/');
    if (parts.length === 3) return `${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  if (r.ngay_h) {
    const parts = r.ngay_h.trim().split(' ')[0].split('/');
    if (parts.length === 3) return `${parts[1].padStart(2, '0')}/${parts[2]}`;
  }
  return '';
};

// Chuẩn hóa tháng từ URL về dạng MM/YYYY
export function parseMonthParam(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{1,2})[-/._](\d{4})$/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2]}`;
  m = s.match(/^(\d{4})[-/._](\d{1,2})$/);
  if (m) return `${m[2].padStart(2, '0')}/${m[1]}`;
  m = s.match(/^(\d{2})(\d{4})$/);
  if (m) return `${m[1]}/${m[2]}`;
  return '';
}

export default function ChartOnlyView({ cabinetParam, monthParam, getStaffDisplayName }) {
  const [dataRows, setDataRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      setDataRows(await fetchDataRows());
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const month = parseMonthParam(monthParam);

  // Tìm tên tủ đúng theo dữ liệu (cho phép nhập tên tủ hoặc mã tủ id_tu)
  const cabinetName = useMemo(() => {
    const target = cleanStr(cabinetParam);
    if (!target) return '';
    const matches = dataRows.filter(
      (r) => cleanStr(r.ten) === target || cleanStr(r.id_tu) === target
    );
    // Ưu tiên dòng có tên tủ (một số dòng chỉ có id_tu, cột ten bị trống)
    const exact = matches.find((r) => (r.ten || '').trim()) || matches[0];
    if (exact) return (exact.ten || exact.id_tu || '').trim();
    const partial = dataRows.find((r) => cleanStr(r.ten).includes(target));
    return partial ? (partial.ten || '').trim() : '';
  }, [dataRows, cabinetParam]);

  const thangList = useMemo(() => {
    const set = new Set();
    dataRows.forEach((r) => {
      const m = getMonthYear(r);
      if (m) set.add(m);
    });
    if (month) set.add(month);
    return Array.from(set);
  }, [dataRows, month]);

  const message = (text) => (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm font-semibold text-slate-600">
      {text}
    </div>
  );

  if (isLoading) return message('Đang tải dữ liệu biểu đồ...');
  if (error) return message(`Lỗi tải dữ liệu: ${error}`);
  if (!month) return message(`Tháng "${monthParam}" không hợp lệ. Dùng dạng 07-2026.`);
  if (!cabinetName) return message(`Không tìm thấy tủ "${cabinetParam}" trong dữ liệu.`);

  return (
    <div className="min-h-screen bg-white">
      <MonthlyChartModule
        chartOnly
        dataRows={dataRows}
        activeCabinet={cabinetName}
        onSelectCabinet={() => {}}
        activeMonth={month}
        onSelectMonth={() => {}}
        tenTuList={[cabinetName]}
        thangList={thangList}
        onRefresh={loadData}
        getStaffDisplayName={getStaffDisplayName}
      />
    </div>
  );
}
