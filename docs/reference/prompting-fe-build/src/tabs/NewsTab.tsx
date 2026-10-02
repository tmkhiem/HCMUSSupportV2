import React, { useState, useEffect, useCallback } from 'react';
import type { NotificationDto } from '../types';
import { Icon } from '../components/Icon';
import { BaseHeaderCard } from '../components/BaseHeaderCard';
import { BaseViewerCard } from '../components/BaseViewerCard';
import { notificationService } from '../services';
import { useDebounce } from '../hooks/useDebounce';
import { theme } from '../theme';

export const NewsTab: React.FC = () => {
  const [selectedNotification, setSelectedNotification] = useState<NotificationDto | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  
  // Data State
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(''); // Stores yyyy-MM-dd (native input format)
  const [dateTo, setDateTo] = useState('');     // Stores yyyy-MM-dd (native input format)
  const [pageSize] = useState(10);
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    notificationService.getAllTags().then(setAllAvailableTags);
  }, []);

  const fetchData = useCallback(async (isLoadMore: boolean = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    else {
      setIsLoading(true);
    }

    try {
      // Transform yyyy-MM-dd to yyyy/MM/dd for API call as requested
      const apiDateFrom = dateFrom ? dateFrom.replace(/-/g, '/') : undefined;
      const apiDateTo = dateTo ? dateTo.replace(/-/g, '/') : undefined;

      const result = await notificationService.getNotifications({
        pageSize,
        cursor: isLoadMore ? (nextCursor || undefined) : undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        dateFrom: apiDateFrom,
        dateTo: apiDateTo,
        search: debouncedSearch || undefined
      });

      setItems(prev => isLoadMore ? [...prev, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setHasNextPage(result.hasNextPage);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [debouncedSearch, selectedTags, dateFrom, dateTo, pageSize, nextCursor]);

  // Trigger fresh fetch on filter change
  useEffect(() => {
    fetchData(false);
  }, [debouncedSearch, selectedTags, dateFrom, dateTo]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setSelectedNotification(null);
      setIsExiting(false);
    }, 250); 
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="relative h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto no-scrollbar scroll-smooth relative">
        <div className="sticky top-0 z-10 w-full pointer-events-none">
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
                  placeholder="Tìm kiếm nội dung..."
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
              
              <div className="hidden md:flex flex-wrap gap-2">
                {allAvailableTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border transition-all
                      ${selectedTags.includes(tag)
                        ? 'text-white border-transparent'
                        : 'bg-white border-gray-100 hover:border-[var(--primary)] hover:bg-[var(--primary-alpha-10)]'
                      }`}
                    style={{ 
                      backgroundColor: selectedTags.includes(tag) ? 'var(--primary)' : '',
                      color: selectedTags.includes(tag) ? '#FFF' : 'var(--text-muted)'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <div className="hidden md:grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Từ ngày</label>
                  <input 
                    type="date" 
                    className="flex-1 bg-white/60 border border-gray-100 px-3 py-1.5 rounded-sm outline-none focus:ring-1 text-sm transition-all"
                    style={{ 
                      color: 'var(--text-main)',
                      borderColor: dateFrom ? 'var(--primary)' : 'rgba(0,0,0,0.1)'
                    }}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Đến ngày</label>
                  <input 
                    type="date" 
                    className="flex-1 bg-white/60 border border-gray-100 px-3 py-1.5 rounded-sm outline-none focus:ring-1 text-sm transition-all"
                    style={{ 
                      color: 'var(--text-main)',
                      borderColor: dateTo ? 'var(--primary)' : 'rgba(0,0,0,0.1)'
                    }}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto w-full px-4 md:px-10 py-4 space-y-2 min-h-full">
          {isLoading ? (
            <div className="text-center py-20 opacity-30 italic font-medium text-base">Đang tải dữ liệu...</div>
          ) : items.length > 0 ? (
            <>
              {items.map((item, index) => (
                <BaseHeaderCard 
                  key={item.instanceId} 
                  title={item.title}
                  subtitle={item.renderedBody.split('\n')[0]}
                  tags={item.tags}
                  date={item.notificationDate}
                  index={index}
                  onClick={() => setSelectedNotification(item)} 
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
                      Tải thêm thông báo
                    </span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20 opacity-30 italic font-medium text-base" style={{ color: 'var(--text-main)' }}>
              Không tìm thấy thông báo nào phù hợp.
            </div>
          )}
          <div className="h-28" />
        </div>
      </div>

      {selectedNotification && (
        <BaseViewerCard 
          title={selectedNotification.title}
          body={selectedNotification.renderedBody}
          id={selectedNotification.instanceId}
          date={selectedNotification.notificationDate}
          tags={selectedNotification.tags}
          icon={theme.icons.mapping.news}
          isExiting={isExiting}
          onClose={handleClose}
        />
      )}
    </div>
  );
};