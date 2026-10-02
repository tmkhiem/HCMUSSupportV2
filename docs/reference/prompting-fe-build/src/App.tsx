
import React, { useState, useRef, useEffect } from 'react';
import { TabType, type TabType as TabTypeInterface, type UserDto } from './types';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { NewsTab } from './tabs/NewsTab';
import { ProfileTab } from './tabs/ProfileTab';
import { InitiativeTab } from './tabs/InitiativeTab';
import { TeachingTab } from './tabs/TeachingTab';
import { ResearchTab } from './tabs/ResearchTab';
import { AdminTab } from './tabs/AdminTab';
import { theme } from './theme';
import { ProfileDropdown } from './components/ProfileDropdown';
import { authService } from './services';
import { LoginPage } from './pages/LoginPage';

const PlaceholderTab: React.FC<{ title: string }> = ({ title }) => (
  <div className="h-full flex flex-col items-center justify-center p-8 text-center relative z-10" style={{ color: 'var(--text-muted)' }}>
    <Icon name="construction" className="!text-[64px] mb-4 opacity-30" />
    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-main)' }}>{title}</h2>
    <p>Nội dung đang được cập nhật. Vui lòng quay lại sau.</p>
  </div>
);

const App: React.FC = () => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabTypeInterface>(TabType.NEWS);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);

  // Sync theme.ts with CSS variables
  useEffect(() => {
    const root = document.documentElement;
    
    // Core Colors
    root.style.setProperty('--primary', theme.colors.primary);
    root.style.setProperty('--primary-alpha-10', `${theme.colors.primary}1A`);
    root.style.setProperty('--primary-alpha-50', `${theme.colors.primary}80`);
    root.style.setProperty('--secondary', theme.colors.secondary);
    root.style.setProperty('--text-main', theme.colors.text.main);
    root.style.setProperty('--text-muted', theme.colors.text.muted);
    root.style.setProperty('--background', theme.colors.background);
    
    // Layout
    root.style.setProperty('--radius', theme.layout.DefaultCardsCornerRadius);
    root.style.setProperty('--blur-radius', theme.layout.blurRadius);
    root.style.setProperty('--modal-opacity', theme.layout.modalBlackOpacity.toString());
    
    // Typography
    root.style.setProperty('--font-body', theme.typography.sizes.body);
    root.style.setProperty('--font-small', theme.typography.sizes.small);
    root.style.setProperty('--font-tiny', theme.typography.sizes.tiny);
  }, []);

  useEffect(() => {
    // Initial Auth Check
    authService.getStatus()
      .then((userData) => {
        setUser(userData);
        setIsAuthLoading(false);
      })
      .catch((err) => {
        setAuthError("Lỗi hệ thống. Vui lòng thử lại sau.");
        setIsAuthLoading(false);
      });
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutsideDesktop = !dropdownRef.current || !dropdownRef.current.contains(target);
      const isOutsideMobile = !mobileDropdownRef.current || !mobileDropdownRef.current.contains(target);
      
      if (isOutsideDesktop && isOutsideMobile) {
        setIsProfileDropdownOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderContent = () => {
    // If user is null, the check below handles it. 
    // Typescript might complain so we cast or check within each case if needed.
    if (!user) return null;

    switch (activeTab) {
      case TabType.NEWS:
        return <NewsTab />;
      case TabType.PROFILE:
        return <ProfileTab user={user} />;
      case TabType.INITIATIVE:
        return <InitiativeTab />;
      case TabType.TEACHING:
        return <TeachingTab />;
      case TabType.RESEARCH:
        return <ResearchTab />;
      case TabType.ADMIN:
        return <AdminTab />;
      default:
        return <PlaceholderTab title={activeTab} />;
    }
  };

  if (isAuthLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <p className="font-bold text-sm tracking-widest opacity-40 uppercase">Đang đồng bộ...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--background)] p-8">
        <div className="bg-white p-10 blocky-shadow border border-red-100 max-w-md text-center" style={{ borderRadius: 'var(--radius)' }}>
          <Icon name="error_outline" className="!text-5xl !text-red-500 mb-6" />
          <h2 className="text-xl font-bold mb-3">Lỗi Xác Thực</h2>
          <p className="text-sm opacity-60 leading-relaxed mb-6">{authError}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-[var(--primary)] text-white font-bold rounded-sm text-sm uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">Tải lại trang</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={() => {}} />;
  }

  const avatarUrl = user.PpUrl && user.PpUrl.trim() !== '' 
    ? user.PpUrl 
    : `${theme.icons.baseUrl}/profile-64.png`;

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden" style={{ backgroundColor: 'var(--background)' }}>
      <>
        <Sidebar 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          isAdmin={!!user.IsAdmin}
        />

        <main className="flex-1 flex flex-col h-full relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none flex items-end justify-end p-8 z-0">
            <img 
              src={`${theme.assetsBaseUrl}/bg-logo.png`} 
              alt="Background Logo" 
              className="w-full h-full object-contain object-right-bottom"
              style={{ opacity: theme.logoOpacity }} 
            />
          </div>

          <header className="lg:hidden h-16 bg-white border-b border-gray-100 flex items-center px-6 justify-between z-50 shadow-sm relative shrink-0">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 hover:bg-[#ECEFF1] rounded-sm transition-colors"
            >
              <Icon name="menu" />
            </button>
            
            <span className="font-bold text-sm uppercase tracking-widest" style={{ color: 'var(--text-main)' }}>{activeTab}</span>
            
            <div className="relative" ref={mobileDropdownRef}>
              <button 
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-[#ECEFF1] active:scale-95 transition-transform"
              >
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              </button>
              <ProfileDropdown isOpen={isProfileDropdownOpen} onClose={() => setIsProfileDropdownOpen(false)} user={user} />
            </div>
          </header>

          <div className="hidden lg:block fixed top-6 right-8 z-[150]" ref={dropdownRef}>
            <button 
              onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
              className="w-11 h-11 rounded-full overflow-hidden border-2 border-white blocky-shadow hover:scale-105 transition-all active:scale-95 bg-white"
            >
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            </button>
            <ProfileDropdown isOpen={isProfileDropdownOpen} onClose={() => setIsProfileDropdownOpen(false)} user={user} />
          </div>

          <div className="flex-1 overflow-hidden relative">
            {renderContent()}
          </div>
        </main>

        {isMobileMenuOpen && (
          <>
            <div 
              className="fixed inset-0 acrylic-material-dark z-[100] transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <Sidebar 
              activeTab={activeTab} 
              onTabChange={setActiveTab}
              isMobile
              onCloseMobile={() => setIsMobileMenuOpen(false)}
              isAdmin={!!user.IsAdmin}
            />
          </>
        )}
      </>
    </div>
  );
};

export default App;
