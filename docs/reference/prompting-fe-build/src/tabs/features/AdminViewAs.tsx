import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { adminService } from '../../services';
import type { UserDto, NotificationDto } from '../../types';
import { BaseHeaderCard } from '../../components/BaseHeaderCard';
import { BaseViewerCard } from '../../components/BaseViewerCard';
import { useDebounce } from '../../hooks/useDebounce';
import { theme } from '../../theme';

export const AdminViewAs: React.FC = () => {
  const [mscbSearch, setMscbSearch] = useState('');
  const debouncedMscbSearch = useDebounce(mscbSearch, 500);
  const [selectedCategory, setSelectedCategory] = useState('tin tức');
  const [searchResults, setSearchResults] = useState<UserDto[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<UserDto | null>(null);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 500);
  const pageSize = 5;

  const [items, setItems] = useState<NotificationDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | number | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // State for notification viewer
  const [selectedNotification, setSelectedNotification] = useState<NotificationDto | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debouncedMscbSearch.trim()) {
      adminService.findUsersByKeyword(debouncedMscbSearch).then(setSearchResults);
      setIsDropdownOpen(true);
    } else {
      setSearchResults([]);
      setIsDropdownOpen(false);
    }
  }, [debouncedMscbSearch]);

  const fetchData = async (isLoadMore: boolean = false) => {
    if (!impersonatedUser) return;
    
    setIsLoading(true);
    try {
      const result = await adminService.getViewAsItems(
        impersonatedUser.UserId,
        selectedCategory,
        pageSize,
        isLoadMore ? (nextCursor || undefined) : undefined,
        debouncedKeyword
      );
      setItems(prev => isLoadMore ? [...prev, ...result.items] : result.items);
      setNextCursor(result.nextCursor);
      setHasNextPage(result.hasNextPage);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (impersonatedUser) {
      fetchData(false);
    } else {
      setItems([]);
      setNextCursor(null);
      setHasNextPage(false);
    }
  }, [impersonatedUser, selectedCategory, debouncedKeyword]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectUser = (user: UserDto) => {
    setImpersonatedUser(user);
    setMscbSearch(user.UserId);
    setIsDropdownOpen(false);
    adminService.viewAs(user.UserId);
  };

  const clearImpersonation = () => {
    setImpersonatedUser(null);
    setMscbSearch('');
    setItems([]);
  };

  const handleCloseViewer = () => {
    setIsExiting(true);
    setTimeout(() => {
      setSelectedNotification(null);
      setIsExiting(false);
    }, 250); 
  };

  return (
    <div className="space-y-6 animate-zoom-in-fade">
      <div 
        className="p-4 md:p-6 blocky-shadow flex flex-col gap-6 border shadow-xl relative z-[50] bg-white/95"
        style={{ 
          borderColor: 'var(--primary-alpha-50)', 
          borderRadius: 'var(--radius)' 
        }}
      >
        {/* Row 1: MSCB/Badge and Category Dropdown */}
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-30">
          <div className="flex-1 w-full relative" ref={dropdownRef}>
            <div className="flex items-center gap-4 min-h-[40px]">
              <label className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                MSCB
              </label>
              {!impersonatedUser ? (
                <div className="flex-1 flex items-center gap-2 border-b transition-all p-1"
                     style={{ borderColor: mscbSearch ? 'var(--primary)' : 'rgba(0,0,0,0.1)' }}>
                  <Icon name="person_search" className="opacity-40 !text-xl !scale-100" />
                  <input 
                    type="text" 
                    placeholder="Nhập mã hoặc tên..."
                    className="w-full bg-transparent outline-none"
                    style={{ 
                      color: 'var(--text-main)', 
                      fontSize: 'var(--font-body)', 
                      fontWeight: 400 
                    }}
                    value={mscbSearch}
                    onChange={(e) => setMscbSearch(e.target.value)}
                    onFocus={() => setIsDropdownOpen(searchResults.length > 0)}
                  />
                </div>
              ) : (
                <div className="flex-1 bg-[var(--primary)] text-white rounded-full px-4 py-1.5 flex items-center gap-3 animate-zoom-in-fade shadow-sm">
                  <Icon name="verified_user" className="!text-sm !scale-100" style={{ color: 'white' }} />
                  <span className="text-xs font-bold truncate">
                    {impersonatedUser.UserId} — {impersonatedUser.FullName}
                  </span>
                  <button 
                    onClick={clearImpersonation}
                    className="ml-auto w-6 h-6 flex items-center justify-center rounded-full text-white transition-all hover:bg-white hover:text-[var(--primary)]"
                  >
                    <Icon name="close" className="!text-[14px] !scale-100" style={{ color: 'inherit' }} />
                  </button>
                </div>
              )}
            </div>

            {isDropdownOpen && !impersonatedUser && searchResults.length > 0 && (
              <div className="absolute top-full left-[60px] right-0 mt-2 bg-white border border-gray-100 blocky-shadow z-[100] max-h-60 overflow-y-auto no-scrollbar animate-zoom-in-fade shadow-2xl"
                   style={{ borderRadius: 'var(--radius)' }}>
                {searchResults.map(user => (
                  <button
                    key={user.UserId}
                    onClick={() => selectUser(user)}
                    className="w-full text-left p-4 hover:bg-[var(--primary-alpha-10)] transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{user.FullName}</p>
                      <p className="text-[10px] font-bold opacity-50 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                        ID: {user.UserId}
                      </p>
                    </div>
                    <Icon name="chevron_right" className="opacity-0 group-hover:opacity-100 transition-opacity !scale-100" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 w-full">
            <div className="flex items-center gap-4">
              <label className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                Phân loại
              </label>
              <div className="flex-1 flex items-center gap-2 border-b transition-all p-1"
                   style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                <Icon name="category" className="opacity-40 !text-xl !scale-100" />
                <select 
                  className="w-full bg-transparent outline-none cursor-pointer"
                  style={{ 
                    color: 'var(--text-main)', 
                    fontSize: 'var(--font-body)', 
                    fontWeight: 400 
                  }}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option value="sáng kiến">Sáng kiến</option>
                  <option value="tin tức">Tin tức</option>
                  <option value="giảng dạy">Giảng dạy</option>
                  <option value="đề tài NCKH">Đề tài NCKH</option>
                  <option value="bài báo khoa học">Bài báo khoa học</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Keyword Search */}
        <div className="relative z-10 pt-2">
          <div className="flex items-center gap-4">
            <label className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
              Từ khóa
            </label>
            <div className="flex-1 flex items-center gap-2 border-b transition-all p-1"
                 style={{ borderColor: keyword ? 'var(--primary)' : 'rgba(0,0,0,0.1)' }}>
              <Icon name="search" className="opacity-40 !text-xl !scale-100" />
              <input 
                type="text" 
                placeholder="Nhập từ khóa tìm kiếm..."
                className="w-full bg-transparent outline-none"
                style={{ 
                  color: 'var(--text-main)', 
                  fontSize: 'var(--font-body)', 
                  fontWeight: 400 
                }}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <div className="acrylic-material border border-gray-100 p-6 md:p-8 blocky-shadow min-h-[400px] relative z-10 bg-white/80" style={{ borderRadius: 'var(--radius)' }}>
        {!impersonatedUser ? (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center opacity-40">
            <Icon name="search" className="!text-6xl mb-6 !scale-100" />
            <p className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--text-main)' }}>
              Vui lòng chọn một người dùng để bắt đầu xem thử
            </p>
          </div>
        ) : (
          <div className="animate-fade-in flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black uppercase tracking-tight" style={{ color: 'var(--text-main)' }}>
                {selectedCategory}
              </h3>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">
                Hiển thị kết quả cho: {impersonatedUser.FullName}
              </p>
            </div>
            
            <div className="space-y-3 flex-1">
              {items.length > 0 ? (
                <>
                  {items.map((item, index) => (
                    <BaseHeaderCard 
                      key={`${item.instanceId}-${index}`}
                      title={item.title}
                      subtitle={item.renderedBody.split('\n')[0]}
                      tags={selectedCategory === 'tin tức' ? item.tags : []}
                      date={selectedCategory === 'tin tức' ? item.notificationDate : undefined}
                      onClick={() => setSelectedNotification(item)}
                      index={index}
                    />
                  ))}
                  {hasNextPage && (
                    <div className="py-8 flex justify-center">
                      <button
                        onClick={() => fetchData(true)}
                        disabled={isLoading}
                        className="px-8 py-2 bg-white border border-gray-200 blocky-shadow hover:scale-105 active:scale-95 transition-all flex items-center gap-3 text-xs font-bold"
                        style={{ borderRadius: 'var(--radius)' }}
                      >
                        {isLoading ? (
                          <div className="w-4 h-4 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Icon name="expand_more" />
                        )}
                        Tải thêm
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-20 text-center italic opacity-30">Không có dữ liệu cho mục này.</div>
              )}
            </div>
          </div>
        )}
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
          onClose={handleCloseViewer}
        />
      )}
    </div>
  );
};