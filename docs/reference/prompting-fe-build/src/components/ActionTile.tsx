
import React from 'react';
import { Icon } from './Icon';
import { theme } from '../theme';

interface ActionTileProps {
  title: string;
  icon?: string;
  onClick: () => void;
  index: number;
  variant?: 'default' | 'minimal';
  gradient?: string; 
  disabled?: boolean;
}

export const ActionTile: React.FC<ActionTileProps> = ({ 
  title, 
  icon, 
  onClick, 
  index,
  variant = 'default',
  disabled = false
}) => {
  const delay = index * 0.05;
  const isMinimal = variant === 'minimal';
  
  // Specific check for branding logos
  const isBrandingIcon = icon?.endsWith('.png');
  const iconUrl = isBrandingIcon ? `${theme.icons.baseUrl}/${icon}` : null;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group relative flex items-center w-full text-left animate-fly-in-fade transition-all duration-300 
        ${disabled 
          ? 'opacity-60 cursor-default border-gray-300 grayscale' 
          : 'active:scale-[0.98] cursor-pointer border-[var(--primary)] hover:bg-[var(--primary-alpha-10)]'
        } 
        ${isMinimal 
          ? 'h-auto p-0 m-0 bg-transparent border-none shadow-none grayscale-0 opacity-100' 
          : 'h-16 px-6 mb-3 bg-transparent border-2 blocky-shadow'
        }`}
      style={{ 
        animationDelay: `${delay}s`,
        borderRadius: isMinimal ? '0' : 'var(--radius)',
      }}
    >
      {!isMinimal && icon && (
        <div className={`mr-4 transition-transform duration-500 ${!disabled && 'group-hover:scale-110'}`}>
          {isBrandingIcon ? (
            <img 
              src={iconUrl!} 
              alt={title} 
              className="w-8 h-8 object-contain"
            />
          ) : (
            <Icon 
              name={icon} 
              isActive={!disabled}
              grayscale={disabled ? 100 : 0}
              className="!text-2xl !transition-none"
            />
          )}
        </div>
      )}

      <span className={`flex-1 font-bold ${isMinimal ? 'text-sm' : 'text-sm'}`} 
            style={{ color: disabled ? 'var(--text-muted)' : 'var(--text-main)' }}>
        {title}
      </span>
      
      <div className={`flex items-center justify-center transition-all duration-500 transform 
        ${isMinimal ? '' : `translate-y-1 -translate-x-1 ${!disabled ? 'group-hover:translate-y-0 group-hover:translate-x-0' : ''}`}
        ${disabled ? 'opacity-40' : 'opacity-100'}`}>
        
        <svg 
          width={isMinimal ? "18" : "24"} 
          height={isMinimal ? "18" : "24"} 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className="transition-all duration-500"
          style={{ color: disabled ? 'var(--text-muted)' : 'var(--text-main)' }}
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="8 7 17 7 17 16" />
        </svg>
      </div>
    </button>
  );
};
