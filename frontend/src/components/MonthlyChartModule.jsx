import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import {
  TrendingUp,
  Thermometer,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Printer,
  FileText,
  LineChart,
  Wrench,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

// Chuyển chuỗi số (hỗ trợ dấu phẩy thập phân "2,6") thành Number, trả về null nếu không hợp lệ
export function parseDecimal(v) {
  if (v === null || v === undefined) return null;
  const str = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (str === '') return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

// Hiển thị số thập phân kiểu Việt Nam (2.6 -> "2,6")
export function formatDecimal(v) {
  const n = parseDecimal(v);
  if (n === null) return v ?? '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

// Tính vị trí chấm theo quy ước "đường kẻ = số nguyên":
// hàng có nhãn N trải từ N (mép dưới) tới N + bước (mép trên), giữa hàng = N + bước/2.
// labels: các giá trị hàng theo thứ tự hiển thị (vd [8,7,6,5,4,3,2]).
// getRect(label): trả về DOMRect của ô thuộc hàng đó (hoặc null).
// Trả về { x, y } tương đối so với wrapRect, hoặc null.
function lineValuePoint(v, labels, getRect, wrapRect) {
  // Bỏ các hàng không phải số (vd 'sep' = vùng phân cách của bể Memmert)
  const nums = (labels || []).filter((x) => typeof x === 'number' && !isNaN(x));
  if (nums.length === 0) return null;
  // Bước = khoảng cách nhỏ nhất giữa 2 hàng liền nhau (1°C, 5%...)
  let step = Infinity;
  for (let i = 1; i < nums.length; i++) {
    const d = Math.abs(nums[i] - nums[i - 1]);
    if (d > 0 && d < step) step = d;
  }
  if (!isFinite(step)) step = 1;
  // Hàng chứa giá trị = hàng có nhãn lớn nhất mà <= v (nếu không có thì lấy hàng nhỏ nhất)
  const sorted = [...nums].sort((a, b) => a - b);
  let n = sorted[0];
  for (const lbl of sorted) {
    if (lbl <= v + 1e-9) n = lbl;
  }
  const rect = getRect(n);
  if (!rect) return null;
  const desc = nums[0] > nums[nums.length - 1];
  const frac = Math.max(-1, Math.min(1, (v - n) / step));
  const y = desc ? rect.bottom - frac * rect.height : rect.top + frac * rect.height;
  return {
    x: rect.left - wrapRect.left + rect.width / 2,
    y: y - wrapRect.top,
  };
}

// Vẽ các chấm tròn lên SVG overlay (để chấm nằm đúng vị trí số lẻ, khớp với đường nối)
function drawSvgDots(svg, layer, pts, color, r) {
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  let g = svg.querySelector(`g[data-layer="${layer}"]`);
  if (!g) {
    g = document.createElementNS(NS, 'g');
    g.setAttribute('data-layer', layer);
    svg.appendChild(g);
  }
  while (g.firstChild) g.removeChild(g.firstChild);
  pts.forEach((pt) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', pt.x.toFixed(1));
    c.setAttribute('cy', pt.y.toFixed(1));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', color);
    c.setAttribute('class', 'sheet-dot');
    g.appendChild(c);

    // Ghi số lẻ cạnh chấm (vd "2,6") để đọc đúng giá trị thập phân
    const v = pt.temp ?? pt.value;
    if (typeof v === 'number' && !Number.isInteger(v)) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', (pt.x + r + 1.5).toFixed(1));
      t.setAttribute('y', (pt.y - r - 1).toFixed(1));
      t.setAttribute('font-size', '9');
      t.setAttribute('font-weight', '700');
      t.setAttribute('fill', color);
      t.setAttribute('stroke', '#fff');
      t.setAttribute('stroke-width', '2.5');
      t.setAttribute('paint-order', 'stroke');
      t.setAttribute('class', 'sheet-dot');
      t.textContent = formatDecimal(v);
      g.appendChild(t);
    }
  });
}
import { isSpecialSchedule } from './KhungGioSelector';

/**
 * Clean equipment model name for maintenance title
 */
function cleanDeviceName(raw) {
  return String(raw || '')
    .replace(/^Tủ lạnh trữ máu\s+/i, '')
    .replace(/^Tủ lạnh lưu trữ mẫu\s+/i, '')
    .replace(/^Tủ lạnh trữ hóa chất\s+/i, '')
    .replace(/^Tủ đông trữ chế phẩm máu\s+/i, '')
    .replace(/^Tủ âm sâu\s+/i, '')
    .replace(/^Máy ủ lắc tiểu cầu\s+/i, '')
    .replace(/^Bể điều nhiệt\s+/i, '')
    .replace(/^Phiếu theo dõi nhiệt độ và độ ẩm\s+/i, '')
    .trim();
}

/**
 * Determine equipment specifications based on the 18 standardized hospital .html templates
 */
export function getEquipmentSpecs(cabinetName, dataRows = []) {
  const cleanStr = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFC')
      .trim();

  const removeAccents = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .trim();

  const norm = cleanStr(cabinetName);
  const normNoAccents = removeAccents(cabinetName);

  const SPEC_DICTIONARY = [
    // 1. Rooms with humidity (dual-scale)
    {
      type: 'ROOM_DUAL',
      match: ['nhận mẫu'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ VÀ ẨM ĐỘ PHÒNG NHẬN MẪU',
      standardTemp: '21 - 26°C',
      standardHumidity: '≤ 70%',
      deviceCode: 'HE-sp-003',
      managerCode: 'TAN006',
      tempScale: [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15],
      humScale: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15],
      code: 'FM-EQ-HE-004 V4.0',
    },
    {
      type: 'ROOM_DUAL',
      match: ['đông máu - tế bào', 'đông máu'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ VÀ ẨM ĐỘ PHÒNG ĐÔNG MÁU - TẾ BÀO',
      standardTemp: '21 - 26°C',
      standardHumidity: '≤ 70%',
      deviceCode: 'HE-sp-002',
      managerCode: 'TAN006',
      tempScale: [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15],
      humScale: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15],
      code: 'FM-EQ-HE-004 V4.0',
    },
    {
      type: 'ROOM_DUAL',
      match: ['ngân hàng máu'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ VÀ ẨM ĐỘ PHÒNG NGÂN HÀNG MÁU',
      standardTemp: '21 - 26°C',
      standardHumidity: '≤ 70%',
      deviceCode: 'HE-cm-024',
      managerCode: 'TAN006',
      tempScale: [32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15],
      humScale: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15],
      code: 'FM-EQ-HE-004 V4.0',
    },
    // 2. Memmert WTB35 (36°C ~ 38°C)
    {
      type: 'MEMMERT',
      match: ['memmert', 'wtb35', 'bể điều nhiệt'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ BỂ ĐIỀU NHIỆT MEMMERT WTB35',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '36°C ~ 38°C',
      deviceCode: 'HE-cm-064',
      managerCode: 'LIB001',
      temps: [57, 56, 55, 'sep', 38, 37, 36],
      highlightTemps: [56, 37],
    },
    // 3. Deep freezer (-80°C ~ -70°C)
    {
      type: 'CABINET',
      match: ['âm sâu'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ ÂM SÂU (-80°C ~ -70°C)',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '-80°C ~ -70°C',
      deviceCode: 'HE-cm-048',
      managerCode: 'LIB001',
      temps: [-70, -71, -72, -73, -74, -75, -76, -77, -78, -79, -80, -81, -82, -83, -84, -85],
      highlightTemps: [-70, -80],
    },
    // 4. Platelet incubator HELMER PC100i
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: ['tiểu cầu', 'tieu cau', 'helmer', 'pc100i', 'pc-100i', 'pc 100i'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ MÁY LẮC TIỂU CẦU',
      code: 'FM-EQ-HE-003 V4.0',
      deviceCode: 'HE-bb-005',
      managerCode: 'LIB001',
      standardTemp: '20°C ~ 24°C',
      temps: [25, 24, 23, 22, 21, 20, 19],
      highlightTemps: [20, 24],
      dynamicSpecs: (dataRows) => {
        const rows = dataRows.filter(
          (r) => cleanStr(r.ten).includes('tiểu cầu') || cleanStr(r.ten).includes('helmer')
        );
        const hasNegative = rows.some((r) => parseDecimal(r.nhiet_do_do_dc) <= -10);
        if (hasNegative) {
          return {
            type: 'CABINET_6_SLOTS',
            slotsPerDay: 6,
            standardTemp: '-30°C ~ -35°C',
            temps: [-30, -31, -32, -33, -34, -35, -36],
            highlightTemps: [-30, -35],
          };
        }
        return {
          type: 'CABINET_6_SLOTS',
          slotsPerDay: 6,
          standardTemp: '20°C ~ 24°C',
          temps: [25, 24, 23, 22, 21, 20, 19],
          highlightTemps: [20, 24],
        };
      },
    },
    // 5. Blood freezers (-30°C ~ -35°C) - 6 shifts/day
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: ['kw'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ ÂM TRỮ HUYẾT TƯƠNG, TỦA LẠNH -35°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '-30°C ~ -35°C',
      deviceCode: 'HE-bb-004',
      managerCode: 'LIB001',
      temps: [-30, -31, -32, -33, -34, -35, -36],
      highlightTemps: [-30, -35],
    },
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: ['mdf-137', 'mdf 137', 'mdf'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ ÂM TRỮ HUYẾT TƯƠNG, TỦA LẠNH -35°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '-30°C ~ -35°C',
      deviceCode: 'HE-bb-026',
      managerCode: 'NHN028',
      temps: [-30, -31, -32, -33, -34, -35, -36],
      highlightTemps: [-30, -35],
    },
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: [
        'tủ đông trữ chế phẩm máu thermo scientific',
        'tu dong tru che pham mau thermo scientific',
        'tủ đông thermo',
        'tu dong thermo',
        'tủ đông',
        'tu dong',
        'tủa lạnh',
        'tua lanh',
        'huyết tương',
        'huyet tuong',
      ],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ ÂM TRỮ HUYẾT TƯƠNG, TỦA LẠNH -35°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '-30°C ~ -35°C',
      deviceCode: 'HE-bb-027',
      thermometerCode: 'HE-bb-014',
      managerCode: 'LIB001',
      temps: [-30, -31, -32, -33, -34, -35, -36],
      highlightTemps: [-30, -35],
    },
    // 6. Blood Refrigerators 2-6°C
    {
      type: 'CABINET',
      match: ['dometic br320-a', 'br320-a', 'br320 a'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ MÁU 2-6°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 6°C',
      deviceCode: 'HE-bb-002',
      managerCode: 'LIB001',
      temps: [8, 7, 6, 5, 4, 3, 2],
      highlightTemps: [2, 6],
    },
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: ['fiochetti', 'eumotica'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HỒNG CẦU 2-6°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 6°C',
      deviceCode: 'HE-bb-003',
      managerCode: 'LIB001',
      temps: [6, 5, 4, 3, 2, 1],
      highlightTemps: [2, 6],
    },
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: ['phcbi-a', 'phcbi a', 'phcbi_a'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HỒNG CẦU 2-6°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 6°C',
      deviceCode: 'HE-bb-040',
      managerCode: 'LIB001',
      temps: [6, 5, 4, 3, 2, 1],
      highlightTemps: [2, 6],
    },
    {
      type: 'CABINET_6_SLOTS',
      slotsPerDay: 6,
      match: ['phcbi-b', 'phcbi b', 'phcbi_b'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HỒNG CẦU 2-6°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 6°C',
      deviceCode: 'HE-bb-041',
      managerCode: 'LIB001',
      temps: [6, 5, 4, 3, 2, 1],
      highlightTemps: [2, 6],
    },
    // 7. Chemical & Sample Refrigerators 2-8°C
    {
      type: 'CABINET',
      match: ['sanyo', 'mbr-304d', 'mbr 304d', 'mbr'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HÓA CHẤT 2-8°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 8°C',
      deviceCode: 'HE-cm-008',
      managerCode: 'NHN028',
      temps: [8, 7, 6, 5, 4, 3, 2],
      highlightTemps: [2, 8],
    },
    {
      type: 'CABINET',
      match: ['panasonic'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HÓA CHẤT 2-8°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 8°C',
      deviceCode: 'HE-bb-028',
      managerCode: 'NHN028',
      temps: [8, 7, 6, 5, 4, 3, 2],
      highlightTemps: [2, 8],
    },
    {
      type: 'CABINET',
      match: [
        'tủ lạnh trữ hóa chất thermo scientific',
        'tu lanh tru hoa chat thermo scientific',
        'hóa chất thermo',
        'hoa chat thermo',
        'thermo',
      ],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HÓA CHẤT 2-8°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 8°C',
      deviceCode: 'HE-cm-009',
      managerCode: 'NHN028',
      temps: [8, 7, 6, 5, 4, 3, 2],
      highlightTemps: [2, 8],
    },
    {
      type: 'CABINET',
      match: [
        'tủ lạnh trữ hóa chất phcbi',
        'tu lanh tru hoa chat phcbi',
        'hóa chất phcbi',
        'hoa chat phcbi',
        'phcbi',
      ],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HÓA CHẤT 2-8°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 8°C',
      deviceCode: 'HE-cm-049',
      managerCode: 'NHN028',
      temps: [8, 7, 6, 5, 4, 3, 2],
      highlightTemps: [2, 8],
    },
    {
      type: 'CABINET',
      match: ['dometic br320-b', 'br320-b', 'br320 b'],
      title: 'PHIẾU THEO DÕI NHIỆT ĐỘ TỦ LẠNH TRỮ HÓA CHẤT 2-8°C',
      code: 'FM-EQ-HE-003 V4.0',
      standardTemp: '2°C ~ 8°C',
      deviceCode: 'HE-cm-014',
      managerCode: 'NHN028',
      temps: [8, 7, 6, 5, 4, 3, 2],
      highlightTemps: [2, 8],
    },
  ];

  const matched = SPEC_DICTIONARY.find((item) =>
    item.match.some((m) => {
      const cleanM = cleanStr(m);
      const noAccM = removeAccents(m);
      return norm.includes(cleanM) || normNoAccents.includes(noAccM);
    })
  );

  // Cross-check with isSpecialSchedule and measurement records: guarantee 6 slots
  const has6SlotsData = dataRows.some((r) => {
    const matchTu =
      cleanStr(r.ten) === norm ||
      cleanStr(r.id_tu) === norm ||
      removeAccents(r.ten) === normNoAccents ||
      removeAccents(r.id_tu) === normNoAccents;
    return matchTu && /^L[1-6]/i.test((r.khung_h || '').trim());
  });

  const force6Slots = isSpecialSchedule(cabinetName) || has6SlotsData;

  if (matched) {
    const dyn = matched.dynamicSpecs ? matched.dynamicSpecs(dataRows) : {};
    const slots = force6Slots ? 6 : dyn.slotsPerDay || matched.slotsPerDay || 2;
    const type = slots === 6 ? 'CABINET_6_SLOTS' : dyn.type || matched.type || 'CABINET';

    return {
      type,
      slotsPerDay: slots,
      title: matched.title,
      code: matched.code || 'FM-EQ-HE-003 V4.0',
      standardTemp: dyn.standardTemp || matched.standardTemp,
      standardHumidity: matched.standardHumidity,
      deviceCode: matched.deviceCode,
      thermometerCode: matched.thermometerCode,
      managerCode: matched.managerCode,
      temps:
        dyn.temps ||
        matched.temps ||
        (slots === 6 ? [-30, -31, -32, -33, -34, -35, -36] : [8, 7, 6, 5, 4, 3, 2]),
      tempScale: matched.tempScale,
      humScale: matched.humScale,
      highlightTemps:
        dyn.highlightTemps ||
        matched.highlightTemps ||
        (slots === 6 ? [-30, -35] : [2, 8]),
    };
  }

  // Fallback for custom or unknown cabinet
  const fallbackSlots = force6Slots ? 6 : 2;
  return {
    type: fallbackSlots === 6 ? 'CABINET_6_SLOTS' : 'CABINET',
    slotsPerDay: fallbackSlots,
    title: `PHIẾU THEO DÕI NHIỆT ĐỘ ${cabinetName.toUpperCase()}`,
    code: 'FM-EQ-HE-003 V4.0',
    standardTemp: fallbackSlots === 6 ? '-30°C ~ -35°C' : '2°C ~ 8°C',
    deviceCode: 'HE-tb-001',
    managerCode: 'LIB001',
    temps: fallbackSlots === 6 ? [-30, -31, -32, -33, -34, -35, -36] : [8, 7, 6, 5, 4, 3, 2],
    highlightTemps: fallbackSlots === 6 ? [-30, -35] : [2, 8],
  };
}

export default function MonthlyChartModule({
  dataRows = [],
  activeCabinet = 'ALL',
  onSelectCabinet,
  activeMonth = 'ALL',
  onSelectMonth,
  tenTuList = [],
  thangList = [],
  onRefresh,
  getStaffDisplayName,
  chartOnly = false, // Chỉ hiện biểu đồ + phiếu bảo trì (ẩn thanh điều khiển)
}) {
  const [viewMode, setViewMode] = useState('hospitalSheet'); // 'hospitalSheet' | 'interactiveCurve'
  const [activeSheetTab, setActiveSheetTab] = useState('all'); // 'all' | 'p1' | 'p2' | 'maintenance'

  // String normalization
  const cleanStr = (s) =>
    String(s || '')
      .normalize('NFC')
      .trim()
      .toLowerCase();

  // Helper: Extract month/year (MM/YYYY)
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
      const datePart = r.ngay_h.trim().split(' ')[0];
      const parts = datePart.split('/');
      if (parts.length === 3) return `${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
    return '';
  };

  // Helper: Parse measurement timestamp strictly from ngay_h (or ngay + khung_h)
  const getRecordTimestamp = (r) => {
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

  // Currently resolved cabinet (defaults to first cabinet if 'ALL')
  const resolvedCabinet = useMemo(() => {
    if (activeCabinet && activeCabinet !== 'ALL') {
      return activeCabinet;
    }
    return tenTuList.length > 0 ? tenTuList[0] : '';
  }, [activeCabinet, tenTuList]);

  // Currently resolved month (defaults to first available month if 'ALL')
  const resolvedMonth = useMemo(() => {
    if (activeMonth && activeMonth !== 'ALL') {
      return activeMonth;
    }
    return thangList.length > 0 ? thangList[0] : '05/2026';
  }, [activeMonth, thangList]);

  // Month navigation: previous / next
  const currentMonthIndex = thangList.indexOf(resolvedMonth);
  const handlePrevMonth = () => {
    if (currentMonthIndex < thangList.length - 1) {
      onSelectMonth(thangList[currentMonthIndex + 1]);
    }
  };
  const handleNextMonth = () => {
    if (currentMonthIndex > 0) {
      onSelectMonth(thangList[currentMonthIndex - 1]);
    }
  };

  // Filter rows for this cabinet and this month, sorted chronologically ascending
  const chartRows = useMemo(() => {
    if (!resolvedCabinet) return [];
    const target = cleanStr(resolvedCabinet);
    return dataRows
      .filter((r) => {
        const matchTu =
          cleanStr(r.ten) === target || cleanStr(r.id_tu) === target;
        const matchThang = getMonthYear(r) === resolvedMonth;
        return matchTu && matchThang;
      })
      .sort((a, b) => getRecordTimestamp(a) - getRecordTimestamp(b));
  }, [dataRows, resolvedCabinet, resolvedMonth]);

  // Equipment specs
  const specs = useMemo(() => {
    return getEquipmentSpecs(resolvedCabinet, dataRows);
  }, [resolvedCabinet, dataRows]);

  // Map month data into { [day]: { S: { temp, hum, sign }, C: { temp, hum, sign } } }
  const monthDataMap = useMemo(() => {
    const map = {};
    chartRows.forEach((r) => {
      let day = null;
      if (r.ngay) {
        const parts = r.ngay.split('/');
        if (parts.length >= 2) day = parseInt(parts[0], 10);
      } else if (r.ngay_h) {
        const datePart = r.ngay_h.split(' ')[0];
        const parts = datePart.split('/');
        if (parts.length >= 2) day = parseInt(parts[0], 10);
      }
      if (!day || isNaN(day) || day < 1 || day > 31) return;

      if (!map[day]) map[day] = {};

      const rawSession = (r.khung_h || '').trim().toUpperCase();
      let session = 'S';
      let slot = null;

      const lMatch = rawSession.match(/^L([1-6])/i);
      if (lMatch) {
        slot = parseInt(lMatch[1], 10);
        session = slot <= 2 ? 'S' : 'C';
      } else if (rawSession.startsWith('C') || rawSession === 'CHIỀU') {
        session = 'C';
        slot = 3;
      } else if (rawSession.startsWith('S') || rawSession === 'SÁNG') {
        session = 'S';
        slot = 1;
      } else {
        session = map[day]['S'] ? 'C' : 'S';
        slot = map[day][1] ? 2 : 1;
      }

      const temp = parseDecimal(r.nhiet_do_do_dc);
      const hum = parseDecimal(r.do_am_do_dc);
      const staffId = (r.id_nv || '').trim().toUpperCase();
      const staffName = getStaffDisplayName
        ? getStaffDisplayName(r.id_nv)
        : staffId;

      const entry = {
        temp,
        hum,
        sign: staffId, // User requested: Tên để là ID
        staffId,
        staffName,
        id_nv: staffId,
        ket_qua: r.ket_qua,
        raw: r,
      };

      if (session) {
        map[day][session] = entry;
      }
      if (slot) {
        map[day][slot] = entry;
      }
    });
    return map;
  }, [chartRows, getStaffDisplayName]);

  // Map operators for Maintenance Sheet (Ảnh 2)
  const operators = useMemo(() => {
    const map = {};
    chartRows.forEach((r) => {
      let day = null;
      if (r.ngay) {
        const parts = r.ngay.split('/');
        if (parts.length >= 2) day = parseInt(parts[0], 10);
      } else if (r.ngay_h) {
        const parts = r.ngay_h.split(' ')[0].split('/');
        if (parts.length >= 2) day = parseInt(parts[0], 10);
      }
      if (!day || isNaN(day) || day < 1 || day > 31) return;

      // In Image 2, the user's template shows the staff code (e.g. THB010)
      if (!map[day] && r.id_nv) {
        map[day] = String(r.id_nv).trim().toUpperCase();
      }
    });
    return map;
  }, [chartRows]);

  // Handler for printing standard A4 hospital sheets
  const handlePrintA4 = () => {
    if (viewMode !== 'hospitalSheet') {
      setViewMode('hospitalSheet');
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('beforeprint'));
      requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  // Extract month and year parts for header
  const [monthPart, yearPart] = useMemo(() => {
    if (resolvedMonth && resolvedMonth.includes('/')) {
      const parts = resolvedMonth.split('/');
      return [parts[0], parts[1]];
    }
    return ['05', '2026'];
  }, [resolvedMonth]);

  const totalDaysInMonth = useMemo(() => {
    const m = parseInt(monthPart, 10);
    const y = parseInt(yearPart, 10);
    if (!m || !y) return 30;
    return new Date(y, m, 0).getDate();
  }, [monthPart, yearPart]);

  return (
    <div className="flex flex-1 flex-col overflow-auto bg-slate-100/70 p-4 space-y-4 monthly-chart-root">
      {/* Top Header Card (Controls) */}
      {!chartOnly && (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Title & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900">
                  Biểu Đồ & Phiếu Theo Dõi Nhiệt Độ Bệnh Viện
                </h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                  {specs.code}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Chuẩn hóa biểu mẫu theo các file theo dõi tủ bệnh viện Nhi Đồng 1 &bull; Tiêu chuẩn: {specs.standardTemp} {specs.standardHumidity ? `& ${specs.standardHumidity}` : ''}
              </p>
            </div>
          </div>

          {/* Right: Selectors, Mode Toggle & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('hospitalSheet')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-bold transition-all ${
                  viewMode === 'hospitalSheet'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Biểu mẫu BV (Theo .html)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('interactiveCurve')}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-bold transition-all ${
                  viewMode === 'interactiveCurve'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LineChart className="h-3.5 w-3.5" />
                <span>Biểu đồ trực quan</span>
              </button>
            </div>

            {/* Cabinet selector */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs">
              <Thermometer className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-slate-600">Thiết bị:</span>
              <select
                value={resolvedCabinet}
                onChange={(e) => onSelectCabinet(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none max-w-[220px] truncate cursor-pointer"
                title={resolvedCabinet}
              >
                {tenTuList.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Month selector with prev/next buttons */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={currentMonthIndex >= thangList.length - 1}
                title="Tháng trước"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5 px-2 font-bold text-slate-800">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <select
                  value={resolvedMonth}
                  onChange={(e) => onSelectMonth(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {thangList.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={currentMonthIndex <= 0}
                title="Tháng sau"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrintA4}
              title="In phiếu A4 Landscape (Trang 1, Trang 2 & Phiếu bảo trì)"
              className="flex h-8 items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 active:scale-95 transition shadow-xs cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>In phiếu (A4)</span>
            </button>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={onRefresh}
              title="Làm mới dữ liệu từ Google Sheets"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-blue-600 active:scale-95 transition"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Sheet Sub-Tabs (Quick jump between Sheet 1, Sheet 2, and Maintenance Sheet) */}
        {viewMode === 'hospitalSheet' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500 mr-1">Xem nhanh:</span>
              <button
                type="button"
                onClick={() => setActiveSheetTab('all')}
                className={`rounded-lg px-2.5 py-1 font-bold transition ${
                  activeSheetTab === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Xem tất cả các trang
              </button>
              {specs.slotsPerDay === 6 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p1')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p1'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 1 (1 - 7)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p2')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p2'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 2 (8 - 14)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p3')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p3'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 3 (15 - 21)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p4')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p4'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 4 (22 - 28)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p5')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p5'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 5 (29 - {totalDaysInMonth})
                  </button>
                </>
              ) : specs.type !== 'ROOM_DUAL' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p1')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p1'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 1 (Ngày 1 - 15)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSheetTab('p2')}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      activeSheetTab === 'p2'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Trang 2 (Ngày 16 - 31)
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setActiveSheetTab('maintenance')}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                  activeSheetTab === 'maintenance'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                <Wrench className="h-3.5 w-3.5" />
                <span>Phiếu bảo trì thiết bị (Ảnh 2)</span>
              </button>
            </div>

            <div className="text-[11px] text-slate-500 italic">
              * Biểu mẫu đã được đồng bộ với 18 file .html bệnh viện &bull; Chấm điểm đo khớp 100% tâm ô lưới
            </div>
          </div>
        )}
      </div>
      )}

      {/* Main Content Area */}
      {viewMode === 'hospitalSheet' ? (
        <div className="space-y-6">
          {specs.type === 'ROOM_DUAL' ? (
            /* Room with Temperature & Humidity */
            <>
              {(activeSheetTab === 'all' || activeSheetTab === 'p1') && (
                <HospitalRoomSheet
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  dataMap={monthDataMap}
                />
              )}
              {(activeSheetTab === 'all' || activeSheetTab === 'maintenance') && (
                <HospitalMaintenanceSheet
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  operators={operators}
                />
              )}
            </>
          ) : specs.slotsPerDay === 6 ? (
            /* 6-shift cabinets (7 days/page, 6 slots/day) */
            <>
              {/* Page 1: 1 - 7 */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p1') && (
                <HospitalWeeklyTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={1}
                  startDay={1}
                  endDay={7}
                  temps={specs.temps || [6, 5, 4, 3, 2, 1]}
                  highlightTemps={specs.highlightTemps || [2, 6]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Page 2: 8 - 14 */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p2') && (
                <HospitalWeeklyTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={2}
                  startDay={8}
                  endDay={14}
                  temps={specs.temps || [6, 5, 4, 3, 2, 1]}
                  highlightTemps={specs.highlightTemps || [2, 6]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Page 3: 15 - 21 */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p3') && (
                <HospitalWeeklyTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={3}
                  startDay={15}
                  endDay={21}
                  temps={specs.temps || [6, 5, 4, 3, 2, 1]}
                  highlightTemps={specs.highlightTemps || [2, 6]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Page 4: 22 - 28 */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p4') && (
                <HospitalWeeklyTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={4}
                  startDay={22}
                  endDay={28}
                  temps={specs.temps || [6, 5, 4, 3, 2, 1]}
                  highlightTemps={specs.highlightTemps || [2, 6]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Page 5: 29 - totalDaysInMonth */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p5') && (
                <HospitalWeeklyTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={5}
                  startDay={29}
                  endDay={totalDaysInMonth}
                  temps={specs.temps || [6, 5, 4, 3, 2, 1]}
                  highlightTemps={specs.highlightTemps || [2, 6]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Maintenance Sheet */}
              {(activeSheetTab === 'all' || activeSheetTab === 'maintenance') && (
                <HospitalMaintenanceSheet
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  operators={operators}
                />
              )}
            </>
          ) : (
            /* Cabinet / Refrigerator / Memmert / Freezer (2 sessions S / C) */
            <>
              {/* Sheet 1: Days 1 to 15 */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p1') && (
                <HospitalHalfTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={1}
                  startDay={1}
                  endDay={15}
                  temps={specs.temps || [8, 7, 6, 5, 4, 3, 2]}
                  highlightTemps={specs.highlightTemps || [2, 8]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Sheet 2: Days 16 to 31 */}
              {(activeSheetTab === 'all' || activeSheetTab === 'p2') && (
                <HospitalHalfTable
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  pageIndex={2}
                  startDay={16}
                  endDay={31}
                  temps={specs.temps || [8, 7, 6, 5, 4, 3, 2]}
                  highlightTemps={specs.highlightTemps || [2, 8]}
                  dataMap={monthDataMap}
                />
              )}

              {/* Sheet 3: PHIẾU BẢO TRÌ THIẾT BỊ (Ảnh 2) */}
              {(activeSheetTab === 'all' || activeSheetTab === 'maintenance') && (
                <HospitalMaintenanceSheet
                  specs={specs}
                  cabinetName={resolvedCabinet}
                  month={monthPart}
                  year={yearPart}
                  operators={operators}
                />
              )}
            </>
          )}
        </div>
      ) : (
        /* Modern Interactive Curve View */
        <InteractiveCurveView
          chartRows={chartRows}
          specs={specs}
          resolvedCabinet={resolvedCabinet}
          resolvedMonth={resolvedMonth}
          getStaffDisplayName={getStaffDisplayName}
        />
      )}

      {/* Print Media Styles */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 4mm 5mm;
          }
          body, html {
            width: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            color: #000 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, aside, header, nav {
            display: none !important;
          }
          .erp-layout-root,
          .erp-layout-main,
          .data-module-card,
          .monthly-chart-root {
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            position: static !important;
            display: block !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }
          .hospital-sheet-page {
            width: 285mm !important;
            max-width: 285mm !important;
            min-height: 198mm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: 1px solid #64748b !important;
            padding: 2.5mm 3.5mm !important;
            page-break-after: always !important;
            break-after: page !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
            background: #fff !important;
            overflow: visible !important;
          }
          .hospital-sheet-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .chart-wrap-container {
            position: relative !important;
            overflow: hidden !important;
            width: 100% !important;
            display: block !important;
          }
          .chart-wrap-container > svg {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            pointer-events: none !important;
            z-index: 10 !important;
          }
          svg polyline {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .sheet-dot {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Component: Hospital Weekly Table (Phiếu 6 ca / ngày: 7 ngày / trang, 6 ca L1..L6 / ngày)
 * Dành cho 7 tủ: Fiochetti, PHCBi-A, PHCBi-B, KW, Panasonic MDF-137, Thermo Scientific, HELMER PC100i
 */
function HospitalWeeklyTable({
  specs,
  cabinetName,
  month,
  year,
  pageIndex,
  startDay,
  endDay,
  temps,
  highlightTemps,
  dataMap,
}) {
  const days = endDay - startDay + 1;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const polyRef = useRef(null);
  const dataMapRef = useRef(dataMap);
  dataMapRef.current = dataMap;
  const tempsRef = useRef(temps);
  tempsRef.current = temps;

  const updatePoints = () => {
    if (!wrapRef.current || !svgRef.current || !polyRef.current) return;
    const wrap = wrapRef.current;
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width === 0 || wrapRect.height === 0) return;

    svgRef.current.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);

    const curDataMap = dataMapRef.current || {};
    const pts = [];

    for (let d = startDay; d <= endDay; d++) {
      for (let s = 1; s <= 6; s++) {
        const entry = curDataMap[d]?.[s];
        if (entry && entry.temp !== null && entry.temp !== undefined) {
          const rawTemp = entry.temp;
          const pt = lineValuePoint(
            rawTemp,
            temps,
            (lbl) =>
              wrap
                .querySelector(
                  `[data-cell="true"][data-day="${d}"][data-slot="${s}"][data-temp="${lbl}"]`
                )
                ?.getBoundingClientRect() || null,
            wrapRect
          );
          if (pt) {
            pts.push({ ...pt, temp: rawTemp, day: d, slot: s });
          }
        }
      }
    }

    if (pts.length >= 2) {
      polyRef.current.setAttribute(
        'points',
        pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      );
      polyRef.current.style.display = '';
    } else {
      polyRef.current.setAttribute('points', '');
      polyRef.current.style.display = 'none';
    }
    drawSvgDots(svgRef.current, 'temp', pts, '#dc2626', 3.25);
  };

  useEffect(() => {
    updatePoints();
    const timer = setTimeout(updatePoints, 150);
    const ro = new ResizeObserver(() => updatePoints());
    if (wrapRef.current) ro.observe(wrapRef.current);
    const onResize = () => updatePoints();
    const onBeforePrint = () => updatePoints();
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeprint', onBeforePrint);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [dataMap, temps, startDay, endDay, cabinetName]);

  const SLOTS_PER_DAY = 6;

  return (
    <div className="hospital-sheet-page mx-auto w-full max-w-[1140px] rounded-2xl border border-slate-300 bg-white p-4 shadow-md transition-all select-none text-slate-900">
      {/* Hospital Header Top */}
      <div className="flex items-start justify-between border-b border-slate-300 pb-2 text-[12px] leading-tight">
        <div>
          <div className="font-bold uppercase tracking-wider text-slate-900">
            Bệnh viện Nhi Đồng 1
          </div>
          <div className="italic text-slate-600">Ban QLCLXN</div>
          <div className="font-semibold text-slate-800">
            Khoa Xét nghiệm Huyết học
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-600 max-w-[50%]">
          <div>{specs.title}</div>
        </div>
      </div>

      {/* Sheet Title */}
      <div className="my-2 text-center">
        <h1 className="text-base font-extrabold uppercase tracking-wide text-slate-900">
          {specs.title}
        </h1>
        <div className="text-xs font-semibold text-slate-600">
          (TRANG {pageIndex}: NGÀY {startDay} - {endDay})
        </div>
      </div>

      {/* Metadata bar */}
      <div className="mb-2 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-[11px] leading-snug">
        <div>
          <div>
            <span className="font-bold text-slate-700">Loại tủ: </span>
            <span className="font-medium text-slate-900">{cabinetName}</span>
          </div>
          <div className="mt-0.5">
            <span className="font-bold text-slate-700">Người quản lý: </span>
            <span className="font-medium text-slate-900">
              {specs.managerCode || 'LIB001'}
            </span>
          </div>
        </div>
        <div>
          <div>
            <span className="font-bold text-slate-700">Mã thiết bị: </span>
            <span className="font-medium text-slate-900">
              {specs.deviceCode || ''}
            </span>
          </div>
          <div className="mt-0.5">
            <span className="font-bold text-slate-700">Mã nhiệt kế: </span>
            <span className="font-medium text-slate-900">
              {specs.thermometerCode || ''}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div>
            <span className="font-bold text-slate-700">Tiêu chuẩn: </span>
            <span className="font-bold text-rose-600">
              {specs.standardTemp || '2°C ~ 6°C'}
            </span>
          </div>
          <div className="mt-0.5">
            <span className="font-bold text-slate-700">Tháng: </span>
            <span className="font-bold text-blue-900">{month}</span>
            <span className="font-bold text-slate-700"> / Năm: </span>
            <span className="font-bold text-blue-900">{year}</span>
          </div>
        </div>
      </div>

      {/* Main Grid with SVG Line & Dot overlay */}
      <div
        ref={wrapRef}
        className="chart-wrap-container relative w-full overflow-x-auto border-2 border-slate-500 bg-white"
      >
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none z-10 w-full h-full"
          style={{ overflow: 'visible' }}
        >
          <polyline
            ref={polyRef}
            fill="none"
            stroke="#dc2626"
            strokeWidth="1.8"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        <table className="w-full border-collapse text-center table-fixed">
          <thead>
            {/* Header Row 1: Ngày */}
            <tr className="border-b border-slate-400 bg-slate-100 text-[11px] font-bold text-slate-800">
              <th
                rowSpan={2}
                className="w-[45px] border-r border-slate-400 py-1"
              >
                Ngày
              </th>
              {Array.from({ length: days }, (_, i) => (
                <th
                  key={startDay + i}
                  colSpan={SLOTS_PER_DAY}
                  className="border-r border-slate-400 py-1"
                >
                  {startDay + i}
                </th>
              ))}
            </tr>

            {/* Header Row 2: 1 2 3 4 5 6 for each day */}
            <tr className="border-b border-slate-400 bg-slate-50 text-[10px] text-slate-700">
              {Array.from({ length: days * SLOTS_PER_DAY }, (_, i) => {
                const slotNum = (i % SLOTS_PER_DAY) + 1;
                const isDayEnd = slotNum === SLOTS_PER_DAY;
                return (
                  <th
                    key={i}
                    className={`py-0.5 ${
                      isDayEnd
                        ? 'border-r border-slate-400'
                        : 'border-r border-slate-200'
                    }`}
                  >
                    {slotNum}
                  </th>
                );
              })}
            </tr>

            {/* Header Row 3: T° */}
            <tr className="border-b border-slate-400 bg-slate-50 text-[10px] font-semibold text-slate-600">
              <th className="w-[45px] border-r border-slate-400 py-0.5">T°</th>
              {Array.from({ length: days * SLOTS_PER_DAY }, (_, i) => {
                const isDayEnd = (i % SLOTS_PER_DAY) + 1 === SLOTS_PER_DAY;
                return (
                  <th
                    key={i}
                    className={`py-0.5 ${
                      isDayEnd
                        ? 'border-r border-slate-400'
                        : 'border-r border-slate-200'
                    }`}
                  />
                );
              })}
            </tr>
          </thead>

          <tbody>
            {temps.map((t, rowIdx) => {
              const isBoundary =
                highlightTemps && highlightTemps.includes(t);
              const isSep = t === 'sep';

              if (isSep) {
                return (
                  <tr key={`sep-${rowIdx}`} className="h-2 bg-slate-200">
                    <td
                      colSpan={1 + days * SLOTS_PER_DAY}
                      className="border-b border-slate-300"
                    />
                  </tr>
                );
              }

              return (
                <tr
                  key={t}
                  className={`h-[22px] border-b ${
                    isBoundary
                      ? 'border-rose-300 bg-rose-50/25'
                      : 'border-slate-200 hover:bg-slate-50/40'
                  }`}
                >
                  {/* Temp label */}
                  <td
                    className={`w-[45px] border-r border-slate-400 font-bold text-[11px] ${
                      isBoundary ? 'text-rose-600' : 'text-slate-800'
                    }`}
                  >
                    {t}°C
                  </td>

                  {/* Day-slot cells */}
                  {Array.from({ length: days }, (_, dayIdx) => {
                    const d = startDay + dayIdx;
                    return Array.from({ length: SLOTS_PER_DAY }, (_, sIdx) => {
                      const s = sIdx + 1;
                      const isDayEnd = s === SLOTS_PER_DAY;

                      return (
                        <td
                          key={`${d}-${s}`}
                          className={`relative p-0 text-center align-middle ${
                            isDayEnd
                              ? 'border-r border-slate-400'
                              : 'border-r border-slate-200'
                          }`}
                          data-cell="true"
                          data-day={d}
                          data-slot={s}
                          data-temp={t}
                        >
                        </td>
                      );
                    });
                  })}
                </tr>
              );
            })}

            {/* Signature row: Tên */}
            <tr className="h-16 border-t-2 border-slate-400 bg-white">
              <td className="w-[45px] border-r border-slate-400 font-bold text-[11px] text-slate-700 align-middle">
                Tên
              </td>
              {Array.from({ length: days }, (_, dayIdx) => {
                const d = startDay + dayIdx;
                return Array.from({ length: SLOTS_PER_DAY }, (_, sIdx) => {
                  const s = sIdx + 1;
                  const sign =
                    dataMap[d]?.[s]?.sign ||
                    dataMap[d]?.[s]?.id_nv ||
                    '';
                  const isDayEnd = s === SLOTS_PER_DAY;

                  return (
                    <td
                      key={`${d}-${s}`}
                      className={`p-0.5 align-middle overflow-hidden text-center ${
                        isDayEnd
                          ? 'border-r border-slate-400'
                          : 'border-r border-slate-200'
                      }`}
                      title={sign ? `Ngày ${d} L${s}: ${sign}` : ''}
                    >
                      {sign && (
                        <span
                          className="inline-block text-[9.5px] font-bold text-blue-900 max-h-[58px] tracking-tight uppercase"
                          style={{
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                          }}
                        >
                          {sign}
                        </span>
                      )}
                    </td>
                  );
                });
              })}
            </tr>

            {/* Trưởng bộ phận row */}
            <tr className="h-8 border-t border-slate-400 bg-slate-50/50">
              <td className="w-[45px] border-r border-slate-400 font-bold text-[10px] text-slate-800 align-middle">
                Trưởng BP
              </td>
              <td
                colSpan={days * SLOTS_PER_DAY}
                className="text-center font-bold text-[11px] text-slate-800 align-middle"
              >
                {specs.managerCode || 'LIB001'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer note matching hospital template */}
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-slate-600">
        <div className="font-medium italic">
          * Lần 1-7:00, Lần 2-11:00, Lần 3-15:00, Lần 4-19:00, Lần 5-23:00, Lần 6-3:00
        </div>
        <div className="font-semibold text-slate-500">
          {specs.code || 'FM-EQ-HE-003 V4.0'}
        </div>
      </div>
    </div>
  );
}

/**
 * Component: Hospital Half Table (Trang 1: 1 - 15 hoặc Trang 2: 16 - 31)
 * Points and connecting polyline are measured directly from the rendered cells' DOM Rect
 * so that they match the exact pixel center of every cell with ZERO offset!
 */
function HospitalHalfTable({
  specs,
  cabinetName,
  month,
  year,
  pageIndex,
  startDay,
  endDay,
  temps,
  highlightTemps,
  dataMap,
}) {
  const days = endDay - startDay + 1;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const polyRef = useRef(null);
  const dataMapRef = useRef(dataMap);
  dataMapRef.current = dataMap;
  const tempsRef = useRef(temps);
  tempsRef.current = temps;

  // Compute exact center of cells using DOM getBoundingClientRect
  const updatePoints = () => {
    if (!wrapRef.current || !svgRef.current || !polyRef.current) return;
    const wrap = wrapRef.current;
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width === 0 || wrapRect.height === 0) return;

    svgRef.current.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);

    const curDataMap = dataMapRef.current || {};
    const pts = [];

    for (let d = startDay; d <= endDay; d++) {
      ['S', 'C'].forEach((s) => {
        const entry = curDataMap[d]?.[s];
        if (entry && entry.temp !== null && entry.temp !== undefined) {
          const rawTemp = entry.temp;
          const pt = lineValuePoint(
            rawTemp,
            temps,
            (lbl) =>
              wrap
                .querySelector(
                  `[data-cell="true"][data-day="${d}"][data-session="${s}"][data-temp="${lbl}"]`
                )
                ?.getBoundingClientRect() || null,
            wrapRect
          );
          if (pt) {
            pts.push({ ...pt, temp: rawTemp, day: d, session: s });
          }
        }
      });
    }

    if (pts.length >= 2) {
      const ptsStr = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      polyRef.current.setAttribute('points', ptsStr);
      polyRef.current.style.display = 'inline';
    } else {
      polyRef.current.setAttribute('points', '');
      polyRef.current.style.display = 'none';
    }
    drawSvgDots(svgRef.current, 'temp', pts, '#dc2626', 3.75);
  };

  useLayoutEffect(() => {
    updatePoints();
    const raf1 = requestAnimationFrame(updatePoints);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(updatePoints));
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [dataMap, temps, startDay, endDay, cabinetName]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      updatePoints();
    });
    ro.observe(wrapRef.current);
    window.addEventListener('resize', updatePoints);
    window.addEventListener('beforeprint', updatePoints);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updatePoints);
      window.removeEventListener('beforeprint', updatePoints);
    };
  }, []);

  return (
    <div className="hospital-sheet-page mx-auto w-full max-w-[1140px] rounded-2xl border border-slate-300 bg-white p-4 shadow-md transition-all select-none text-slate-900">
      {/* Top hospital info line */}
      <div className="flex items-start justify-between text-[11px] leading-tight mb-2 border-b border-slate-100 pb-2">
        <div>
          <p className="font-bold text-slate-900">Bệnh viện Nhi Đồng 1</p>
          <p className="text-slate-600">Ban QLCLXN</p>
          <p className="font-semibold text-blue-900">Khoa Xét nghiệm Huyết Học</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-700">{specs.title}</p>
          <p className="text-[10px] text-slate-500 font-mono">{specs.code}</p>
        </div>
      </div>

      {/* Main Title */}
      <div className="text-center my-2">
        <h1 className="text-base font-black uppercase text-slate-900 tracking-wide">
          {specs.title}
        </h1>
        <div className="text-xs font-bold text-blue-700 mt-0.5">
          (TRANG {pageIndex}: NGÀY {startDay} - {endDay})
        </div>
      </div>

      {/* Metadata bar */}
      <div className="grid grid-cols-3 gap-3 text-xs mb-2.5 bg-slate-50/70 p-2.5 rounded-xl border border-slate-200">
        <div>
          <p>
            <span className="font-bold text-slate-700">Loại tủ:</span>{' '}
            <span className="font-semibold text-blue-900 border-b border-dotted border-slate-400 pb-0.5">
              {cabinetName}
            </span>
          </p>
          <p className="mt-1">
            <span className="font-bold text-slate-700">Người quản lý:</span>{' '}
            <span className="font-semibold text-slate-800 border-b border-dotted border-slate-400 pb-0.5">
              {specs.managerCode}
            </span>
          </p>
        </div>
        <div className="text-center">
          <p>
            <span className="font-bold text-slate-700">Mã thiết bị:</span>{' '}
            <span className="font-semibold text-slate-800 border-b border-dotted border-slate-400 pb-0.5">
              {specs.deviceCode}
            </span>
          </p>
          <p className="mt-1">
            <span className="font-bold text-slate-700">Tiêu chuẩn:</span>{' '}
            <span className="font-bold text-emerald-700 border-b border-dotted border-slate-400 pb-0.5">
              {specs.standardTemp}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p>
            <span className="font-bold text-slate-700">Tháng:</span>{' '}
            <span className="font-bold text-blue-700 border-b border-dotted border-slate-400 px-1 pb-0.5">
              {month}
            </span>{' '}
            <span className="font-bold text-slate-700">Năm:</span>{' '}
            <span className="font-bold text-blue-700 border-b border-dotted border-slate-400 px-1 pb-0.5">
              {year}
            </span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Lưu: <span className="font-bold">Mẫu BP</span> &bull; <span className="font-bold">Hóa chất</span>
          </p>
        </div>
      </div>

      {/* Chart Wrap Container: Holds Table and Absolute SVG Overlay */}
      <div
        ref={wrapRef}
        className="chart-wrap-container relative border border-slate-400 rounded-lg overflow-hidden bg-white"
        style={{ position: 'relative' }}
      >
        {/* SVG Polyline Overlay connecting centers of cells */}
        <svg
          ref={svgRef}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          preserveAspectRatio="none"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          <polyline
            ref={polyRef}
            points=""
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'none' }}
          />
        </svg>

        {/* HTML Table Grid */}
        <table className="w-full border-collapse text-center text-xs select-none" style={{ tableLayout: 'fixed' }}>
          <thead>
            {/* Header Row 1: Ngày trong tháng */}
            <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-400">
              <th className="w-[60px] border-r border-slate-400 py-1 font-bold text-[11px]">
                Nhiệt độ
              </th>
              <th colSpan={days * 2} className="py-1 font-bold text-[11px]">
                Ngày trong tháng ({startDay} - {endDay})
              </th>
            </tr>
            {/* Header Row 2: Days numbers */}
            <tr className="bg-slate-50 font-bold text-slate-700 border-b border-slate-300">
              <th className="w-[60px] border-r border-slate-400 py-0.5 text-[10px]" />
              {Array.from({ length: days }, (_, i) => (
                <th key={i} colSpan={2} className="border-r border-slate-300 py-0.5 text-[10px]">
                  {startDay + i}
                </th>
              ))}
            </tr>
            {/* Header Row 3: Sessions S and C */}
            <tr className="bg-slate-100/70 font-semibold text-slate-600 border-b border-slate-400">
              <th className="w-[60px] border-r border-slate-400 py-0.5 text-[10px]">Buổi</th>
              {Array.from({ length: days }, (_, i) => (
                <React.Fragment key={i}>
                  <th className="border-r border-slate-200 py-0.5 text-[10px] text-blue-700 font-bold">
                    S
                  </th>
                  <th className="border-r border-slate-300 py-0.5 text-[10px] text-amber-700 font-bold">
                    C
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {temps.map((t, rowIdx) => {
              if (t === 'sep') {
                return (
                  <tr key="sep" className="bg-slate-200 h-2 border-b border-slate-300">
                    <td colSpan={days * 2 + 1} className="py-0 text-[9px] text-slate-400">
                      --- Vùng phân cách nhiệt độ ---
                    </td>
                  </tr>
                );
              }

              const isBoundary = highlightTemps.includes(t);

              return (
                <tr
                  key={rowIdx}
                  className={`h-6 border-b border-slate-300 ${
                    isBoundary ? 'bg-rose-50/20' : ''
                  }`}
                >
                  {/* Temperature label cell */}
                  <td
                    className={`w-[60px] border-r border-slate-400 font-bold text-[11px] ${
                      isBoundary ? 'text-rose-600' : 'text-slate-800'
                    }`}
                  >
                    {t}°C
                  </td>

                  {/* Day session cells with native centered dots */}
                  {Array.from({ length: days }, (_, dayIdx) => {
                    const d = startDay + dayIdx;

                    return (
                      <React.Fragment key={d}>
                        <td
                          className="relative border-r border-slate-200 p-0 text-center align-middle"
                          data-cell="true"
                          data-day={d}
                          data-session="S"
                          data-temp={t}
                        >
                        </td>
                        <td
                          className="relative border-r border-slate-300 p-0 text-center align-middle"
                          data-cell="true"
                          data-day={d}
                          data-session="C"
                          data-temp={t}
                        >
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}

            {/* Signature Row: Staff ID */}
            <tr className="h-16 border-t-2 border-slate-400 bg-white">
              <td className="w-[60px] border-r border-slate-400 font-bold text-[11px] text-slate-700 align-middle">
                Tên
              </td>
              {Array.from({ length: days }, (_, dayIdx) => {
                const d = startDay + dayIdx;
                const signS = dataMap[d]?.S?.sign || dataMap[d]?.S?.id_nv || '';
                const signC = dataMap[d]?.C?.sign || dataMap[d]?.C?.id_nv || '';
                const nameS = dataMap[d]?.S?.staffName || '';
                const nameC = dataMap[d]?.C?.staffName || '';

                return (
                  <React.Fragment key={d}>
                    <td
                      className="border-r border-slate-200 p-0.5 align-middle overflow-hidden text-center"
                      title={signS ? `Ngày ${d} S: ${signS}${nameS && nameS !== signS ? ` (${nameS})` : ''}` : ''}
                    >
                      {signS && (
                        <span
                          className="inline-block text-[10px] font-bold text-blue-900 max-h-[58px] tracking-tight uppercase"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {signS}
                        </span>
                      )}
                    </td>
                    <td
                      className="border-r border-slate-300 p-0.5 align-middle overflow-hidden text-center"
                      title={signC ? `Ngày ${d} C: ${signC}${nameC && nameC !== signC ? ` (${nameC})` : ''}` : ''}
                    >
                      {signC && (
                        <span
                          className="inline-block text-[10px] font-bold text-amber-900 max-h-[58px] tracking-tight uppercase"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {signC}
                        </span>
                      )}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>

            {/* Manager Row */}
            <tr className="h-8 border-t border-slate-300 bg-slate-50 font-bold text-xs text-slate-800">
              <td className="w-[60px] border-r border-slate-400 text-[10px] align-middle">
                Trưởng bộ phận
              </td>
              <td colSpan={days * 2} className="align-middle text-center font-bold text-blue-900">
                {specs.managerCode}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Note & footer */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 italic mt-2">
        <p>* Ghi chú: S = Sáng (8:00), C = Chiều (16:00). Đánh dấu điểm nhiệt độ đo được.</p>
        <p>Ngày hiệu lực: 01/{month}/{year}</p>
      </div>
    </div>
  );
}

/**
 * Component: Hospital Room Sheet (Matching 16, 17, 18 .html templates)
 * Dual-scale: Temperature (15-32°C) and Humidity (15-100%)
 */
function HospitalRoomSheet({ specs, cabinetName, month, year, dataMap }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const tempPolyRef = useRef(null);
  const humPolyRef = useRef(null);

  const dataMapRef = useRef(dataMap);
  dataMapRef.current = dataMap;

  const tempScale = specs.tempScale || [
    32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15,
  ];
  const humScale = specs.humScale || [
    100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15,
  ];
  const tempScaleRef = useRef(tempScale);
  tempScaleRef.current = tempScale;
  const humScaleRef = useRef(humScale);
  humScaleRef.current = humScale;

  // Measure exact pixel coordinates for temperature and humidity points
  const updateRoomPoints = () => {
    if (!wrapRef.current || !svgRef.current || !tempPolyRef.current || !humPolyRef.current) return;
    const wrap = wrapRef.current;
    const wrapRect = wrap.getBoundingClientRect();
    if (wrapRect.width === 0 || wrapRect.height === 0) return;

    svgRef.current.setAttribute('viewBox', `0 0 ${wrapRect.width} ${wrapRect.height}`);

    const curDataMap = dataMapRef.current || {};
    const curHumScale = humScaleRef.current;
    const tPts = [];
    const hPts = [];

    for (let d = 1; d <= 31; d++) {
      ['S', 'C'].forEach((s) => {
        const entry = curDataMap[d]?.[s];
        if (!entry) return;

        // Temperature point (Blue)
        if (entry.temp !== null && entry.temp !== undefined) {
          const pt = lineValuePoint(
            entry.temp,
            tempScaleRef.current,
            (lbl) =>
              wrap
                .querySelector(
                  `[data-cell="true"][data-day="${d}"][data-session="${s}"][data-temp-val="${lbl}"]`
                )
                ?.getBoundingClientRect() || null,
            wrapRect
          );
          if (pt) tPts.push({ ...pt, value: entry.temp });
        }

        // Humidity point (Red)
        if (entry.hum !== null && entry.hum !== undefined) {
          const pt = lineValuePoint(
            entry.hum,
            curHumScale,
            (lbl) => {
              const idx = curHumScale.indexOf(lbl);
              if (idx < 0) return null;
              return (
                wrap
                  .querySelector(
                    `[data-cell="true"][data-day="${d}"][data-session="${s}"][data-hum-idx="${idx}"]`
                  )
                  ?.getBoundingClientRect() || null
              );
            },
            wrapRect
          );
          if (pt) hPts.push({ ...pt, value: entry.hum });
        }
      });
    }

    if (tPts.length >= 2) {
      const tStr = tPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      tempPolyRef.current.setAttribute('points', tStr);
      tempPolyRef.current.style.display = 'inline';
    } else {
      tempPolyRef.current.setAttribute('points', '');
      tempPolyRef.current.style.display = 'none';
    }

    if (hPts.length >= 2) {
      const hStr = hPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      humPolyRef.current.setAttribute('points', hStr);
      humPolyRef.current.style.display = 'inline';
    } else {
      humPolyRef.current.setAttribute('points', '');
      humPolyRef.current.style.display = 'none';
    }
    drawSvgDots(svgRef.current, 'temp', tPts, '#0056b3', 3.25);
    drawSvgDots(svgRef.current, 'hum', hPts, '#d32f2f', 3.25);
  };

  useLayoutEffect(() => {
    updateRoomPoints();
    const raf1 = requestAnimationFrame(updateRoomPoints);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(updateRoomPoints));
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [dataMap, tempScale, humScale, cabinetName]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      updateRoomPoints();
    });
    ro.observe(wrapRef.current);
    window.addEventListener('resize', updateRoomPoints);
    window.addEventListener('beforeprint', updateRoomPoints);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateRoomPoints);
      window.removeEventListener('beforeprint', updateRoomPoints);
    };
  }, []);

  return (
    <div className="hospital-sheet-page mx-auto w-full max-w-[1200px] rounded-2xl border border-slate-300 bg-white p-4 shadow-md transition-all select-none text-slate-900">
      {/* Top hospital info line */}
      <div className="flex items-start justify-between text-[11px] leading-tight mb-2 border-b border-slate-100 pb-2">
        <div>
          <p className="font-bold text-slate-900">Bệnh viện Nhi Đồng 1</p>
          <p className="font-semibold text-blue-900">Khoa Xét nghiệm Huyết Học</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-700">{specs.title}</p>
          <p className="text-[10px] text-slate-500 font-mono">{specs.code}</p>
        </div>
      </div>

      {/* Main Title */}
      <div className="text-center my-2">
        <h1 className="text-base font-black uppercase text-slate-900 tracking-wide underline">
          {specs.title}
        </h1>
      </div>

      {/* Metadata bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <div>
          <span className="font-bold text-slate-600">Nhiệt độ chuẩn:</span>{' '}
          <span className="font-black text-blue-700">{specs.standardTemp}</span>
        </div>
        <div>
          <span className="font-bold text-slate-600">Độ ẩm chuẩn:</span>{' '}
          <span className="font-black text-rose-600">{specs.standardHumidity}</span>
        </div>
        <div>
          <span className="font-bold text-slate-600">Mã nhiệt ẩm kế:</span>{' '}
          <span className="font-bold text-slate-800">{specs.deviceCode}</span>
        </div>
        <div className="text-right">
          <span className="font-bold text-slate-600">Tháng:</span>{' '}
          <span className="font-black text-blue-700 px-1">{month}</span> &bull;{' '}
          <span className="font-bold text-slate-600">Năm:</span>{' '}
          <span className="font-black text-blue-700 px-1">{year}</span>
        </div>
      </div>

      {/* Chart Wrap Container: Holds Table and Dual SVG Overlay */}
      <div
        ref={wrapRef}
        className="chart-wrap-container relative border border-slate-400 rounded-lg overflow-hidden bg-white"
        style={{ position: 'relative' }}
      >
        {/* SVG Overlay for Dual Lines */}
        <svg
          ref={svgRef}
          className="pointer-events-none absolute inset-0 z-10 h-full w-full"
          preserveAspectRatio="none"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          {/* Blue line: Temperature */}
          <polyline
            ref={tempPolyRef}
            points=""
            fill="none"
            stroke="#0056b3"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'none' }}
          />

          {/* Red line: Humidity */}
          <polyline
            ref={humPolyRef}
            points=""
            fill="none"
            stroke="#d32f2f"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'none' }}
          />
        </svg>

        {/* HTML Table Grid */}
        <table className="w-full border-collapse text-center text-xs select-none" style={{ tableLayout: 'fixed' }}>
          <thead>
            {/* Header Row 1: Ngày (1 to 31) */}
            <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-400">
              <th colSpan={2} className="w-[72px] border-r border-slate-400 py-1 font-bold text-[10px]">
                Ngày
              </th>
              {Array.from({ length: 31 }, (_, i) => (
                <th key={i} colSpan={2} className="border-r border-slate-300 py-1 font-bold text-[10px]">
                  {i + 1}
                </th>
              ))}
            </tr>
            {/* Header Row 2: T °C | Ẩm độ % | S | C */}
            <tr className="bg-slate-50 font-bold text-[9px] border-b border-slate-400">
              <th className="w-[34px] border-r border-slate-300 py-0.5 text-blue-900 font-black">
                T ºC
              </th>
              <th className="w-[38px] border-r border-slate-400 py-0.5 text-rose-600 font-black">
                Ẩm %
              </th>
              {Array.from({ length: 31 }, (_, i) => (
                <React.Fragment key={i}>
                  <th className="border-r border-slate-200 py-0.5 text-blue-700 font-bold">
                    S
                  </th>
                  <th className="border-r border-slate-300 py-0.5 text-amber-700 font-bold">
                    C
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {tempScale.map((t, rowIdx) => {
              const h = humScale[rowIdx];
              const isHeavyBorder = t === 26 || t === 20;

              return (
                <tr
                  key={rowIdx}
                  className={`h-[19px] border-b ${
                    isHeavyBorder ? 'border-b-2 border-b-slate-900 bg-emerald-50/20' : 'border-b-slate-200'
                  }`}
                >
                  {/* Temp Axis Label */}
                  <td className="w-[34px] border-r border-slate-300 font-bold text-[10px] text-slate-900">
                    {t}
                  </td>
                  {/* Humidity Axis Label */}
                  <td className="w-[38px] border-r border-slate-400 font-bold text-[10px] text-rose-600">
                    {h}
                  </td>

                  {/* Day session cells with native centered dots */}
                  {Array.from({ length: 31 }, (_, dayIdx) => {
                    const d = dayIdx + 1;

                    return (
                      <React.Fragment key={d}>
                        <td
                          className="relative border-r border-slate-100 p-0 text-center align-middle"
                          data-cell="true"
                          data-day={d}
                          data-session="S"
                          data-temp-val={t}
                          data-hum-idx={rowIdx}
                        >
                        </td>
                        <td
                          className="relative border-r border-slate-300 p-0 text-center align-middle"
                          data-cell="true"
                          data-day={d}
                          data-session="C"
                          data-temp-val={t}
                          data-hum-idx={rowIdx}
                        >
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}

            {/* Signature Row: Staff ID */}
            <tr className="h-16 border-t-2 border-slate-400 bg-white">
              <td colSpan={2} className="w-[72px] border-r border-slate-400 font-bold text-[10px] text-slate-700 align-middle">
                Người ghi
              </td>
              {Array.from({ length: 31 }, (_, dayIdx) => {
                const d = dayIdx + 1;
                const signS = dataMap[d]?.S?.sign || dataMap[d]?.S?.id_nv || '';
                const signC = dataMap[d]?.C?.sign || dataMap[d]?.C?.id_nv || '';
                const nameS = dataMap[d]?.S?.staffName || '';
                const nameC = dataMap[d]?.C?.staffName || '';

                return (
                  <React.Fragment key={d}>
                    <td
                      className="border-r border-slate-200 p-0.5 align-middle overflow-hidden text-center"
                      title={signS ? `Ngày ${d} S: ${signS}${nameS && nameS !== signS ? ` (${nameS})` : ''}` : ''}
                    >
                      {signS && (
                        <span
                          className="inline-block text-[10px] font-bold text-blue-900 max-h-[58px] tracking-tight uppercase"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {signS}
                        </span>
                      )}
                    </td>
                    <td
                      className="border-r border-slate-300 p-0.5 align-middle overflow-hidden text-center"
                      title={signC ? `Ngày ${d} C: ${signC}${nameC && nameC !== signC ? ` (${nameC})` : ''}` : ''}
                    >
                      {signC && (
                        <span
                          className="inline-block text-[10px] font-bold text-amber-900 max-h-[58px] tracking-tight uppercase"
                          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                          {signC}
                        </span>
                      )}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend & instructions */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600 border-t border-slate-200 pt-2 mt-2">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 font-bold text-blue-800">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-700 inline-block" /> Chấm xanh: Nhiệt độ
          </span>
          <span className="flex items-center gap-1.5 font-bold text-rose-700">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600 inline-block" /> Chấm đỏ: Ẩm độ
          </span>
          <span>S (Sáng): 7:30 - 8:00 &bull; C (Chiều): 15:30 - 16:00</span>
        </div>
        <div>
          <span>Người quản lý: <strong>{specs.managerCode}</strong></span>
        </div>
      </div>
    </div>
  );
}

/**
 * Component: Hospital Maintenance Sheet (Phiếu Bảo Trì Thiết Bị - Ảnh 2)
 * Exact recreation of the Maintenance Form from the hospital's HTML files:
 * I. BẢO DƯỠNG HẰNG NGÀY (31 ngày, ticks ✓ and operator signature e.g. THB010)
 * II. BẢO DƯỠNG HẰNG TUẦN (Tuần 1-4)
 * III. BẢO DƯỠNG ĐỊNH KỲ (Tháng/Quý/6 tháng/12 tháng)
 */
function HospitalMaintenanceSheet({ specs, cabinetName, month, year, operators = {} }) {
  const deviceModel = cleanDeviceName(cabinetName);

  return (
    <div
      className="hospital-sheet-page mx-auto w-full max-w-[1140px] rounded-2xl border border-slate-300 bg-white p-6 shadow-md transition-all select-none text-slate-900"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      {/* Top Header Line */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="w-[220px] text-left leading-tight text-base font-normal">
          <div className="font-bold">Bệnh viện Nhi Đồng 1</div>
          <div>Ban QLCLXN</div>
          <div className="font-semibold">Khoa XN Huyết học</div>
        </div>

        <div className="flex-1 text-center min-w-0">
          <h1 className="m-0 text-2xl font-bold uppercase tracking-wide whitespace-nowrap">
            PHIẾU BẢO TRÌ THIẾT BỊ {deviceModel}
          </h1>
          <div className="mt-1 text-base font-bold text-slate-800">
            Tháng {month}/{year}
          </div>
        </div>

        <div className="w-[120px] text-right text-xs text-slate-500">
          <p className="font-mono">FM-EQ-HE-006</p>
        </div>
      </div>

      {/* Section I: Bảo dưỡng hằng ngày */}
      <div className="mt-4 mb-1 text-sm font-bold uppercase text-slate-900">
        I. BẢO DƯỠNG HẰNG NGÀY: (NGƯỜI SỬ DỤNG THỰC HIỆN)
      </div>

      <table
        className="w-full border-collapse border border-black text-center text-xs"
        style={{ tableLayout: 'fixed' }}
      >
        <thead>
          <tr className="bg-white">
            <th
              className="border border-black p-0.5 font-bold text-[11px]"
              style={{ width: '28px', minWidth: '28px' }}
            >
              S<br />T<br />T
            </th>
            <th
              className="border border-black p-1 font-bold text-[12px] text-center"
              style={{ width: '210px', minWidth: '210px' }}
            >
              Ngày
            </th>
            {Array.from({ length: 31 }, (_, i) => (
              <th
                key={i}
                className="border border-black p-0.5 font-bold text-[10px] text-center"
              >
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Row 1: Vệ sinh màn hình, bàn phím... */}
          <tr className="h-7 bg-white">
            <td className="border border-black text-center font-bold text-[11px]">1</td>
            <td className="border border-black px-1.5 text-left text-[11px] leading-tight font-medium">
              Vệ sinh màn hình, bàn phím, bề mặt máy bằng dung dịch khử khuẩn.
            </td>
            {Array.from({ length: 31 }, (_, dayIdx) => {
              const d = dayIdx + 1;
              const hasOp = Boolean(operators[d]);
              return (
                <td key={d} className="border border-black p-0 text-center font-bold text-[14px]">
                  {hasOp ? '✓' : ''}
                </td>
              );
            })}
          </tr>

          {/* Row 2: Kiểm tra tình trạng máy... */}
          <tr className="h-7 bg-white">
            <td className="border border-black text-center font-bold text-[11px]">2</td>
            <td className="border border-black px-1.5 text-left text-[11px] leading-tight font-medium">
              Kiểm tra tình trạng máy (điện, hóa chất, vật tư tiêu hao)
            </td>
            {Array.from({ length: 31 }, (_, dayIdx) => {
              const d = dayIdx + 1;
              const hasOp = Boolean(operators[d]);
              return (
                <td key={d} className="border border-black p-0 text-center font-bold text-[14px]">
                  {hasOp ? '✓' : ''}
                </td>
              );
            })}
          </tr>

          {/* Row 3: Người thực hiện (Vertical text signature, e.g. THB010) */}
          <tr className="h-14 bg-white">
            <td className="border border-black text-center font-bold text-[11px]">3</td>
            <td className="border border-black px-1.5 text-center text-[12px] font-bold">
              Người thực hiện
            </td>
            {Array.from({ length: 31 }, (_, dayIdx) => {
              const d = dayIdx + 1;
              const op = operators[d];
              return (
                <td
                  key={d}
                  className="border border-black p-0 text-center align-middle overflow-visible"
                >
                  {op && (
                    <span
                      className="inline-block text-[9px] font-bold text-black tracking-tight uppercase"
                      style={{
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        whiteSpace: 'nowrap',
                        maxHeight: '48px',
                      }}
                    >
                      {op}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>

      {/* Section II: Bảo dưỡng hằng tuần */}
      <div className="mt-3.5 mb-1 text-sm font-bold uppercase text-slate-900">
        II. BẢO DƯỠNG HẰNG TUẦN: (NGƯỜI SỬ DỤNG THỰC HIỆN)
      </div>

      <table className="w-full border-collapse border border-black text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-white">
            <th className="border border-black p-1 text-center font-bold" style={{ width: '240px' }}>
              Thời gian thực hiện
            </th>
            <th className="border border-black p-1 text-center font-bold">
              Nội dung thực hiện
            </th>
            <th className="border border-black p-1 text-center font-bold" style={{ width: '190px' }}>
              Người thực hiện
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-6">
            <td className="border border-black px-2 text-left">Tuần 1 (ngày....................)</td>
            <td className="border border-black px-2" />
            <td className="border border-black px-2 text-center" />
          </tr>
          <tr className="h-6">
            <td className="border border-black px-2 text-left">Tuần 2 (ngày....................)</td>
            <td className="border border-black px-2" />
            <td className="border border-black px-2 text-center" />
          </tr>
          <tr className="h-6">
            <td className="border border-black px-2 text-left">Tuần 3 (ngày....................)</td>
            <td className="border border-black px-2" />
            <td className="border border-black px-2 text-center" />
          </tr>
          <tr className="h-6">
            <td className="border border-black px-2 text-left">Tuần 4 (ngày....................)</td>
            <td className="border border-black px-2" />
            <td className="border border-black px-2 text-center" />
          </tr>
        </tbody>
      </table>

      {/* Section III: Bảo dưỡng định kỳ */}
      <div className="mt-3.5 mb-1 text-sm font-bold uppercase text-slate-900">
        III. BẢO DƯỠNG THÁNG/ QUÝ/ 6 THÁNG/ 12 THÁNG : KS CÔNG TY THỰC HIỆN
      </div>

      <table className="w-full border-collapse border border-black text-xs" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr className="bg-white">
            <th className="border border-black p-1 text-center font-bold" style={{ width: '45%' }}>
              NỘI DUNG BẢO TRÌ
            </th>
            <th colSpan={2} className="border border-black p-1 text-center font-bold">
              Ngày ..........Tháng ..............Năm...............
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-9">
            <td className="border border-black px-2 text-left font-normal">
              Thực hiện theo nội dung của phụ lục bảo trì thiết bị (SD-EQ-AL-003/1001)
            </td>
            <td className="border border-black px-2 text-left" style={{ width: '27%' }}>
              KS thực hiện:
            </td>
            <td className="border border-black px-2 text-left" style={{ width: '28%' }}>
              NV tiếp nhận:
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-800 mt-2 pt-1">
        <div>FM-EQ-HE-006 V2.0</div>
        <div>Ngày hiệu lực 01/05/2021</div>
      </div>
    </div>
  );
}

/**
 * Component: Interactive Curve View (Wave Graph with KPIs and tooltips)
 */
function InteractiveCurveView({
  chartRows,
  specs,
  resolvedCabinet,
  resolvedMonth,
  getStaffDisplayName,
}) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const chartWidth = 980;
  const chartHeight = 380;
  const padding = { top: 45, right: 65, bottom: 65, left: 65 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Y Scale calculation
  const { yMin, yMax, yTicks } = useMemo(() => {
    const values = [];
    chartRows.forEach((r) => {
      const t = parseDecimal(r.nhiet_do_do_dc);
      if (t !== null) values.push(t);
    });

    if (specs.tempMin !== undefined && specs.tempMax !== undefined) {
      values.push(specs.tempMin, specs.tempMax);
    } else if (specs.highlightTemps) {
      values.push(...specs.highlightTemps);
    }

    if (values.length === 0) {
      return { yMin: 0, yMax: 10, yTicks: [0, 2, 4, 6, 8, 10] };
    }

    let min = Math.min(...values);
    let max = Math.max(...values);
    const span = max - min || 1;
    min = Math.floor(min - span * 0.15);
    max = Math.ceil(max + span * 0.15);

    const step = Math.max(1, Math.round((max - min) / 5));
    const ticks = [];
    for (let v = min; v <= max; v += step) {
      ticks.push(v);
    }
    if (!ticks.includes(max)) ticks.push(max);

    return { yMin: min, yMax: max, yTicks: ticks };
  }, [chartRows, specs]);

  const getY = (val) => {
    if (yMax === yMin) return padding.top + innerHeight / 2;
    const ratio = (val - yMin) / (yMax - yMin);
    return padding.top + innerHeight - ratio * innerHeight;
  };

  const getX = (idx, total) => {
    if (total <= 1) return padding.left + innerWidth / 2;
    return padding.left + (idx / (total - 1)) * innerWidth;
  };

  // Build connecting curve
  const { linePath, areaPath, pointsData } = useMemo(() => {
    if (chartRows.length === 0) {
      return { linePath: '', areaPath: '', pointsData: [] };
    }

    const points = chartRows.map((r, idx) => ({
      x: getX(idx, chartRows.length),
      y: getY(parseDecimal(r.nhiet_do_do_dc) ?? 0),
      row: r,
      idx,
    }));

    if (points.length === 1) {
      const p = points[0];
      return {
        linePath: `M ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y}`,
        areaPath: `M ${p.x - 20} ${padding.top + innerHeight} L ${p.x - 20} ${p.y} L ${p.x + 20} ${p.y} L ${p.x + 20} ${padding.top + innerHeight} Z`,
        pointsData: points,
      };
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const midX = (p0.x + p1.x) / 2;
      d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
    }

    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = padding.top + innerHeight;
    const area = `${d} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

    return { linePath: d, areaPath: area, pointsData: points };
  }, [chartRows, yMin, yMax]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="relative w-full min-h-[380px] overflow-hidden select-none">
        {chartRows.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 text-slate-400">
            <Thermometer className="h-12 w-12 text-slate-300" />
            <p className="text-sm font-bold text-slate-600">
              Không có dữ liệu nhiệt độ cho thiết bị này trong tháng {resolvedMonth}
            </p>
          </div>
        ) : (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="tempAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((tickVal) => {
              const y = getY(tickVal);
              return (
                <g key={tickVal}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={padding.left + innerWidth}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                  <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="#64748b">
                    {tickVal}°C
                  </text>
                </g>
              );
            })}

            {/* Area fill */}
            {areaPath && <path d={areaPath} fill="url(#tempAreaGradient)" />}

            {/* Curve line */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points */}
            {pointsData.map((p) => {
              const isPass = (p.row.ket_qua || '').toUpperCase() === 'ĐẠT';
              const isHovered = hoveredPoint?.idx === p.idx;

              return (
                <g
                  key={p.idx}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredPoint(p)}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  {isHovered && (
                    <circle cx={p.x} cy={p.y} r="12" fill={isPass ? '#dbeafe' : '#fee2e2'} opacity="0.8" />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? '6' : '4.5'}
                    fill={isPass ? '#2563eb' : '#ef4444'}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  {/* Date label */}
                  <g transform={`translate(${p.x}, ${padding.top + innerHeight + 16})`}>
                    <text
                      x="0"
                      y="0"
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill={isHovered ? '#1e40af' : '#475569'}
                    >
                      {(p.row.ngay || '').split('/')[0] || p.idx + 1}
                    </text>
                    <text
                      x="0"
                      y="14"
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill={p.row.khung_h === 'Sáng' ? '#2563eb' : '#d97706'}
                    >
                      {p.row.khung_h ? p.row.khung_h.charAt(0) : ''}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        )}

        {/* Floating Tooltip */}
        {hoveredPoint && (
          <div
            className="pointer-events-none absolute z-20 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-xs text-xs animate-fade-in-up"
            style={{
              left: `${Math.min(chartWidth - 220, Math.max(20, (hoveredPoint.x / chartWidth) * 100))}%`,
              top: `${Math.max(10, Math.min(220, (hoveredPoint.y / chartHeight) * 100 - 30))}%`,
              minWidth: '200px',
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5">
              <span className="font-extrabold text-slate-800">
                {hoveredPoint.row.ngay_h || hoveredPoint.row.ngay}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  (hoveredPoint.row.ket_qua || '').toUpperCase() === 'ĐẠT'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {hoveredPoint.row.ket_qua || 'Chưa đánh giá'}
              </span>
            </div>

            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Khung giờ:</span>
                <span className="font-bold text-slate-800">{hoveredPoint.row.khung_h || '—'}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-slate-400">Nhiệt độ đo:</span>
                <span className="text-sm font-black text-blue-600">{formatDecimal(hoveredPoint.row.nhiet_do_do_dc)}°C</span>
              </div>
              {hoveredPoint.row.do_am_do_dc && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Độ ẩm đo:</span>
                  <span className="font-semibold text-slate-700">{formatDecimal(hoveredPoint.row.do_am_do_dc)}%</span>
                </div>
              )}
              <div className="flex justify-between items-baseline gap-2">
                <span className="text-slate-400 shrink-0">Nhân viên:</span>
                <span className="font-semibold text-slate-800 text-right truncate">
                  {getStaffDisplayName
                    ? getStaffDisplayName(hoveredPoint.row.id_nv)
                    : hoveredPoint.row.id_nv || '—'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
