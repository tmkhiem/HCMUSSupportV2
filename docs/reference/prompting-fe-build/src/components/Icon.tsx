
import React from 'react';
import { theme } from '../theme';

interface IconProps {
  name: string;
  isActive?: boolean;
  grayscale?: number; // 0 to 100
  className?: string;
  style?: React.CSSProperties;
}

export const Icon: React.FC<IconProps> = ({ name, isActive, grayscale, className = "", style = {} }) => {
  const customIcons = Object.values(theme.icons.mapping);
  const isCustomIcon = customIcons.includes(name);
  
  // Default grayscale based on isActive if not explicitly provided
  const gsValue = grayscale !== undefined ? grayscale : (isActive ? 0 : 100);

  if (isCustomIcon) {
    // Handle cases where name already implies version/color
    const fileName = (name.includes('-48') || name.includes('-64') || name.includes('-blue'))
      ? `${name}.png`
      : `${name}-64.png`;

    return (
      <img
        src={`${theme.icons.baseUrl}/${fileName}`}
        alt={name}
        className={`transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) transform select-none ${className} ${isActive ? 'scale-110' : 'scale-100'}`}
        style={{
          width: '1em',
          height: '1em',
          fontSize: '24px', // Default size for "intact" icons, overridden by className (e.g. !text-sm)
          objectFit: 'contain',
          filter: `grayscale(${gsValue}%)`,
          opacity: isActive ? 1 : 0.7,
          display: 'inline-block',
          verticalAlign: 'middle',
          ...style,
        }}
      />
    );
  }

  // Fallback for system icons (material-icons-two-tone)
  return (
    <span 
      className={`material-icons-two-tone transition-all duration-300 cubic-bezier(0.16, 1, 0.3, 1) transform select-none ${className} ${isActive ? 'scale-125' : 'scale-100'}`}
      style={{ 
        fontSize: '1em',
        color: isActive ? theme.colors.primary : theme.colors.text.muted,
        filter: `grayscale(${gsValue}%)`,
        display: 'inline-block',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      {name}
    </span>
  );
};
