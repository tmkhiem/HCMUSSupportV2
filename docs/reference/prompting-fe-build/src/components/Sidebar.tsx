import React, { useMemo } from 'react';
import { TabType, type TabType as TabTypeInterface } from '../types';
import { Icon } from './Icon';
import { TabHeader } from './TabHeader';
import { theme } from '../theme';

interface SidebarProps {
  activeTab: TabTypeInterface;
  onTabChange: (tab: TabTypeInterface) => void;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  isAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, isMobile, onCloseMobile, isAdmin }) => {
  const tabs = useMemo(() => {
    // Explicitly typing baseTabs allows all members of TabType to be added
    const baseTabs: { type: TabTypeInterface; icon: string }[] = [
      { type: TabType.PROFILE, icon: theme.icons.mapping.profile },
      { type: TabType.INITIATIVE, icon: theme.icons.mapping.initiative },
      { type: TabType.NEWS, icon: theme.icons.mapping.news },
      { type: TabType.TEACHING, icon: theme.icons.mapping.teaching },
      { type: TabType.RESEARCH, icon: theme.icons.mapping.research },
    ];
    if (isAdmin) {
      baseTabs.push({ type: TabType.ADMIN, icon: theme.icons.mapping.admin });
    }
    return baseTabs;
  }, [isAdmin]);

  const activeIndex = tabs.findIndex(t => t.type === activeTab);

  const sidebarStyle = {
    background: `radial-gradient(circle at ${theme.sidebar.gradient.position}, ${theme.sidebar.gradient.from}, ${theme.sidebar.gradient.to})`
  };

  const logoGlowStyle = {
    textShadow: '0 0 12px rgba(255, 255, 255, 0.9), 0 0 4px rgba(255, 255, 255, 0.4)'
  };

  const content = (
    <>
      {!isMobile && (
        <div className="px-8 py-10 mb-2">
          <div className="flex items-center gap-3">
            <span 
              className="font-bold whitespace-nowrap text-lg tracking-tight" 
              style={{ 
                color: 'var(--primary)',
                ...logoGlowStyle
              }}
            >
              Support HCMUS
            </span>
          </div>
        </div>
      )}
      
      {isMobile && (
        <div className="p-6 border-b border-gray-50 relative">
          <div className="flex items-center justify-between w-full">
            <div className="overflow-hidden">
               <span 
                 className="font-bold tracking-tight whitespace-nowrap leading-none block" 
                 style={{ 
                   color: 'var(--primary)',
                   fontSize: '1.75rem',
                   ...logoGlowStyle
                 }}
               >
                 Support HCMUS
               </span>
            </div>
            <button onClick={onCloseMobile} className="p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0 ml-2">
              <Icon name="close" />
            </button>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto no-scrollbar py-4 lg:py-0 relative">
        <div 
          className="absolute left-0 w-full transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) pointer-events-none z-0"
          style={{ 
            height: '64px', 
            top: '0px',
            transform: `translateY(${activeIndex * 64 + (isMobile ? 16 : 0)}px)`
          }}
        >
          <div className="w-full h-full sunken-tab border-l-4 border-t border-b border-gray-100" style={{ borderLeftColor: 'var(--primary)' }} />
        </div>

        <div className="relative z-10">
          {tabs.map((tab) => (
            <TabHeader
              key={tab.type}
              type={tab.type}
              icon={tab.icon}
              isActive={activeTab === tab.type}
              onClick={() => {
                onTabChange(tab.type);
                if (onCloseMobile) onCloseMobile();
              }}
            />
          ))}
        </div>
      </nav>
    </>
  );

  if (isMobile) {
    return (
      <div 
        className="fixed top-0 left-0 h-full w-[90vw] max-w-[450px] z-[110] shadow-2xl flex flex-col animate-slide-right"
        style={sidebarStyle}
      >
        {content}
      </div>
    );
  }

  return (
    <aside 
      className="hidden lg:flex flex-col w-72 h-full border-r border-gray-100 shadow-2xl z-20"
      style={sidebarStyle}
    >
      {content}
    </aside>
  );
};