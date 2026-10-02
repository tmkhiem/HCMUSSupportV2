
import React from 'react';
import { ActionTile } from '../components/ActionTile';
import { theme } from '../theme';
import { authService } from '../services';

interface LoginPageProps {
  onLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const handleGoogleLogin = () => {
    // Usually OAuth is handled by redirecting to the provider's endpoint or a backend proxy
    window.location.href = authService.getLoginUrl();
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[var(--background)] overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none flex items-end justify-end p-8 z-0">
        <img 
          src={`${theme.assetsBaseUrl}/bg-logo.png`} 
          alt="Background Logo" 
          className="w-full h-full object-contain object-right-bottom"
          style={{ opacity: theme.logoOpacity }} 
        />
      </div>

      <div className="relative z-10 w-full max-w-6xl px-4 md:px-8">
        <div 
          className="bg-white/70 border border-gray-100 p-8 md:p-12 lg:p-16 flex flex-col lg:flex-row items-center lg:justify-between gap-12 lg:gap-24 transition-all"
          style={{ borderRadius: 'var(--radius)' }}
        >
          {/* Left Column: Branding Text */}
          <div className="lg:w-1/2 text-center lg:text-left animate-fly-in-top">
            <h1 
              className="font-bold mb-4 leading-tight tracking-tight"
              style={{ 
                color: 'var(--text-main)',
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                fontWeight: 700
              }}
            >
              Support HCMUS
            </h1>
            <div 
              className="text-lg font-normal max-w-lg mx-auto lg:mx-0 leading-relaxed space-y-2" 
              style={{ color: 'var(--text-main)', fontWeight: 400 }}
            >
              <p>Chào mừng quý Thầy Cô đã truy cập Support HCMUS!</p>
              <p>Quý Thầy Cô vui lòng đăng nhập với email chính thức của Trường (Google).</p>
            </div>
            <div className="mt-8 hidden lg:block">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40" style={{ color: 'var(--text-main)' }}>
                Ho Chi Minh City University of Science
              </p>
            </div>
          </div>

          {/* Right Column: Login Actions */}
          <div className="w-full max-w-md lg:w-1/2 flex flex-col items-center lg:items-end animate-fly-in-bottom lg:animate-fly-in-fade">
            <div className="w-full space-y-4">
              <ActionTile 
                index={0}
                title="Đăng nhập với Google"
                icon="logo-google.png"
                onClick={handleGoogleLogin}
              />
              <ActionTile 
                index={1}
                title="Đăng nhập với VNeID"
                icon="logo-vneid.png"
                onClick={() => {}}
                disabled={true}
              />
            </div>

            <div className="mt-12 lg:hidden text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30" style={{ color: 'var(--text-main)' }}>
                Ho Chi Minh City University of Science
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
