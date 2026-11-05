import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  List,
  BarChart3,
  LineChart,
  ArrowLeft,
  Search,
  Printer,
  Download,
  RotateCw,
  LayoutTemplate,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  FileSpreadsheet,
  X,
  Check,
  ArrowUpDown,
} from 'lucide-react';
import { fetchDataRows, fetchUsers } from '../services/googleSheets';
import MonthlyChartModule, { formatDecimal } from './MonthlyChartModule';

export default function DataModule({ onBack, usersList = [] }) {
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'stats' | 'chart'
  const [dataRows, setDataRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Staff users state for mapping id -> ho_ten
  const [staffUsers, setStaffUsers] = useState(usersList);
  useEffect(() => {
    if (usersList && usersList.length > 0) {
      setStaffUsers(usersList);
    } else {
      fetchUsers()
        .then((u) => setStaffUsers(u))
        .catch(console.error);
    }
  }, [usersList]);

  // Map employee ID -> Full Name
  const userMap = useMemo(() => {
    const map = {};
    (staffUsers || []).forEach((u) => {
      if (u.id) {
        map[u.id.trim().toUpperCase()] = u.name || u.id;
      }
    });
    return map;
  }, [staffUsers]);

  const getStaffDisplayName = (idNv) => {
    if (!idNv) return '—';
    const cleanId = idNv.trim().toUpperCase();
    return userMap[cleanId] || idNv;
  };

  // Sort direction on measurement date: 'desc' (Mới nhất) | 'asc' (Cũ nhất)
  const [sortDirection, setSortDirection] = useState('desc');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTenTu, setFilterTenTu] = useState('ALL');
  const [filterThang, setFilterThang] = useState('ALL');
  const [filterViTri, setFilterViTri] = useState('ALL');
  const [filterKhungH, setFilterKhungH] = useState('ALL');
  const [filterKetQua, setFilterKetQua] = useState('ALL');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewSignature, setPreviewSignature] = useState(null);

  // Column Visibility Popover
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef(null);

  // Visible Columns state
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const defaultCols = {
      ten: true,
      ngay_h: true,
      khung_h: true,
      vi_tri: true,
      nguong: true,
      nhiet_do: true,
      nguong_do_am: true,
      do_am: true,
      ket_qua: true,
      id_nv: true,
      chu_ky: true,
      ghi_chu: true,
    };
    try {
      const saved = localStorage.getItem('data_table_columns');
      return saved ? { ...defaultCols, ...JSON.parse(saved) } : defaultCols;
    } catch {
      return defaultCols;
    }
  });

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('data_table_columns', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  // Close column menu on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        columnMenuRef.current &&
        !columnMenuRef.current.contains(event.target)
      ) {
        setIsColumnMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Column Widths (Adjustable / Resizable)
  const [columnWidths, setColumnWidths] = useState({
    checkbox: 44,
    ten: 240,
    ngay_h: 160,
    khung_h: 100,
    vi_tri: 160,
    nguong: 120,
    nhiet_do: 110,
    nguong_do_am: 115,
    do_am: 100,
    ket_qua: 110,
    id_nv: 110,
    chu_ky: 100,
    ghi_chu: 220,
  });

  const startResize = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 120;

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + delta);
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  // Parse measurement timestamp strictly from ngay_h (or ngay + khung_h)
  const parseMeasurementTimestamp = (r) => {
    if (r.ngay_h) {
      const trimmed = r.ngay_h.trim();
      const parts = trimmed.split(' ');
      const dParts = parts[0].split('/');
      if (dParts.length === 3) {
        const d = dParts[0].padStart(2, '0');
        const m = dParts[1].padStart(2, '0');
        const y = dParts[2];
        let timePart = parts[1];
        if (!timePart || timePart.indexOf(':') === -1) {
          timePart = r.khung_h === 'Chiều' ? '14:00:00' : '08:00:00';
        } else {
          const tSegments = timePart.split(':');
          const hh = (tSegments[0] || '00').padStart(2, '0');
          const mm = (tSegments[1] || '00').padStart(2, '0');
          const ss = (tSegments[2] || '00').padStart(2, '0');
          timePart = `${hh}:${mm}:${ss}`;
        }
        const t = new Date(`${y}-${m}-${d}T${timePart}`).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    }
    if (r.ngay) {
      const dParts = r.ngay.trim().split('/');
      if (dParts.length === 3) {
        const d = dParts[0].padStart(2, '0');
        const m = dParts[1].padStart(2, '0');
        const y = dParts[2];
        const timePart = r.khung_h === 'Chiều' ? '14:00:00' : '08:00:00';
        const t = new Date(`${y}-${m}-${d}T${timePart}`).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
    }
    return 0;
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const rows = await fetchDataRows();
      setDataRows(rows);
    } catch (err) {
      console.error(err);
      alert('Lỗi tải dữ liệu sheet DATA: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // String normalization helper for accurate Vietnamese comparison
  const cleanStr = (s) =>
    String(s || '')
      .normalize('NFC')
      .trim()
      .toLowerCase();

  // Helper: Extract month/year (MM/YYYY)
  const getMonthYear = (r) => {
    if (r.nam_thang && r.nam_thang.includes('/')) {
      const parts = r.nam_thang.trim().split('/');
      if (parts.length === 2) {
        return `${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
    if (r.ngay) {
      const parts = r.ngay.trim().split('/');
      if (parts.length === 3) {
        return `${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    if (r.ngay_h) {
      const datePart = r.ngay_h.trim().split(' ')[0];
      const parts = datePart.split('/');
      if (parts.length === 3) {
        return `${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    return '';
  };

  // Distinct lists for dropdown filters
  const tenTuList = useMemo(() => {
    const set = new Set();
    dataRows.forEach((r) => {
      if (r.ten) set.add(r.ten.trim());
    });
    return Array.from(set).sort();
  }, [dataRows]);

  const thangList = useMemo(() => {
    const set = new Set();
    dataRows.forEach((r) => {
      const m = getMonthYear(r);
      if (m) set.add(m);
    });
    return Array.from(set).sort((a, b) => {
      const [ma, ya] = a.split('/').map(Number);
      const [mb, yb] = b.split('/').map(Number);
      return yb - ya || mb - ma;
    });
  }, [dataRows]);

  const viTriList = useMemo(() => {
    const set = new Set();
    dataRows.forEach((r) => {
      if (r.vi_tri) set.add(r.vi_tri.trim());
    });
    return Array.from(set).sort();
  }, [dataRows]);

  const khungHList = useMemo(() => {
    const set = new Set();
    dataRows.forEach((r) => {
      if (r.khung_h) set.add(r.khung_h.trim());
    });
    return Array.from(set);
  }, [dataRows]);

  // Filtered Rows
  const filteredRows = useMemo(() => {
    return dataRows.filter((r) => {
      // Search text
      const search = cleanStr(searchTerm);
      if (search) {
        const matchesTen = cleanStr(r.ten).includes(search);
        const matchesId = cleanStr(r.id_tu).includes(search);
        const matchesViTri = cleanStr(r.vi_tri).includes(search);
        const staffName = cleanStr(getStaffDisplayName(r.id_nv));
        const matchesNv = cleanStr(r.id_nv).includes(search) || staffName.includes(search);
        if (!matchesTen && !matchesId && !matchesViTri && !matchesNv) {
          return false;
        }
      }

      // Filter Tên tủ (dựa vào tên tủ hoặc mã tủ)
      if (filterTenTu !== 'ALL') {
        const target = cleanStr(filterTenTu);
        const rTen = cleanStr(r.ten);
        const rIdTu = cleanStr(r.id_tu);
        if (rTen !== target && rIdTu !== target) {
          return false;
        }
      }

      // Filter Tháng (MM/YYYY)
      if (filterThang !== 'ALL') {
        const m = getMonthYear(r);
        if (m !== filterThang) {
          return false;
        }
      }

      // Filter Vị trí
      if (filterViTri !== 'ALL') {
        const target = cleanStr(filterViTri);
        const rViTri = cleanStr(r.vi_tri);
        if (rViTri !== target) {
          return false;
        }
      }

      // Filter Khung Giờ
      if (filterKhungH !== 'ALL' && cleanStr(r.khung_h) !== cleanStr(filterKhungH)) {
        return false;
      }

      // Filter Kết Quả
      if (filterKetQua !== 'ALL') {
        const kq = cleanStr(r.ket_qua);
        if (kq !== cleanStr(filterKetQua)) return false;
      }

      return true;
    });
  }, [dataRows, searchTerm, filterTenTu, filterThang, filterViTri, filterKhungH, filterKetQua, staffUsers]);

  // Sorted and Filtered Rows according to parseMeasurementTimestamp & sortDirection
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const tsA = parseMeasurementTimestamp(a);
      const tsB = parseMeasurementTimestamp(b);
      const diff = sortDirection === 'desc' ? tsB - tsA : tsA - tsB;
      if (diff !== 0) return diff;
      if (a.khung_h !== b.khung_h) {
        if (sortDirection === 'desc') {
          if (b.khung_h === 'Chiều') return 1;
          if (a.khung_h === 'Chiều') return -1;
        } else {
          if (a.khung_h === 'Sáng') return -1;
          if (b.khung_h === 'Sáng') return 1;
        }
      }
      return sortDirection === 'desc'
        ? (b.rowIndex || 0) - (a.rowIndex || 0)
        : (a.rowIndex || 0) - (b.rowIndex || 0);
    });
  }, [filteredRows, sortDirection]);

  // Checkbox toggle with guaranteed unique key
  const toggleSelectAll = () => {
    if (selectedIds.size === sortedRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(
        new Set(sortedRows.map((r) => r.uniqueId || `row_${r.rowIndex}_${r.id}`))
      );
    }
  };

  const toggleSelectRow = (uniqueKey) => {
    const next = new Set(selectedIds);
    if (next.has(uniqueKey)) next.delete(uniqueKey);
    else next.add(uniqueKey);
    setSelectedIds(next);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (!sortedRows.length) {
      alert('Không có dữ liệu để xuất.');
      return;
    }
    const headers = [
      'ID',
      'Ngày',
      'Ngày Giờ',
      'Khung Giờ',
      'Mã QR',
      'ID Tủ',
      'Tên Tủ',
      'Vị Trí',
      'Min (°C)',
      'Max (°C)',
      'Nhiệt Độ Đo (°C)',
      'Ngưỡng Độ Ẩm (%)',
      'Độ Ẩm Min (%)',
      'Độ Ẩm Max (%)',
      'Độ Ẩm Đo (%)',
      'Kết Quả',
      'Mã NV',
      'Tên Nhân Viên',
      'Ghi Chú',
    ];

    const rows = sortedRows.map((r) => [
      `"${r.id}"`,
      `"${r.ngay}"`,
      `"${r.ngay_h}"`,
      `"${r.khung_h}"`,
      `"${r.qr_code}"`,
      `"${r.id_tu}"`,
      `"${r.ten}"`,
      `"${r.vi_tri}"`,
      `"${r.nhiet_do_min}"`,
      `"${r.nhiet_do_max}"`,
      `"${r.nhiet_do_do_dc}"`,
      `"${r.do_am_min && r.do_am_max ? `${r.do_am_min} ~ ${r.do_am_max}%` : r.do_am_max ? `≤ ${r.do_am_max}%` : r.do_am_min ? `≥ ${r.do_am_min}%` : ''}"`,
      `"${r.do_am_min}"`,
      `"${r.do_am_max}"`,
      `"${r.do_am_do_dc}"`,
      `"${r.ket_qua}"`,
      `"${r.id_nv}"`,
      `"${getStaffDisplayName(r.id_nv)}"`,
      `"${(r.ghi_chu || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `DATA_NHIET_DO_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Statistics calculation
  const stats = useMemo(() => {
    const total = dataRows.length;
    let datCount = 0;
    let thapCount = 0;
    let caoCount = 0;

    dataRows.forEach((r) => {
      const kq = (r.ket_qua || '').toUpperCase();
      if (kq === 'ĐẠT') datCount++;
      else if (kq === 'THẤP') thapCount++;
      else if (kq === 'CAO') caoCount++;
    });

    const datRate = total > 0 ? ((datCount / total) * 100).toFixed(1) : 0;
    return { total, datCount, thapCount, caoCount, datRate };
  }, [dataRows]);

  const columnLabels = [
    { key: 'ten', label: 'Tên tủ' },
    { key: 'ngay_h', label: 'Thời gian đo' },
    { key: 'khung_h', label: 'Khung giờ' },
    { key: 'vi_tri', label: 'Vị trí' },
    { key: 'nguong', label: 'Ngưỡng (°C)' },
    { key: 'nhiet_do', label: 'Nhiệt độ (°C)' },
    { key: 'nguong_do_am', label: 'Ngưỡng ẩm (%)' },
    { key: 'do_am', label: 'Độ ẩm (%)' },
    { key: 'ket_qua', label: 'Kết quả' },
    { key: 'id_nv', label: 'Nhân viên' },
    { key: 'chu_ky', label: 'Chữ ký' },
    { key: 'ghi_chu', label: 'Ghi chú' },
  ];

  return (
    <div className="flex h-full flex-col space-y-3 animate-fade-in-up">
      {/* Top Tabs */}
      <div className="no-print flex items-center justify-between">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>Danh sách</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              activeTab === 'stats'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Thống kê</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chart')}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition-all ${
              activeTab === 'chart'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <LineChart className="h-3.5 w-3.5" />
            <span>Biểu đồ</span>
          </button>
        </div>

        <div className="text-xs font-semibold text-slate-500">
          Tổng cộng:{' '}
          <span className="font-extrabold text-blue-600">
            {filteredRows.length}
          </span>{' '}
          / {dataRows.length} bản ghi (Đã xếp từ mới nhất)
        </div>
      </div>

      {/* Main Container Card */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs data-module-card">
        {/* Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 bg-white px-4 py-3">
          {/* Left tools: Back, Search, Dropdown filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Quay lại</span>
            </button>

            {/* Search Input */}
            <div className="relative w-48 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm kiếm nhanh..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Filter 1: Lọc theo Tên Tủ (rộng hơn để nhìn rõ tên model) */}
            <div className="relative">
              <select
                value={filterTenTu}
                onChange={(e) => setFilterTenTu(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none max-w-[240px] truncate"
                title={filterTenTu !== 'ALL' ? filterTenTu : 'Tên tủ: Tất cả'}
              >
                <option value="ALL">Tên tủ: Tất cả</option>
                {tenTuList.map((t) => (
                  <option key={t} value={t} title={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Lọc theo Tháng (MM/YYYY) */}
            <div className="relative">
              <select
                value={filterThang}
                onChange={(e) => setFilterThang(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">Tháng: Tất cả</option>
                {thangList.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 3: Vị trí */}
            <div className="relative">
              <select
                value={filterViTri}
                onChange={(e) => setFilterViTri(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none max-w-[150px] truncate"
              >
                <option value="ALL">Vị trí: Tất cả</option>
                {viTriList.map((vt) => (
                  <option key={vt} value={vt}>
                    {vt}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 4: Khung Giờ */}
            <div className="relative">
              <select
                value={filterKhungH}
                onChange={(e) => setFilterKhungH(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">Khung giờ: Tất cả</option>
                {khungHList.map((kh) => (
                  <option key={kh} value={kh}>
                    {kh}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 5: Trạng thái */}
            <div className="relative">
              <select
                value={filterKetQua}
                onChange={(e) => setFilterKetQua(e.target.value)}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none"
              >
                <option value="ALL">Trạng thái: Tất cả</option>
                <option value="ĐẠT">ĐẠT (Bình thường)</option>
                <option value="THẤP">THẤP (Cảnh báo)</option>
                <option value="CAO">CAO (Cảnh báo)</option>
              </select>
            </div>
          </div>

          {/* Right tools: In, Load lại, Icon chỉnh cột (LayoutTemplate), Xuất file */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => window.print()}
              title="In danh sách"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:scale-95 transition"
            >
              <Printer className="h-4 w-4" />
            </button>

            {/* Nút Load lại */}
            <button
              type="button"
              onClick={loadData}
              title="Tải lại từ Google Sheets"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-blue-600 active:scale-95 transition"
            >
              <RotateCw
                className={`h-4 w-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`}
              />
            </button>

            {/* Icon nhỏ cạnh nút load lại để điều chỉnh cột (LayoutTemplate) */}
            <div className="relative" ref={columnMenuRef}>
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
                  title="Tùy chỉnh hiển thị cột"
                  className={`h-8 w-8 flex items-center justify-center border rounded-lg transition-all ${
                    isColumnMenuOpen
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <LayoutTemplate className="h-4 w-4" />
                </button>
              </div>

              {/* Column selection Popover Menu */}
              {isColumnMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl z-50 animate-fade-in-up">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                    <span className="text-xs font-bold text-slate-800">
                      Hiển thị cột
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleColumns({
                          ten: true,
                          ngay_h: true,
                          khung_h: true,
                          vi_tri: true,
                          nguong: true,
                          nhiet_do: true,
                          do_am: true,
                          ket_qua: true,
                          id_nv: true,
                          chu_ky: true,
                          ghi_chu: true,
                        })
                      }
                      className="text-[10px] font-bold text-blue-600 hover:underline"
                    >
                      Bật tất cả
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {columnLabels.map((col) => {
                      const isChecked = visibleColumns[col.key];
                      return (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50 cursor-pointer text-xs select-none text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleColumn(col.key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span
                            className={isChecked ? 'font-medium' : 'text-slate-400'}
                          >
                            {col.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Nút Xuất file CSV */}
            <button
              type="button"
              onClick={exportToCSV}
              title="Xuất file CSV / Excel"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 active:scale-95 transition"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span className="hidden sm:inline">Xuất file</span>
            </button>
          </div>
        </div>

        {/* Tab 1: List Table with Resizable Columns */}
        {activeTab === 'list' && (
          <div className="flex-1 overflow-auto custom-scrollbar select-none">
            {isLoading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-3">
                <div className="custom-spinner" />
                <p className="text-xs font-semibold text-slate-400">
                  Đang đồng bộ dữ liệu từ Google Sheets (Sheet DATA)...
                </p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-400">
                <FileSpreadsheet className="h-10 w-10 text-slate-300" />
                <p className="text-sm font-semibold">
                  Không tìm thấy bản ghi nào phù hợp.
                </p>
                <p className="text-xs">
                  Thử thay đổi bộ lọc tìm kiếm để xem kết quả.
                </p>
              </div>
            ) : (
              <table
                className="text-left text-xs border-separate border-spacing-0"
                style={{ tableLayout: 'fixed', minWidth: '100%' }}
              >
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold select-none">
                  <tr>
                    {/* Checkbox column */}
                    <th
                      className="sticky left-0 z-20 bg-slate-100 border-b border-r border-slate-200 text-center py-2 relative"
                      style={{
                        width: `${columnWidths.checkbox}px`,
                        minWidth: `${columnWidths.checkbox}px`,
                        maxWidth: `${columnWidths.checkbox}px`,
                      }}
                    >
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={
                            selectedIds.size === sortedRows.length &&
                            sortedRows.length > 0
                          }
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </div>
                    </th>

                    {/* Tên tủ */}
                    {visibleColumns.ten && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.ten}px`,
                          minWidth: `${columnWidths.ten}px`,
                        }}
                      >
                        <span className="truncate">Tên tủ</span>
                        {/* Resizer handle */}
                        <div
                          onMouseDown={(e) => startResize('ten', e)}
                          title="Kéo để điều chỉnh độ rộng cột"
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Ngày giờ đo */}
                    {visibleColumns.ngay_h && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 relative whitespace-nowrap cursor-pointer hover:bg-slate-200/70 transition-colors select-none group"
                        style={{
                          width: `${columnWidths.ngay_h}px`,
                          minWidth: `${columnWidths.ngay_h}px`,
                        }}
                        onClick={() =>
                          setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))
                        }
                        title="Bấm để đổi thứ tự: Mới nhất ⟷ Cũ nhất"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span>Thời gian đo</span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              sortDirection === 'desc'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {sortDirection === 'desc' ? '▼ Mới nhất' : '▲ Cũ nhất'}
                          </span>
                        </div>
                        <div
                          onMouseDown={(e) => startResize('ngay_h', e)}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Khung giờ */}
                    {visibleColumns.khung_h && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.khung_h}px`,
                          minWidth: `${columnWidths.khung_h}px`,
                        }}
                      >
                        <span className="truncate">Khung giờ</span>
                        <div
                          onMouseDown={(e) => startResize('khung_h', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Vị trí */}
                    {visibleColumns.vi_tri && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.vi_tri}px`,
                          minWidth: `${columnWidths.vi_tri}px`,
                        }}
                      >
                        <span className="truncate">Vị trí</span>
                        <div
                          onMouseDown={(e) => startResize('vi_tri', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Ngưỡng min max */}
                    {visibleColumns.nguong && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 text-center relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.nguong}px`,
                          minWidth: `${columnWidths.nguong}px`,
                        }}
                      >
                        <span className="truncate">Ngưỡng (°C)</span>
                        <div
                          onMouseDown={(e) => startResize('nguong', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Nhiệt độ đo */}
                    {visibleColumns.nhiet_do && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 text-center relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.nhiet_do}px`,
                          minWidth: `${columnWidths.nhiet_do}px`,
                        }}
                      >
                        <span className="truncate">Nhiệt độ (°C)</span>
                        <div
                          onMouseDown={(e) => startResize('nhiet_do', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Ngưỡng độ ẩm */}
                    {visibleColumns.nguong_do_am && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 text-center relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.nguong_do_am}px`,
                          minWidth: `${columnWidths.nguong_do_am}px`,
                        }}
                      >
                        <span className="truncate">Ngưỡng ẩm (%)</span>
                        <div
                          onMouseDown={(e) => startResize('nguong_do_am', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Độ ẩm đo */}
                    {visibleColumns.do_am && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 text-center relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.do_am}px`,
                          minWidth: `${columnWidths.do_am}px`,
                        }}
                      >
                        <span className="truncate">Độ ẩm (%)</span>
                        <div
                          onMouseDown={(e) => startResize('do_am', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Kết quả */}
                    {visibleColumns.ket_qua && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 text-center relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.ket_qua}px`,
                          minWidth: `${columnWidths.ket_qua}px`,
                        }}
                      >
                        <span className="truncate">Kết quả</span>
                        <div
                          onMouseDown={(e) => startResize('ket_qua', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Nhân viên */}
                    {visibleColumns.id_nv && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.id_nv}px`,
                          minWidth: `${columnWidths.id_nv}px`,
                        }}
                      >
                        <span className="truncate">Nhân viên</span>
                        <div
                          onMouseDown={(e) => startResize('id_nv', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Chữ ký */}
                    {visibleColumns.chu_ky && (
                      <th
                        className="px-3 py-2 border-b border-r border-slate-200 text-center relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.chu_ky}px`,
                          minWidth: `${columnWidths.chu_ky}px`,
                        }}
                      >
                        <span className="truncate">Chữ ký</span>
                        <div
                          onMouseDown={(e) => startResize('chu_ky', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}

                    {/* Ghi chú */}
                    {visibleColumns.ghi_chu && (
                      <th
                        className="px-3 py-2 border-b border-slate-200 relative whitespace-nowrap"
                        style={{
                          width: `${columnWidths.ghi_chu}px`,
                          minWidth: `${columnWidths.ghi_chu}px`,
                        }}
                      >
                        <span className="truncate">Ghi chú</span>
                        <div
                          onMouseDown={(e) => startResize('ghi_chu', e)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-20 flex justify-end items-center pr-0.5 group"
                        >
                          <div className="w-[1px] h-3 bg-slate-300 group-hover:bg-blue-600" />
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {sortedRows.map((r, i) => {
                    const rowKey = r.uniqueId || `row_${r.rowIndex}_${r.id}`;
                    const isSelected = selectedIds.has(rowKey);

                    return (
                      <tr
                        key={rowKey}
                        className={`transition-colors hover:bg-blue-50/50 ${
                          isSelected
                            ? 'bg-blue-50/80'
                            : i % 2 === 1
                            ? 'bg-slate-50/30'
                            : 'bg-white'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="sticky left-0 z-10 bg-inherit border-b border-r border-slate-200 text-center py-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(rowKey)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>

                        {/* Tên tủ */}
                        {visibleColumns.ten && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 font-bold text-slate-800 overflow-hidden">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-700 text-[11px]">
                                {r.ten ? r.ten.charAt(0).toUpperCase() : 'T'}
                              </div>
                              <div className="min-w-0">
                                <div className="leading-tight truncate" title={r.ten}>
                                  {r.ten}
                                </div>
                                <div className="text-[10px] font-medium text-slate-400 truncate">
                                  Mã: {r.id_tu || r.qr_code}
                                </div>
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Thời gian đo */}
                        {visibleColumns.ngay_h && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-slate-600 whitespace-nowrap overflow-hidden truncate">
                            {r.ngay_h || r.ngay}
                          </td>
                        )}

                        {/* Khung giờ */}
                        {visibleColumns.khung_h && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 whitespace-nowrap">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-slate-700">
                              {r.khung_h}
                            </span>
                          </td>
                        )}

                        {/* Vị trí */}
                        {visibleColumns.vi_tri && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-slate-600 overflow-hidden truncate">
                            {r.vi_tri || '—'}
                          </td>
                        )}

                        {/* Ngưỡng (°C) */}
                        {visibleColumns.nguong && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center text-slate-500 whitespace-nowrap font-medium">
                            {r.nhiet_do_min && r.nhiet_do_max
                              ? `${r.nhiet_do_min} ~ ${r.nhiet_do_max}`
                              : '—'}
                          </td>
                        )}

                        {/* Nhiệt độ đo */}
                        {visibleColumns.nhiet_do && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center whitespace-nowrap">
                            <span className="font-extrabold text-sm text-slate-900">
                              {r.nhiet_do_do_dc !== '' ? formatDecimal(r.nhiet_do_do_dc) : '—'}
                            </span>
                          </td>
                        )}

                        {/* Ngưỡng độ ẩm */}
                        {visibleColumns.nguong_do_am && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center whitespace-nowrap text-slate-600 font-mono text-[11px]">
                            {r.do_am_min && r.do_am_max
                              ? `${r.do_am_min} ~ ${r.do_am_max}%`
                              : r.do_am_max
                              ? `≤ ${r.do_am_max}%`
                              : r.do_am_min
                              ? `≥ ${r.do_am_min}%`
                              : '—'}
                          </td>
                        )}

                        {/* Độ ẩm */}
                        {visibleColumns.do_am && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center text-slate-600 whitespace-nowrap font-semibold">
                            {r.do_am_do_dc ? `${formatDecimal(r.do_am_do_dc)}%` : '—'}
                          </td>
                        )}

                        {/* Kết quả badge */}
                        {visibleColumns.ket_qua && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center whitespace-nowrap">
                            {r.ket_qua === 'ĐẠT' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                ĐẠT
                              </span>
                            ) : r.ket_qua === 'THẤP' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300 bg-cyan-50 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800">
                                <TrendingDown className="h-3 w-3" />
                                THẤP
                              </span>
                            ) : r.ket_qua === 'CAO' ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                                <TrendingUp className="h-3 w-3" />
                                CAO
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">—</span>
                            )}
                          </td>
                        )}

                        {/* Nhân viên */}
                        {visibleColumns.id_nv && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 font-medium text-slate-700 whitespace-nowrap overflow-hidden">
                            <div className="flex flex-col min-w-0" title={`Mã NV: ${r.id_nv}`}>
                              <span className="font-semibold text-slate-800 truncate">
                                {getStaffDisplayName(r.id_nv)}
                              </span>
                              {userMap[r.id_nv?.trim()?.toUpperCase()] && (
                                <span className="text-[10px] text-slate-400 font-mono truncate">
                                  Mã: {r.id_nv}
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Chữ ký */}
                        {visibleColumns.chu_ky && (
                          <td className="px-3 py-2.5 border-b border-r border-slate-100 text-center whitespace-nowrap">
                            {r.chu_ky ? (
                              <button
                                type="button"
                                onClick={() => setPreviewSignature(r.chu_ky)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                              >
                                Xem chữ ký
                              </button>
                            ) : (
                              <span className="text-slate-300 italic text-[11px]">
                                Chưa ký
                              </span>
                            )}
                          </td>
                        )}

                        {/* Ghi chú */}
                        {visibleColumns.ghi_chu && (
                          <td className="px-3 py-2.5 border-b border-slate-100 text-slate-500 overflow-hidden truncate" title={r.ghi_chu}>
                            {r.ghi_chu || '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Statistics */}
        {activeTab === 'stats' && (
          <div className="flex-1 overflow-auto p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500">
                  Tổng lượt đo đã ghi nhận
                </p>
                <p className="mt-1 text-2xl font-black text-slate-900">
                  {stats.total}
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className="text-xs font-semibold text-emerald-800">
                  Lượt đạt tiêu chuẩn (ĐẠT)
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-700">
                    {stats.datCount}
                  </span>
                  <span className="text-xs font-bold text-emerald-600">
                    ({stats.datRate}%)
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
                <p className="text-xs font-semibold text-cyan-800">
                  Cảnh báo nhiệt độ THẤP
                </p>
                <p className="mt-1 text-2xl font-black text-cyan-700">
                  {stats.thapCount}
                </p>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <p className="text-xs font-semibold text-rose-800">
                  Cảnh báo nhiệt độ CAO
                </p>
                <p className="mt-1 text-2xl font-black text-rose-700">
                  {stats.caoCount}
                </p>
              </div>
            </div>

            {/* List breakdown by cabinet */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 text-sm font-bold text-slate-800">
                Thống kê tần suất đo theo từng thiết bị
              </h3>
              <div className="divide-y divide-slate-100">
                {Object.entries(
                  dataRows.reduce((acc, r) => {
                    const name = r.ten || 'Chưa đặt tên';
                    acc[name] = (acc[name] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([name, count]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-700">{name}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600">
                      {count} lượt
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Monthly Temperature Chart Module */}
        {activeTab === 'chart' && (
          <MonthlyChartModule
            dataRows={dataRows}
            activeCabinet={filterTenTu}
            onSelectCabinet={(cab) => setFilterTenTu(cab)}
            activeMonth={filterThang}
            onSelectMonth={(m) => setFilterThang(m)}
            tenTuList={tenTuList}
            thangList={thangList}
            onRefresh={loadData}
            getStaffDisplayName={getStaffDisplayName}
          />
        )}
      </div>

      {/* Signature Preview Modal */}
      {previewSignature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl animate-fade-in-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-sm font-bold text-slate-800">
                Chữ ký số xác nhận
              </span>
              <button
                type="button"
                onClick={() => setPreviewSignature(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="my-4 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2">
              <img
                src={previewSignature}
                alt="Chữ ký nhân viên"
                className="max-h-48 w-auto object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setPreviewSignature(null)}
              className="w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
