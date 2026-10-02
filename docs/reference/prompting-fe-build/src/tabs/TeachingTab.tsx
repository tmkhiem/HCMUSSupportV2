
import React, { useState, useEffect, useCallback } from 'react';
import type { TeachingDto } from '../types';
import { Icon } from '../components/Icon';
import { BaseHeaderCard } from '../components/BaseHeaderCard';
import { BaseViewerCard } from '../components/BaseViewerCard';
import { teachingService } from '../services';
import { theme } from '../theme';
import { useDebounce } from '../hooks/useDebounce';

export const TeachingTab: React.FC = () => {
  const [selectedTeaching, setSelectedTeaching] = useState<TeachingDto | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  
  const [items, setItems] = useState<TeachingDto[]>([]);
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
      const result = await teachingService.getTeachingItems({
        pageSize,
        cursor: isLoadMore ? (nextCursor || undefined) : undefined,
        search: debouncedSearch || undefined,
      });

      setItems(prev => isLoadMore ? [...prev, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setHasNextPage(result.hasNextPage);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [debouncedSearch, pageSize, nextCursor]);

  useEffect(() => {
    fetchData(false);
  }, [debouncedSearch]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setSelectedTeaching(null);
      setIsExiting(false);
    }, 250); 
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth relative">
        <div className="sticky top-0 z-20 w-full pointer-events-none">
          <div className="max-w-6xl mx-auto w-full px-4 md:px-10 py-3 md:py-6">
            <div 
              className="animate-fly-in-top acrylic-material p-3 md:p-5 blocky-shadow flex flex-col gap-3 md:gap-4 border pointer-events-auto shadow-xl"
              style={{ 
                borderColor: 'var(--primary-alpha-50)', 
                borderRadius: 'var(--radius)' 
              }}
            >
              <div className="flex items-center gap-2">
                <Icon name="search" className="opacity-40 !text-xl" />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm môn học, lớp, hoặc năm..."
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
                  subtitle={item.instanceId}
                  index={index}
                  onClick={() => setSelectedTeaching(item)}
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
                      Tải thêm thông tin
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 opacity-30 italic font-medium text-base" style={{ color: 'var(--text-main)' }}>
              Không tìm thấy thông tin giảng dạy phù hợp.
            </div>
          )}
          <div className="h-28" />
        </div>
      </div>

      {selectedTeaching && (
        <BaseViewerCard 
          title={selectedTeaching.title}
          body={selectedTeaching.content}
          id={selectedTeaching.instanceId}
          icon={theme.icons.mapping.teaching}
          isExiting={isExiting}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
