import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import SignaturePadLib from 'signature_pad';
import { PenTool, RotateCcw } from 'lucide-react';

const SignaturePad = forwardRef(function SignaturePad(props, ref) {
  const canvasRef = useRef(null);
  const padInstanceRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resizeCanvas() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      if (padInstanceRef.current) {
        padInstanceRef.current.clear();
      }
    }

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
    });
    padInstanceRef.current = pad;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      pad.off();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      if (padInstanceRef.current) {
        padInstanceRef.current.clear();
      }
    },
    isEmpty: () => {
      return !padInstanceRef.current || padInstanceRef.current.isEmpty();
    },
    // Xuất chữ ký đã thu nhỏ để không vượt giới hạn 50.000 ký tự/ô của Google Sheets.
    // (Canvas gốc trên điện thoại được nhân theo devicePixelRatio nên ảnh rất nặng.)
    toDataURL: () => {
      const pad = padInstanceRef.current;
      const src = canvasRef.current;
      if (!pad || pad.isEmpty() || !src) return '';

      const MAX_LEN = 40000;
      const rect = src.getBoundingClientRect();
      let w = Math.min(Math.round(rect.width) || 400, 400);
      let h = Math.round(w * (src.height / src.width)) || 160;

      const render = (width, height, type, quality) => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(src, 0, 0, width, height);
        // Chuyển sang trắng đen tuyệt đối: ảnh PNG nhẹ hơn khoảng một nửa
        const img = ctx.getImageData(0, 0, width, height);
        const p = img.data;
        for (let i = 0; i < p.length; i += 4) {
          const v = (p[i] + p[i + 1] + p[i + 2]) / 3 < 170 ? 0 : 255;
          p[i] = v;
          p[i + 1] = v;
          p[i + 2] = v;
          p[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return c.toDataURL(type, quality);
      };

      let url = render(w, h, 'image/png');
      // Thu nhỏ dần nếu vẫn quá lớn
      while (url.length > MAX_LEN && w > 160) {
        w = Math.round(w * 0.8);
        h = Math.round(h * 0.8);
        url = render(w, h, 'image/png');
      }
      // Phương án cuối: JPEG nén
      if (url.length > MAX_LEN) {
        url = render(w, h, 'image/jpeg', 0.6);
      }
      return url;
    },
  }));

  const handleClear = () => {
    if (padInstanceRef.current) {
      padInstanceRef.current.clear();
    }
  };

  return (
    <div className="pt-2">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-sm font-bold text-slate-700">
          Chữ ký nhân viên trực
        </label>
        <button
          type="button"
          onClick={handleClear}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 active:scale-95"
        >
          <RotateCcw className="h-3 w-3" />
          Ký lại
        </button>
      </div>

      <div className="group relative h-40 w-full touch-none overflow-hidden rounded-2xl border-2 border-teal-200 bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 h-full w-full cursor-crosshair touch-none"
        />

        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center opacity-30 transition group-hover:opacity-10">
          <PenTool className="mb-1 h-8 w-8 text-teal-700" />
          <span className="text-xs font-semibold tracking-wide text-teal-800">
            Ký vào khoảng trống
          </span>
        </div>
      </div>
    </div>
  );
});

export default SignaturePad;
