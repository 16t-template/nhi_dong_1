import React, { useState, useEffect } from 'react';
import LoginScreen from './components/LoginScreen';
import Header from './components/Header';
import ErpLayout from './components/ErpLayout';
import ErpHome from './components/ErpHome';
import DataModule from './components/DataModule';
import TemperatureForm from './components/TemperatureForm';
import ChartOnlyView from './components/ChartOnlyView';
import { fetchUsers, fetchCabinets } from './services/googleSheets';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_user_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Rule:
  // Nếu KHÔNG CÓ path (/ hoặc rỗng) -> Mở Form nhập liệu
  // Nếu CÓ /trang_chu -> Mở Trang chủ ERP (Ảnh 1)
  // Nếu CÓ /data -> Mở Module DATA (Ảnh 2)
  // Nếu CÓ /data/<tên tủ hoặc mã tủ>/<tháng> (vd: /data/HE-sp-003/07-2026) -> Chỉ hiện biểu đồ
  const getChartParams = () => {
    const segs = window.location.pathname.split('/').filter(Boolean);
    const first = (segs[0] || '').toLowerCase();
    if ((first === 'data' || first === 'bieu_do' || first === 'bieu-do') && segs.length >= 3) {
      const dec = (x) => {
        try {
          return decodeURIComponent(x);
        } catch {
          return x;
        }
      };
      return {
        cabinet: dec(segs.slice(1, -1).join('/')),
        month: dec(segs[segs.length - 1]),
      };
    }
    return null;
  };

  const getInitialRoute = () => {
    if (getChartParams()) return 'chart_only';
    const rawPath = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    if (rawPath === '/trang_chu' || rawPath === '/trang-chu') return 'trang_chu';
    if (rawPath === '/data') return 'data';
    return 'form';
  };

  const [activeRoute, setActiveRoute] = useState(getInitialRoute);
  const [usersList, setUsersList] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [dsTu, setDsTu] = useState([]);

  // Sync route with URL bar
  const navigateTo = (route) => {
    setActiveRoute(route);
    let targetPath = '/';
    if (route === 'trang_chu') targetPath = '/trang_chu';
    else if (route === 'data') targetPath = '/data';
    else if (route === 'form') targetPath = '/';

    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
  };


  useEffect(() => {
    const handlePopState = () => {
      setActiveRoute(getInitialRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Load initial Google Sheets data
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoadingUsers(true);
      try {
        const [users, cabinets] = await Promise.all([
          fetchUsers().catch((err) => {
            console.error('Lỗi nạp DSNV:', err);
            return [];
          }),
          fetchCabinets().catch((err) => {
            console.error('Lỗi nạp DS_TU:', err);
            return [];
          }),
        ]);

        if (isMounted) {
          setUsersList(users);
          setDsTu(cabinets);
        }
      } catch (err) {
        console.error('Lỗi tải dữ liệu khởi tạo:', err);
      } finally {
        if (isMounted) {
          setIsLoadingUsers(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogin = (user) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('erp_user_session', JSON.stringify(user));
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('erp_user_session');
    setCurrentUser(null);
  };

  // Breadcrumbs generator
  const getBreadcrumbs = () => {
    switch (activeRoute) {
      case 'data':
        return ['Dữ liệu nhiệt độ (DATA)'];
      default:
        return [];
    }
  };

  if (!currentUser) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        isLoadingUsers={isLoadingUsers}
        usersList={usersList}
      />
    );
  }

  // 0. Link /data/<tủ>/<tháng>: CHỈ HIỆN BIỂU ĐỒ
  if (activeRoute === 'chart_only') {
    const params = getChartParams() || {};
    const userMap = {};
    (usersList || []).forEach((u) => {
      if (u.id) userMap[u.id.trim().toUpperCase()] = u.name || u.id;
    });
    return (
      <ChartOnlyView
        cabinetParam={params.cabinet}
        monthParam={params.month}
        getStaffDisplayName={(id) =>
          id ? userMap[id.trim().toUpperCase()] || id : '—'
        }
      />
    );
  }

  // 1. Nếu KHÔNG CÓ path (/): Mở FORM GHI NHẬN NHIỆT ĐỘ
  if (activeRoute === 'form') {
    return (
      <div className="flex flex-col min-h-screen">
        <Header
          currentUser={currentUser}
          onLogout={handleLogout}
          onNavigate={navigateTo}
        />
        <main className="flex-1 p-4 md:p-8">
          <TemperatureForm dsTu={dsTu} currentUser={currentUser} />
        </main>
      </div>
    );
  }

  // 2. Nếu CÓ /trang_chu hoặc /data: Mở giao diện ERP Layout
  return (
    <ErpLayout
      activeRoute={activeRoute}
      onRouteChange={navigateTo}
      currentUser={currentUser}
      onLogout={handleLogout}
      breadcrumbs={getBreadcrumbs()}
    >
      {activeRoute === 'trang_chu' && (
        <ErpHome
          currentUser={currentUser}
          onNavigate={(target) => navigateTo(target)}
        />
      )}

      {activeRoute === 'data' && (
        <DataModule
          usersList={usersList}
          onBack={() => navigateTo('trang_chu')}
        />
      )}
    </ErpLayout>
  );
}

