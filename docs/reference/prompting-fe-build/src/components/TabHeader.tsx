import React, { useState } from 'react';
import type { TabType } from '../types';
import { Icon } from './Icon';

interface TabHeaderProps {
  type: TabType;
  icon: string;
  isActive: boolean;
  onClick: () => void;
}

export const TabHeader: React.FC<TabHeaderProps> = ({ type, icon, isActive, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  // Normal: 60% desaturated, Hover: 30% desaturated, Selected: 0% desaturated
  let grayscale = 60;
  if (isActive) {
    grayscale = 0;
  } else if (isHovered) {
    grayscale = 30;
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full flex items-center gap-5 px-8 tab-header-btn transition-colors duration-300 mb-0 group border-l-4 border-transparent`}
    >
      <div className="w-8 flex justify-center">
        <Icon 
          name={icon} 
          isActive={isActive} 
          grayscale={grayscale}
          className={isActive ? '' : 'group-hover:scale-110'}
        />
      </div>
      <span className="font-bold tracking-widest transition-colors duration-300 uppercase"
            style={{ 
              fontSize: '11px',
              color: isActive ? 'var(--text-main)' : 'var(--text-muted)'
            }}>
        {type}
      </span>
    </button>
  );
};