import React, { useState, useRef, useEffect } from 'react';
import { Activity, Key, LogOut } from 'lucide-react';

export default function Header({ currentUser, onLogout }) {

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = () => {
    if (!currentUser) return '?';
    const name = currentUser.name || currentUser.id || '';
    const parts = name.trim().split(' ');
    return parts[parts.length - 1].charAt(0).toUpperCase() || '?';
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-gradient-to-r from-teal-700 via-teal-600 to-teal-500 px-4 md:px-8 text-white shadow-md shadow-teal-900/10">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm shadow-inner">
          <Activity className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight md:text-base leading-tight">
            Khoa Xét nghiệm Huyết Học — Bệnh viện Nhi Đồng 1
          </h1>
          <p className="text-[11px] text-teal-100 font-medium hidden sm:block">
            Hệ thống theo dõi & ghi nhận nhiệt độ thiết bị
          </p>
        </div>
      </div>

      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2.5 rounded-full p-1 pl-2.5 transition hover:bg-white/10 active:scale-95"
          id="userMenuButton"
        >
          <div className="hidden text-right leading-tight sm:block">
            <span className="block text-sm font-bold text-white whitespace-nowrap">
              {currentUser?.name || currentUser?.id || 'Nhân viên'}
            </span>
            <span className="block text-[11px] font-semibold text-teal-100 capitalize whitespace-nowrap">
              {currentUser?.role || 'Nhân viên'}
            </span>
          </div>

          <div className="relative flex items-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/25 text-sm font-bold text-white shadow-sm backdrop-blur-sm">
              {getInitials()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-teal-700 bg-emerald-400" />
          </div>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl z-50 text-slate-700 animate-fade-in-up">
            <div className="border-b border-slate-100 px-3 py-2.5 mb-1">
              <div className="text-sm font-bold text-slate-800">
                {currentUser?.name || currentUser?.id}
              </div>
              <div className="text-xs font-semibold text-slate-400 capitalize mt-0.5">
                Mã NV: {currentUser?.id} ({currentUser?.role || 'Nhân viên'})
              </div>
            </div>

            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-teal-50 hover:text-teal-900"
            >
              <Key className="h-4 w-4 text-slate-400" />
              Đổi mật khẩu
            </button>

            <div className="my-1 border-t border-slate-100" />


            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="h-4 w-4 text-red-500" />
              Đăng xuất
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
