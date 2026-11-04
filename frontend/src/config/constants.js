export const CONFIG = {
  spreadsheetId: import.meta.env.VITE_SPREADSHEET_ID || "",
  authSheetName: "DSNV",
  serviceAccountEmail: import.meta.env.VITE_SERVICE_ACCOUNT_EMAIL || "",
  // Lấy từ biến môi trường (file .env.local khi chạy máy, Environment Variables trên Vercel)
  privateKey: (import.meta.env.VITE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  specialCabinets: [
    "fiochetti eumotica 400",
    "phcbi-a",
    "phcbi-b",
    "kw",
    "panasonic mdf-137",
    "thermo scientific",
    "helmer pc100i",
  ],
  normalScheduleCabinets: ["tu lanh tru hoa chat thermo scientific"],
  humidityRoomNames: [
    "phiếu theo dõi nhiệt độ và độ ẩm phòng nhận mẫu",
    "phiếu theo dõi nhiệt độ và độ ẩm phòng đông máu - tế bào",
    "phiếu theo dõi nhiệt độ và độ ẩm phòng ngân hàng máu",
  ],
};
