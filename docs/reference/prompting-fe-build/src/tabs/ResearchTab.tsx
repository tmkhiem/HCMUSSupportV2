
import React, { useState, useEffect, useCallback } from 'react';
import type { ResearchTopicDto, ResearchPaperDto } from '../types';
import { Icon } from '../components/Icon';
import { BaseHeaderCard } from '../components/BaseHeaderCard';
import { BaseViewerCard } from '../components/BaseViewerCard';
import { researchService } from '../services';
import { theme } from '../theme';
import { useDebounce } from '../hooks/useDebounce';

type SubTab = 'topics' | 'papers';

export const ResearchTab: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('topics');
  const [selectedItem, setSelectedItem] = useState<ResearchTopicDto | ResearchPaperDto | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const [items, setItems] = useState<(ResearchTopicDto | ResearchPaperDto)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const pageSize = 10;

  const fetchData = useCallback(async (isLoadMore: boolean = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else {
      setIsLoading(true);
    }

    try {
      const requestParams = {
        pageSize,
        cursor: isLoadMore ? (nextCursor || undefined) : undefined,
        search: debouncedSearch || undefined
      };

      const result = activeSubTab === 'topics' 
        ? await researchService.getTopics(requestParams)
        : await researchService.getPapers(requestParams);
        
      setItems(prev => isLoadMore ? [...prev, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setHasNextPage(result.hasNextPage);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeSubTab, debouncedSearch, pageSize, nextCursor]);

  useEffect(() => {
    fetchData(false);
  }, [activeSubTab, debouncedSearch]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setSelectedItem(null);
      setIsExiting(false);
    }, 250);
  };

  const switchSubTab = (tab: SubTab) => {
    setActiveSubTab(tab);
    setSearch('');
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 w-full flex justify-center sm:pt-6 pb-2 pointer-events-none">
        <div 
          className="animate-fly-in-top relative pointer-events-auto acrylic-material blocky-shadow flex p-0 sm:p-1 border-b sm:border border-gray-100 transition-all overflow-hidden w-full sm:w-auto sm:min-w-[450px]"
          style={{ 
            borderRadius: window.innerWidth < 640 ? '0px' : '100px', 
            backgroundColor: 'rgba(255,255,255,0.9)' 
          }}
        >
          <div 
            className="absolute top-0 bottom-0 transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1) z-0 blocky-shadow"
            style={{ 
              width: '60%', 
              left: activeSubTab === 'topics' ? '-5%' : '45%',
              backgroundColor: 'var(--primary)',
              transform: 'skewX(-15deg)',
              borderRadius: window.innerWidth < 640 ? '0px' : 'inherit'
            }}
          />

          <button 
            onClick={() => switchSubTab('topics')}
            className={`relative z-10 flex-1 py-4 sm:py-3 text-[10px] font-black uppercase tracking-widest transition-colors duration-300 flex items-center justify-center gap-3
              ${activeSubTab === 'topics' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Icon 
              name={theme.icons.mapping.topics} 
              isActive={activeSubTab === 'topics'} 
              grayscale={activeSubTab === 'topics' ? 0 : 100}
            />
            <span className="hidden xs:inline">Đề tài nghiên cứu</span>
            <span className="inline xs:hidden">Đề tài</span>
          </button>
          
          <button 
            onClick={() => switchSubTab('papers')}
            className={`relative z-10 flex-1 py-4 sm:py-3 text-[10px] font-black uppercase tracking-widest transition-colors duration-300 flex items-center justify-center gap-3
              ${activeSubTab === 'papers' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Icon 
              name={theme.icons.mapping.papers} 
              isActive={activeSubTab === 'papers'} 
              grayscale={activeSubTab === 'papers' ? 0 : 100}
            />
            <span className="hidden xs:inline">Bài báo khoa học</span>
            <span className="inline xs:hidden">Bài báo</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth relative">
        <div className="sticky top-0 z-10 w-full pointer-events-none mt-2">
          <div className="max-w-6xl mx-auto w-full px-4 md:px-10 py-3">
            <div 
              className="animate-fly-in-top acrylic-material p-3 md:p-5 blocky-shadow flex items-center gap-3 md:gap-4 border pointer-events-auto shadow-xl"
              style={{ 
                borderColor: 'var(--primary-alpha-50)', 
                borderRadius: 'var(--radius)' 
              }}
            >
              <Icon name="search" className="opacity-40 !text-xl" />
              <input 
                type="text" 
                placeholder={`Tìm kiếm ${activeSubTab === 'topics' ? 'đề tài' : 'bài báo'}...`}
                className="w-full bg-transparent border-b border-gray-200 outline-none py-1 transition-colors font-medium"
                style={{ 
                  color: 'var(--text-main)', 
                  fontSize: 'var(--font-body)',
                  borderBottomColor: search ? 'var(--primary)' : 'rgba(0,0,0,0.1)'
                }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto w-full px-4 md:px-10 py-4 space-y-2 min-h-full">
          {isLoading ? (
            <div className="text-center py-20 opacity-30 italic">Đang tải dữ liệu...</div>
          ) : items.length > 0 ? (
            <>
              {items.map((item, index) => (
                <BaseHeaderCard 
                  key={item.instanceId}
                  title={item.title}
                  index={index}
                  onClick={() => setSelectedItem(item)}
                />
              ))}

              {hasNextPage && (
                <div className="py-8 flex justify-center">
                  <button
                    onClick={() => fetchData(true)}
                    disabled={isLoadingMore}
                    className="px-10 py-3 bg-white border border-gray-200 blocky-shadow hover:scale-105 active:scale-95 transition-all flex items-center gap-3 group disabled:opacity-50"
                    style={{ borderRadius: 'var(--radius)' }}
                  >
                    {isLoadingMore ? (
                      <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="expand_more" className="group-hover:translate-y-1 transition-transform" />
                    )}
                    <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-main)' }}>
                      Tải thêm kết quả
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 opacity-30 italic font-medium text-base" style={{ color: 'var(--text-main)' }}>
              Không tìm thấy kết quả phù hợp.
            </div>
          )}
          <div className="h-28" />
        </div>
      </div>

      {selectedItem && (
        <BaseViewerCard 
          title={selectedItem.title}
          body={selectedItem.content}
          id={selectedItem.instanceId}
          icon={activeSubTab === 'topics' ? theme.icons.mapping.topics : theme.icons.mapping.papers}
          isExiting={isExiting}
          onClose={handleClose}
        />
      )}
    </div>
  );
};
