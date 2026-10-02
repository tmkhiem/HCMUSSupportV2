import React from 'react';
import { Icon } from './Icon';
import { renderMarkdownSelfImplementation } from '../markdown';

interface ViewerCardProps {
  title: string;
  markdown: string;
  onClose: () => void;
}

// Viewer card for profile sections
export const ViewerCard: React.FC<ViewerCardProps> = ({ title, markdown, onClose }) => {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 acrylic-material-dark animate-fade-in" 
        onClick={onClose} 
      />
      <div 
        className="relative w-full max-w-2xl bg-white blocky-shadow border border-gray-100 animate-zoom-in-fade flex flex-col"
        style={{ borderRadius: 'var(--radius)', maxHeight: '85vh' }}
      >
        {/* Title Bar - Reduced padding and simplified typography */}
        <div 
          className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 bg-gray-50/50" 
          style={{ borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit' }}
        >
          <h2 
            className="font-bold flex-1 truncate" 
            style={{ 
              color: 'var(--text-main)',
              fontSize: 'var(--font-body)'
            }}
          >
            {title}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-sm transition-colors ml-4 shrink-0"
          >
            <Icon name="close" className="!text-lg" />
          </button>
        </div>

        {/* Content Area */}
        <div className="prose prose-slate flex-1 overflow-y-auto p-6 md:p-8 no-scrollbar" style={{ color: 'var(--text-main)' }}>
          {renderMarkdownSelfImplementation(markdown)}
        </div>
      </div>
    </div>
  );
};
