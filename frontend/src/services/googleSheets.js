import jsrsasign from 'jsrsasign';
import { CONFIG } from '../config/constants';
import { shiftDateFor } from '../utils/shiftDate';

let cachedAccessToken = null;
let tokenExpiry = 0;

/**
 * Obtain OAuth2 Access Token for Google Sheets API using Service Account
 */
export async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: CONFIG.serviceAccountEmail,
    scope: CONFIG.scopes.join(' '),
    aud: CONFIG.tokenUrl,
    exp: now + 3600,
    iat: now,
  };

  const KJUR = jsrsasign.KJUR || window.KJUR;
  const sJWT = KJUR.jws.JWS.sign(
    'RS256',
    JSON.stringify(header),
    JSON.stringify(payload),
    CONFIG.privateKey
  );

  const response = await fetch(CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${sJWT}`,
  });

  if (!response.ok) {
    throw new Error('Không thể xác thực với Google API (Lỗi token)');
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedAccessToken;
}

/**
 * Fetch staff users list from DSNV sheet
 */
export async function fetchUsers() {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${CONFIG.authSheetName}!A1:Z200`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    throw new Error('Lỗi khi tải danh sách nhân viên từ Google Sheets');
  }

  const data = await resp.json();
  if (!data.values || data.values.length <= 1) {
    return [];
  }

  const headers = data.values[0].map((h) =>
    h ? h.toString().trim().toLowerCase() : ''
  );
  const iId = headers.findIndex((h) => h === 'id');
  const iName = headers.findIndex(
    (h) => h === 'ho_ten' || h === 'họ tên' || h === 'name' || h === 'ten'
  );
  const iPass = headers.findIndex(
    (h) => h === 'password' || h === 'mat_khau' || h === 'mk'
  );
  const iRole = headers.findIndex((h) => h === 'role' || h === 'quyen');

  return data.values
    .slice(1)
    .map((r) => ({
      id: iId !== -1 ? r[iId] || '' : r[0] || '',
      name: iName !== -1 ? r[iName] || '' : r[1] || '',
      role: iRole !== -1 ? r[iRole] || '' : r[5] || '',
      password: iPass !== -1 ? r[iPass] || '' : r[6] || '',
    }))
    .filter((u) => u.id);
}

/**
 * Đổi mật khẩu nhân viên trong sheet DSNV.
 * Kiểm tra lại mật khẩu hiện tại từ sheet (dữ liệu mới nhất) trước khi ghi.
 */
export async function updateUserPassword(userId, currentPassword, newPassword) {
  const token = await getAccessToken();
  const sheet = CONFIG.authSheetName;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${sheet}!A1:Z200`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error('Không tải được danh sách nhân viên');
  const data = await resp.json();
  const rows = data.values || [];
  if (rows.length <= 1) throw new Error('Sheet DSNV trống');

  const headers = rows[0].map((h) => (h ? h.toString().trim().toLowerCase() : ''));
  let iId = headers.findIndex((h) => h === 'id');
  let iPass = headers.findIndex((h) => h === 'password' || h === 'mat_khau' || h === 'mk');
  if (iId === -1) iId = 0;
  if (iPass === -1) iPass = 6;

  const target = String(userId || '').trim().toLowerCase();
  const rowIdx = rows.findIndex(
    (r, i) => i > 0 && String(r[iId] || '').trim().toLowerCase() === target
  );
  if (rowIdx === -1) throw new Error('Không tìm thấy tài khoản trong DSNV');

  const savedPassword = String(rows[rowIdx][iPass] || '').trim();
  if (savedPassword !== String(currentPassword || '').trim()) {
    throw new Error('Mật khẩu hiện tại không đúng');
  }

  // Đổi số cột sang chữ (0 -> A, 6 -> G)
  let col = '';
  let n = iPass + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    col = String.fromCharCode(65 + m) + col;
    n = Math.floor((n - 1) / 26);
  }
  const cell = `${sheet}!${col}${rowIdx + 1}`;

  // RAW: giữ nguyên chuỗi (vd "0123" không bị mất số 0 đầu)
  const upd = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/${encodeURIComponent(cell)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[String(newPassword)]] }),
    }
  );
  if (!upd.ok) throw new Error('Lỗi khi lưu mật khẩu mới lên Google Sheets');
  return true;
}

/**
 * Fetch cabinets list from DS_TU sheet
 */
export async function fetchCabinets() {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/DS_TU!A1:Z1000`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    throw new Error('Lỗi khi tải danh sách tủ từ Google Sheets');
  }

  const data = await resp.json();
  if (!data.values || data.values.length <= 1) {
    return [];
  }

  const headers = data.values[0].map((h) =>
    h ? h.toString().trim().toLowerCase() : ''
  );
  const iId = headers.findIndex((h) => h === 'id' || h === 'id_tu');
  const iTen = headers.findIndex(
    (h) => h === 'ten' || h === 'tên' || h === 'tên tủ'
  );
  const iViTri = headers.findIndex((h) => h === 'vi_tri' || h === 'vị trí');
  const iMin = headers.findIndex(
    (h) => h === 'nhiet_do_min' || h === 'nhiệt độ min' || h === 'min'
  );
  const iMax = headers.findIndex(
    (h) => h === 'nhiet_do_max' || h === 'nhiệt độ max' || h === 'max'
  );
  const iAmMin = headers.findIndex(
    (h) => h === 'do_am_min' || h === 'độ ẩm min'
  );
  const iAmMax = headers.findIndex(
    (h) => h === 'do_am_max' || h === 'độ ẩm max'
  );

  return data.values
    .slice(1)
    .map((r) => ({
      id: iId !== -1 ? r[iId] : r[0],
      ten: iTen !== -1 ? r[iTen] : r[1],
      vi_tri: iViTri !== -1 ? r[iViTri] : r[2] || '',
      nhiet_do_min: iMin !== -1 ? r[iMin] : r[3],
      nhiet_do_max: iMax !== -1 ? r[iMax] : r[4],
      do_am_min: iAmMin !== -1 ? r[iAmMin] : r[5] || '',
      do_am_max: iAmMax !== -1 ? r[iAmMax] : r[6] || '',
    }))
    .filter((t) => t.id);
}

/**
 * Fetch all records from DATA sheet
 */
export async function fetchDataRows() {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.spreadsheetId}/values/DATA!A:Z`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resp.ok) {
    throw new Error('Lỗi khi tải dữ liệu từ sheet DATA');
  }

  const data = await resp.json();
  if (!data.values || data.values.length <= 1) {
    return [];
  }

  // Row 0 is headers
  return data.values
    .slice(1)
    .map((r, idx) => ({
      rowIndex: idx + 1,
      uniqueId: `row_${idx + 1}_${r[0] || ''}`,
      id: r[0] || '',
      ngay: r[1] || '',
      ngay_h: r[2] || '',
      khung_h: r[3] || '',
      qr_code: r[4] || '',
      id_tu: r[5] || '',
      ten: r[6] || '',
      vi_tri: r[7] || '',
      nhiet_do_min: r[8] || '',
      nhiet_do_max: r[9] || '',
      nhiet_do_do_dc: r[10] || '',
      do_am_min: r[11] || '',
      do_am_max: r[12] || '',
      do_am_do_dc: r[13] || '',
      ket_qua: (r[14] || '').toUpperCase(),
      id_nv: r[15] || '',
      ghi_chu: r[16] || '',
      chu_ky: r[17] || '',
      xac_nhan: r[18] || '',
      udt: r[19] || '',
      nam_thang: r[21] || '',
    }))
    .reverse(); // Most recent first
}

let cachedDataSheetId = null;

/**
 * Reset number format (về "Tự động") cho cột I:N (nhiet_do_min ... do_am_do_dc) của dòng vừa append
 */
async function resetNumberFormat(token, sid, appendResult) {
  const range = appendResult?.updates?.updatedRange || ''; // vd: DATA!A4020:W4020
  const m = range.match(/![A-Z]+(\d+)(?::[A-Z]+(\d+))?/);
  if (!m) return;
  const rowIndex = parseInt(m[1], 10) - 1;
  const endRowIndex = m[2] ? parseInt(m[2], 10) : rowIndex + 1;

  if (cachedDataSheetId === null) {
    const meta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=sheets.properties(sheetId,title)`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
    const sheet = (meta.sheets || []).find((s) => s.properties.title === 'DATA');
    if (!sheet) return;
    cachedDataSheetId = sheet.properties.sheetId;
  }

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: cachedDataSheetId,
              startRowIndex: rowIndex,
              endRowIndex: endRowIndex,
              startColumnIndex: 8, // I
              endColumnIndex: 14, // N (exclusive)
            },
            cell: { userEnteredFormat: {} },
            fields: 'userEnteredFormat.numberFormat',
          },
        },
      ],
    }),
  });
}

/**
 * Ghi các dòng vào CUỐI sheet DATA, đúng cột A -> W.
 * Không dùng values:append vì Google tự đoán "bảng" và có thể ghi lệch cột
 * khi có dòng để trống nhiều ô (vd dòng do AppSheet tạo).
 * Trả về kết quả giống append: { updates: { updatedRange } }
 */
async function writeRowsAtEnd(token, sid, rows) {
  const auth = { Authorization: `Bearer ${token}` };
  // Dòng cuối có dữ liệu ở cột A
  const colA = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/DATA!A:A?majorDimension=COLUMNS`,
    { headers: auth }
  ).then((r) => r.json());
  const lastRow = (colA.values && colA.values[0] ? colA.values[0].length : 1) || 1;
  const startRow = lastRow + 1;
  const endRow = startRow + rows.length - 1;

  // Đảm bảo sheet đủ số dòng
  const meta = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`,
    { headers: auth }
  ).then((r) => r.json());
  const sheet = (meta.sheets || []).find((x) => x.properties.title === 'DATA');
  if (sheet) {
    cachedDataSheetId = sheet.properties.sheetId;
    const rowCount = sheet.properties.gridProperties?.rowCount || 0;
    if (endRow > rowCount) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}:batchUpdate`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              appendDimension: {
                sheetId: sheet.properties.sheetId,
                dimension: 'ROWS',
                length: endRow - rowCount + 50,
              },
            },
          ],
        }),
      });
    }
  }

  const range = `DATA!A${startRow}:W${endRow}`;
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    }
  );
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message || '';
    } catch {
      /* ignore */
    }
    throw new Error(`Lỗi khi lưu dữ liệu lên Google Sheets (mã ${res.status})${detail ? ': ' + detail : ''}`);
  }
  return { updates: { updatedRange: range } };
}

/**
 * Generate 8-character random ID
 */
export function genRandomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}

/**
 * Submit temperature record to Google Sheets: DATA, CV (conditional), DATA_ALL (conditional)
 */
export async function submitRecord({
  idTu,
  qrCode,
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
  chuKy,
  currentUser,
  measuredAt, // (tuỳ chọn) Date: ngày giờ đo cụ thể khi thêm bản ghi thủ công
}) {
  const token = await getAccessToken();
  const isManual = measuredAt instanceof Date && !isNaN(measuredAt);
  const now = isManual ? measuredAt : new Date();
  const pad0 = (n) => (n < 10 ? '0' + n : n);

  const idVal = genRandomId();
  // ngay_h = thời điểm đo thật; ngay / nam_thang = NGÀY THEO CA
  // (L5, L6 đo trước 7h sáng thuộc ngày hôm trước)
  const realDateVal = `${pad0(now.getDate())}/${pad0(now.getMonth() + 1)}/${now.getFullYear()}`;
  const ngayHVal = `${realDateVal} ${pad0(now.getHours())}:${pad0(now.getMinutes())}:${pad0(now.getSeconds())}`;
  const shiftDay = shiftDateFor(khungH, now);
  const ngayVal = `${pad0(shiftDay.getDate())}/${pad0(shiftDay.getMonth() + 1)}/${shiftDay.getFullYear()}`;
  const idNvVal = currentUser ? currentUser.id || currentUser.name : '';
  const tenNvVal = currentUser ? currentUser.name || '' : '';
  const qrCodeVal = qrCode || idTu;

  const xacNhanVal = '';
  const udtVal = new Date().toISOString(); // thời điểm ghi thực tế
  const lb1Val = `${idTu} | ${String(nhietDoDoDc).replace('.', ',')} | ${ketQua}`;
  const namThangVal = `${shiftDay.getFullYear()}/${pad0(shiftDay.getMonth() + 1)}`;
  const namThangTuVal = `${namThangVal} | ${idTu}`;

  // Gửi số dạng Number để Google Sheets (locale vi_VN) lưu đúng số thập phân, vd "2,6" -> 2.6
  const toNum = (v) => {
    const str = String(v ?? '').trim().replace(',', '.');
    if (str === '') return '';
    const n = Number(str);
    return isNaN(n) ? v : n;
  };

  const rowData = [
    idVal,
    ngayVal,
    ngayHVal,
    khungH,
    qrCodeVal,
    idTu,
    tenTu,
    viTri,
    toNum(nhietDoMin),
    toNum(nhietDoMax),
    toNum(nhietDoDoDc),
    toNum(doAmMin),
    toNum(doAmMax),
    toNum(doAmDoDc),
    ketQua,
    idNvVal,
    ghiChu,
    chuKy,
    xacNhanVal,
    udtVal,
    lb1Val,
    "'" + namThangVal,
    namThangTuVal,
  ];

  const rowCV = [
    genRandomId(),
    ngayVal,
    idNvVal,
    tenNvVal,
    true,
    true,
    udtVal,
  ];

  const nowTotalMinutes = now.getHours() * 60 + now.getMinutes();
  const shouldAppendCV =
    !isManual && // thêm thủ công (ghi bù) không ghi vào CV
    (khungH === 'Sáng' || khungH === 'L1') &&
    nowTotalMinutes >= 390 &&
    nowTotalMinutes <= 510;

  const sid = CONFIG.spreadsheetId;
  const urlCV = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/CV:append?valueInputOption=USER_ENTERED`;

  // Google Sheets giới hạn 50.000 ký tự / ô
  if (String(chuKy || '').length > 49000) {
    throw new Error('Chữ ký quá lớn, vui lòng bấm "Ký lại" và ký gọn hơn.');
  }

  // Ghi đúng cột A -> W ở cuối sheet DATA
  const appendResult = await writeRowsAtEnd(token, sid, [rowData]);

  // Đặt định dạng "Tự động" cho các cột số (I:N) của dòng vừa thêm,
  // tránh việc dòng mới kế thừa định dạng Ngày khiến 3,5 hiện thành ngày tháng.
  try {
    await resetNumberFormat(token, sid, appendResult);
  } catch (fmtErr) {
    console.error('Lỗi đặt định dạng số:', fmtErr);
  }

  let resCV = { ok: true };
  if (shouldAppendCV) {
    resCV = await fetch(urlCV, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [rowCV] }),
    });
  }

  // DATA_ALL logic: Check for duplicates and append if not exists
  try {
    const idAll = `${namThangVal} | ${tenTu}`;
    const urlAllCheck = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/DATA_ALL!A:A`;
    const resCheckAll = await fetch(urlAllCheck, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dataCheckAll = await resCheckAll.json();

    let existsInAll = false;
    if (dataCheckAll.values) {
      existsInAll = dataCheckAll.values.flat().some((v) => v === idAll);
    }

    if (!existsInAll) {
      const urlAllAppend = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/DATA_ALL:append?valueInputOption=USER_ENTERED`;
      await fetch(urlAllAppend, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [[idAll, "'" + namThangVal, tenTu]],
        }),
      });
    }
  } catch (allErr) {
    console.error('DATA_ALL error:', allErr);
  }

  // DATA đã lưu thành công; lỗi ghi CV chỉ ghi log để người dùng không bấm lưu lại (tránh trùng dòng DATA)
  if (!resCV.ok) {
    console.error('CV append error:', resCV.status);
  }

  return true;
}

/**
 * Nhập nhanh: ghi NHIỀU bản ghi vào DATA trong 1 lần gọi (ghi bù, không chữ ký, không ghi CV).
 * records: [{ idTu, tenTu, viTri, nhietDoMin, nhietDoMax, nhietDoDoDc, doAmMin, doAmMax, doAmDoDc,
 *             ketQua, khungH, ghiChu, currentUser:{id,name}, measuredAt: Date }]
 */
export async function submitRecordsBatch(records) {
  if (!records || records.length === 0) return 0;
  const token = await getAccessToken();
  const sid = CONFIG.spreadsheetId;
  const pad0 = (n) => (n < 10 ? '0' + n : n);
  const toNum = (v) => {
    const str = String(v ?? '').trim().replace(',', '.');
    if (str === '') return '';
    const n = Number(str);
    return isNaN(n) ? v : n;
  };
  const udtVal = new Date().toISOString();
  const monthKeys = new Map(); // DATA_ALL: "yyyy/mm | tên tủ"

  const rows = records.map((r) => {
    const t = r.measuredAt;
    const realDate = `${pad0(t.getDate())}/${pad0(t.getMonth() + 1)}/${t.getFullYear()}`;
    const ngayH = `${realDate} ${pad0(t.getHours())}:${pad0(t.getMinutes())}:${pad0(t.getSeconds())}`;
    const sd = shiftDateFor(r.khungH, t);
    const ngay = `${pad0(sd.getDate())}/${pad0(sd.getMonth() + 1)}/${sd.getFullYear()}`;
    const namThang = `${sd.getFullYear()}/${pad0(sd.getMonth() + 1)}`;
    monthKeys.set(`${namThang} | ${r.tenTu}`, [namThang, r.tenTu]);
    const idNv = r.currentUser ? r.currentUser.id || r.currentUser.name : '';
    return [
      genRandomId(),
      ngay,
      ngayH,
      r.khungH,
      r.idTu,
      r.idTu,
      r.tenTu,
      r.viTri,
      toNum(r.nhietDoMin),
      toNum(r.nhietDoMax),
      toNum(r.nhietDoDoDc),
      toNum(r.doAmMin),
      toNum(r.doAmMax),
      toNum(r.doAmDoDc),
      r.ketQua,
      idNv,
      r.ghiChu || '',
      '',
      '',
      udtVal,
      `${r.idTu} | ${String(r.nhietDoDoDc).replace('.', ',')} | ${r.ketQua}`,
      "'" + namThang,
      `${namThang} | ${r.idTu}`,
    ];
  });

  // Ghi đúng cột A -> W ở cuối sheet DATA
  const appendResult = await writeRowsAtEnd(token, sid, rows);
  try {
    await resetNumberFormat(token, sid, appendResult);
  } catch (fmtErr) {
    console.error('Lỗi đặt định dạng số:', fmtErr);
  }

  // DATA_ALL: thêm các tháng chưa có
  try {
    const chk = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/DATA_ALL!A:A`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((x) => x.json());
    const existing = new Set((chk.values || []).flat());
    const add = [...monthKeys.entries()]
      .filter(([k]) => !existing.has(k))
      .map(([k, [nt, ten]]) => [k, "'" + nt, ten]);
    if (add.length) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/DATA_ALL:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: add }),
        }
      );
    }
  } catch (allErr) {
    console.error('DATA_ALL error:', allErr);
  }

  return rows.length;
}
