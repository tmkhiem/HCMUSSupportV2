import React from 'react';
import { Icon } from './Icon';
import { renderMarkdownSelfImplementation } from '../markdown';

interface BaseViewerCardProps {
  title: string;
  body: string;
  id: string | number;
  date?: string;
  tags?: string[];
  icon: string;
  isExiting: boolean;
  onClose: () => void;
}

export const BaseViewerCard: React.FC<BaseViewerCardProps> = ({ 
  title, 
  body, 
  id, 
  date, 
  tags, 
  icon, 
  isExiting, 
  onClose 
}) => {
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-0 md:p-8 lg:p-12">
      {/* Backdrop: acrylic only on desktop, transparent clickable overlay on mobile */}
      <div 
        className={`absolute inset-0 transition-opacity 
          ${isExiting ? 'animate-fade-out' : 'animate-fade-in'}
          md:block hidden
        `}
        style={{ 
          backgroundColor: `rgba(0, 0, 0, var(--modal-opacity, 0.1))`,
          backdropFilter: `blur(var(--blur-radius, 8px)) saturate(125%)`,
          WebkitBackdropFilter: `blur(var(--blur-radius, 8px)) saturate(125%)`
        }}
        onClick={onClose}
      />

      {/* Mobile transparent overlay */}
      <div className="md:hidden absolute inset-0 bg-transparent" onClick={onClose} />
      
      {/* Modal Container: Simple rapid fade on mobile, Zoom on desktop */}
      <div className={`relative z-[200] w-full h-full md:h-auto md:max-h-[85vh] md:max-w-3xl lg:max-w-4xl blocky-shadow flex flex-col overflow-hidden
        ${isExiting 
          ? 'animate-fade-out md:animate-zoom-out-fade' 
          : 'animate-fade-in md:animate-zoom-in-fade'
        }`}
        style={{ 
          borderRadius: window.innerWidth < 768 ? '0px' : 'var(--radius)',
        }}>
        
        <div className="h-full flex flex-col overflow-hidden"
             style={{ 
               background: 'radial-gradient(circle at top left, #FFFFFF 0%, #FAFAFA 100%)' 
             }}>
          <div className="p-6 md:p-10 overflow-y-auto no-scrollbar h-full">
            <div className={isExiting ? 'opacity-0 transition-opacity duration-150' : 'animate-fade-in-delayed'}>
              <div className="flex justify-between items-start mb-8">
                <div className="flex-1">
                  <h2 className="text-2xl md:text-3xl font-black leading-tight mb-4 tracking-tight flex items-start gap-3" style={{ color: 'var(--text-main)' }}>
                    <Icon 
                      name={icon} 
                      className="shrink-0 translate-y-[0.05em]" 
                      isActive 
                      style={{ fontSize: '1.4em' }} 
                    />
                    <span>{title}</span>
                  </h2>

                  <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 flex-wrap">
                    {date && (
                      <p className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--primary)' }}>
                        <Icon name="date-48" className="!text-[14px]" isActive />
                        {date}
                      </p>
                    )}
                    <p className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      <Icon name="information-48" className="!text-[14px]" isActive />
                      #{id}
                    </p>
                    
                    {tags && tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map(tag => (
                          <span key={tag} 
                                className="px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border transition-all"
                                style={{ 
                                  backgroundColor: 'var(--primary-alpha-10)',
                                  borderColor: 'var(--primary)',
                                  color: 'var(--primary)' 
                                }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-3 hover:bg-[#ECEFF1] rounded-sm transition-colors ml-4 shrink-0"
                  style={{ backgroundColor: 'var(--background)' }}
                >
                  <Icon name="close" className="!text-xl" />
                </button>
              </div>

              <div className="prose prose-slate max-w-none font-medium leading-relaxed mb-10 supportv2-markdown-content"
                   style={{ color: 'var(--text-main)', fontSize: 'var(--font-body)' }}>
                {renderMarkdownSelfImplementation(body)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
