import React, { useState } from 'react';
import { Key, X, Eye, EyeOff } from 'lucide-react';
import { updateUserPassword } from '../services/googleSheets';

export default function ChangePasswordModal({ currentUser, onClose, onChanged }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const o = oldPw.trim();
    const n = newPw.trim();
    const c = confirmPw.trim();

    if (!o || !n || !c) return setError('Vui lòng nhập đầy đủ các ô.');
    if (n.length < 4) return setError('Mật khẩu mới phải có ít nhất 4 ký tự.');
    if (n !== c) return setError('Mật khẩu mới và ô xác nhận không khớp.');
    if (n === o) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');

    setSaving(true);
    try {
      await updateUserPassword(currentUser?.id, o, n);
      setSuccess('Đổi mật khẩu thành công!');
      if (onChanged) onChanged(n);
      setTimeout(() => onClose && onClose(), 1200);
    } catch (err) {
      setError(err.message || 'Đổi mật khẩu thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const inputType = show ? 'text' : 'password';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl text-slate-700 animate-fade-in-up"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Key className="h-4 w-4 text-teal-600" />
            Đổi mật khẩu
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Tài khoản: <span className="font-bold text-slate-700">{currentUser?.id}</span>
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Mật khẩu hiện tại</label>
            <input
              type={inputType}
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              className="input-modern"
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Mật khẩu mới</label>
            <input
              type={inputType}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="input-modern"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Nhập lại mật khẩu mới</label>
            <input
              type={inputType}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className="input-modern"
              autoComplete="new-password"
            />
          </div>
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700"
          >
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            {success}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60 transition"
          >
            {saving ? 'Đang lưu...' : 'Lưu mật khẩu'}
          </button>
        </div>
      </form>
    </div>
  );
}
