
import React from 'react';
import { theme } from '../theme';

interface BaseHeaderCardProps {
  title: string;
  subtitle?: string;
  tags?: string[];
  date?: string;
  onClick: () => void;
  index: number;
}

export const BaseHeaderCard: React.FC<BaseHeaderCardProps> = ({ 
  title, 
  subtitle, 
  tags, 
  date, 
  onClick, 
  index 
}) => {
  const delay = index * theme.animations.staggerDelay;

  // Title expands to fill space if no subtitle is present.
  // If subtitle exists, title is prioritized by allowing it to grow larger (up to 70%)
  // while the subtitle occupies the remaining flexible space.
  const titleWrapperClass = subtitle 
    ? "md:shrink-0 md:max-w-[70%] min-w-0" 
    : "flex-1 min-w-0";

  return (
    <div 
      onClick={onClick}
      className="group animate-fly-in-fade acrylic-material border border-gray-100 px-5 py-3.5 blocky-shadow blocky-shadow-hover cursor-pointer transition-all overflow-hidden"
      style={{ 
        animationDelay: `${delay}s`,
        borderRadius: 'var(--radius)'
      }}
    >
      <div className="flex flex-col md:flex-row md:items-center w-full gap-1 md:gap-0">
        {/* Title Container - Prioritized over subtitle */}
        <div className={titleWrapperClass}>
          <h3 
            className="font-bold text-[var(--text-main)] text-[var(--font-body)] leading-tight truncate"
            title={title}
          >
            {title}
          </h3>
        </div>

        {/* Subtitle (Desktop): Occupies remaining space after Title and Meta Info */}
        {subtitle && (
          <div className="hidden md:block flex-1 min-w-0 px-4">
            <p className="font-normal truncate opacity-50 text-[var(--text-muted)] text-[var(--font-body)]">
              <span className="opacity-30 mr-2">—</span>
              {subtitle}
            </p>
          </div>
        )}

        {/* Subtitle (Mobile): Stacked layout */}
        {subtitle && (
          <div className="md:hidden">
            <p className="font-normal truncate opacity-50 text-[var(--text-muted)] text-[var(--font-tiny)]">
              {subtitle}
            </p>
          </div>
        )}

        {/* Meta Info: Badges and Date pinned to the end, always displayed */}
        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 ml-auto w-full md:w-auto mt-2 md:mt-0">
          <div className="flex items-center gap-3 shrink-0">
            {tags && tags.length > 0 && (
              <div className="flex gap-1 items-center">
                <span className="px-3 py-0.5 font-bold uppercase tracking-tight rounded-full border whitespace-nowrap"
                      style={{ 
                        backgroundColor: 'var(--primary-alpha-10)', 
                        color: 'var(--primary)', 
                        borderColor: 'var(--primary-alpha-50)',
                        fontSize: 'var(--font-tiny)'
                      }}>
                  {tags[0]}
                </span>
                {tags.length > 1 && (
                  <span className="px-2 py-0.5 bg-white text-[10px] font-bold uppercase tracking-tight rounded-full border border-gray-100 whitespace-nowrap"
                        style={{ color: 'var(--text-muted)', fontSize: 'var(--font-tiny)' }}>
                    +{tags.length - 1}
                  </span>
                )}
              </div>
            )}
            
            {date && (
              <span className="font-bold opacity-30 tabular-nums whitespace-nowrap"
                    style={{ color: 'var(--text-main)', fontSize: 'var(--font-tiny)' }}>
                {date}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
