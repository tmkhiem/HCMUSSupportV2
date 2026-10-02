import React from 'react';
import { Icon } from './Icon';
import type { UserDto } from '../types';
import { authService } from '../services';

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserDto;
}

export const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ isOpen, onClose, user }) => {  
  if (!isOpen) return null;

  const handleLogout = (e: React.MouseEvent | React.TouchEvent) => {
    // Intercept event to prevent App.tsx from potentially closing the component prematurely
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Logout handler active');
    
    const executeLogout = async () => {
      try {
        await authService.logout();
        window.location.reload();
      } catch (error) {
        console.error("Logout execution error:", error);
        window.location.reload();
      }
    };
    
    executeLogout();
  };

  return (
    <div 
      className="absolute right-0 mt-3 w-56 acrylic-material blocky-shadow border border-gray-100 animate-zoom-in-fade overflow-hidden z-[200]"
      style={{ borderRadius: 'var(--radius)' }}
      // Prevent mousedown/click from bubbling up to document listeners in App.tsx
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col py-2">
        <div className="px-5 py-4 flex flex-col">
          <span className="text-[14px] font-normal truncate" style={{ color: 'var(--text-main)' }}>
            {user.FullName}
          </span>
          <span className="text-[11px] font-normal opacity-50 truncate" style={{ color: 'var(--text-muted)' }}>
            {user.UserId}
          </span>
        </div>
        
        <div className="h-[1px] bg-gray-100 mx-5 my-1" />
        
        <div className="px-5 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest opacity-60" style={{ color: 'var(--text-muted)' }}>
          Phiên bản 2.1.0
        </div>
        
        <a 
          href="https://icons8.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="px-5 pb-3 pt-1 text-[9px] font-medium opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1.5"
          style={{ color: 'var(--text-muted)' }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="w-1 h-1 rounded-full bg-slate-400" />
          Icons by Icons8
        </a>
        
        <div className="h-[1px] bg-gray-100 mx-5 my-1" />
        
        <button 
          type="button"
          onMouseDown={handleLogout}
          className="px-5 py-4 text-left text-sm font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-3 w-full cursor-pointer outline-none"
        >
          <Icon name="logout" className="!text-[18px] !text-red-500" />
          Đăng xuất
        </button>
      </div>
    </div>
  );
};