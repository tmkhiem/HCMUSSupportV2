
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon';
import { adminService } from '../../services';
import type { UserDto, GroupDto } from '../../types';
import { renderMarkdownSelfImplementation } from '../../markdown';
import { useDebounce } from '../../hooks/useDebounce';

type ManageType = 'users' | 'groups';

export const AdminManageUsers: React.FC = () => {
  const [activeType, setActiveType] = useState<ManageType>('users');
  const [userFilter, setUserFilter] = useState('');
  const debouncedUserFilter = useDebounce(userFilter, 500);
  const [groupFilter, setGroupFilter] = useState('');
  const debouncedGroupFilter = useDebounce(groupFilter, 500);
  const pageSize = 10;

  // Users State
  const [userItems, setUserItems] = useState<UserDto[]>([]);
  const [userNextCursor, setUserNextCursor] = useState<string | number | null>(null);
  const [userHasNext, setUserHasNext] = useState(false);
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  // Groups State
  const [groupItems, setGroupItems] = useState<GroupDto[]>([]);
  const [groupNextCursor, setGroupNextCursor] = useState<string | number | null>(null);
  const [groupHasNext, setGroupHasNext] = useState(false);
  const [isGroupsLoading, setIsGroupsLoading] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  
  const [userProfileMarkdown, setUserProfileMarkdown] = useState<string | null>(null);
  
  // Draft states for Group Editing
  const [draftGroupName, setDraftGroupName] = useState('');
  const [draftMembers, setDraftMembers] = useState<string[]>([]);
  const [groupDetailsOriginal, setGroupDetailsOriginal] = useState<any>(null);

  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const debouncedMemberSearch = useDebounce(memberSearch, 500);
  const [memberSearchResults, setMemberSearchResults] = useState<UserDto[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch Logic
  const fetchUsers = async (isLoadMore: boolean = false) => {
    setIsUsersLoading(true);
    try {
      const result = await adminService.getUsers(
        pageSize,
        isLoadMore ? (userNextCursor || undefined) : undefined,
        debouncedUserFilter || undefined
      );
      setUserItems(prev => isLoadMore ? [...prev, ...result.items] : result.items);
      setUserNextCursor(result.nextCursor);
      setUserHasNext(result.hasNextPage);
    } finally {
      setIsUsersLoading(false);
    }
  };

  const fetchGroups = async (isLoadMore: boolean = false) => {
    setIsGroupsLoading(true);
    try {
      const result = await adminService.getGroups(
        pageSize,
        isLoadMore ? (groupNextCursor || undefined) : undefined,
        debouncedGroupFilter || undefined
      );
      setGroupItems(prev => isLoadMore ? [...prev, ...result.items] : result.items);
      setGroupNextCursor(result.nextCursor);
      setGroupHasNext(result.hasNextPage);
    } finally {
      setIsGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (activeType === 'users') fetchUsers(false);
  }, [activeType, debouncedUserFilter]);

  useEffect(() => {
    if (activeType === 'groups') fetchGroups(false);
  }, [activeType, debouncedGroupFilter]);

  useEffect(() => {
    if (selectedUserId) {
      adminService.getUserProfile(selectedUserId).then(setUserProfileMarkdown);
    } else {
      setUserProfileMarkdown(null);
    }
  }, [selectedUserId]);

  useEffect(() => {
    if (selectedGroupName) {
      adminService.getGroupDetails(selectedGroupName).then(details => {
        if (details) {
          setGroupDetailsOriginal(details);
          setDraftGroupName(details.groupName);
          setDraftMembers([...details.members]);
        }
      });
    } else {
      setGroupDetailsOriginal(null);
      setDraftGroupName('');
      setDraftMembers([]);
    }
  }, [selectedGroupName]);

  useEffect(() => {
    if (debouncedMemberSearch.trim()) {
      adminService.findUsersByKeyword(debouncedMemberSearch).then(setMemberSearchResults);
    } else {
      setMemberSearchResults([]);
    }
  }, [debouncedMemberSearch]);

  const handleTypeChange = (type: ManageType) => {
    setActiveType(type);
    setSelectedUserId(null);
    setSelectedGroupName(null);
  };

  const handleAddMember = (user: UserDto) => {
    if (!draftMembers.includes(user.UserId)) {
      setDraftMembers(prev => [...prev, user.UserId]);
    }
    setIsAddingMember(false);
    setMemberSearch('');
  };

  const handleRemoveMember = (userId: string) => {
    setDraftMembers(prev => prev.filter(m => m !== userId));
  };

  const handleSaveChanges = async () => {
    if (!groupDetailsOriginal) return;
    
    setIsSaving(true);
    const success = await adminService.updateGroupInfo(
      groupDetailsOriginal.groupId,
      draftGroupName,
      draftMembers
    );

    if (success) {
      setSelectedGroupName(draftGroupName);
      fetchGroups(false);
      const details = await adminService.getGroupDetails(draftGroupName);
      setGroupDetailsOriginal(details);
    }
    setIsSaving(false);
  };

  const hasChanges = groupDetailsOriginal && (
    draftGroupName !== groupDetailsOriginal.groupName ||
    draftMembers.length !== groupDetailsOriginal.members.length ||
    !draftMembers.every(m => groupDetailsOriginal.members.includes(m))
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 animate-zoom-in-fade h-full">
      {/* List Area */}
      <div className="w-full lg:w-1/3 flex flex-col gap-4">
        <div className="flex p-1 bg-white/40 border border-gray-100 rounded-full shadow-sm">
          <button
            onClick={() => handleTypeChange('users')}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all ${
              activeType === 'users' ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-transparent text-[var(--text-main)] hover:bg-white/60'
            }`}
          >
            Người dùng
          </button>
          <button
            onClick={() => handleTypeChange('groups')}
            className={`flex-1 py-2 text-xs font-semibold rounded-full transition-all ${
              activeType === 'groups' ? 'bg-[var(--primary)] text-white shadow-sm' : 'bg-transparent text-[var(--text-main)] hover:bg-white/60'
            }`}
          >
            Nhóm
          </button>
        </div>

        <div className="flex-1 flex flex-col bg-white acrylic-material border border-gray-100 blocky-shadow p-4 overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
          <div className="flex items-center gap-3 border-b transition-all p-1 mb-6" style={{ borderColor: (activeType === 'users' ? userFilter : groupFilter) ? 'var(--primary)' : 'rgba(0,0,0,0.1)' }}>
            <Icon name="search" className="opacity-40 !text-sm !scale-100" />
            <input
              type="text"
              placeholder={activeType === 'users' ? "Lọc theo ID, tên, email..." : "Lọc theo tên nhóm..."}
              className="w-full bg-transparent outline-none text-xs font-medium"
              style={{ color: 'var(--text-main)' }}
              value={activeType === 'users' ? userFilter : groupFilter}
              onChange={(e) => {
                if (activeType === 'users') { setUserFilter(e.target.value); }
                else { setGroupFilter(e.target.value); }
              }}
            />
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar space-y-1 mb-4">
            {activeType === 'users' ? (
              <>
                {userItems.map((user) => (
                  <button
                    key={user.UserId}
                    onClick={() => setSelectedUserId(user.UserId)}
                    className={`w-full flex items-center gap-4 p-3 rounded-sm transition-colors group text-left border ${selectedUserId === user.UserId ? 'bg-[var(--primary-alpha-10)] border-[var(--primary)]' : 'hover:bg-slate-50 border-transparent hover:border-gray-100'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-[var(--primary-alpha-10)] flex items-center justify-center shrink-0">
                      <Icon name="person" className="!text-lg group-hover:scale-110" style={{ color: 'var(--primary)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal truncate" style={{ color: 'var(--text-main)' }}>{user.FullName}</p>
                      <p className="text-[11px] font-normal opacity-50" style={{ color: 'var(--text-muted)' }}>{user.UserId}</p>
                    </div>
                  </button>
                ))}
                {userHasNext && (
                  <button 
                    onClick={() => fetchUsers(true)}
                    disabled={isUsersLoading}
                    className="w-full py-4 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                  >
                    {isUsersLoading ? <div className="w-3 h-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /> : <Icon name="expand_more" className="!text-xs" />}
                    Tải thêm
                  </button>
                )}
              </>
            ) : (
              <>
                {groupItems.map((group) => (
                  <button
                    key={group.GroupName}
                    onClick={() => setSelectedGroupName(group.GroupName)}
                    className={`w-full flex items-center gap-4 p-3 rounded-sm transition-colors group text-left border ${selectedGroupName === group.GroupName ? 'bg-[var(--primary-alpha-10)] border-[var(--primary)]' : 'hover:bg-slate-50 border-transparent hover:border-gray-100'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon name="groups" className="!text-lg group-hover:scale-110" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-normal truncate" style={{ color: 'var(--text-main)' }}>{group.GroupName}</p>
                      <p className="text-[11px] font-normal opacity-50" style={{ color: 'var(--text-muted)' }}>{group.UserCount} thành viên</p>
                    </div>
                  </button>
                ))}
                {groupHasNext && (
                  <button 
                    onClick={() => fetchGroups(true)}
                    disabled={isGroupsLoading}
                    className="w-full py-4 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
                  >
                    {isGroupsLoading ? <div className="w-3 h-3 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" /> : <Icon name="expand_more" className="!text-xs" />}
                    Tải thêm
                  </button>
                )}
              </>
            )}
            
            {!isUsersLoading && !isGroupsLoading && (activeType === 'users' ? userItems : groupItems).length === 0 && (
              <div className="py-20 text-center opacity-20 italic text-xs">Không tìm thấy kết quả.</div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed View Area */}
      <div className="flex-1 flex flex-col bg-white acrylic-material border border-gray-100 blocky-shadow p-8 min-h-[400px] relative" style={{ borderRadius: 'var(--radius)' }}>
        {activeType === 'users' && userProfileMarkdown ? (
          <div className="animate-zoom-in-fade overflow-y-auto no-scrollbar">
            {renderMarkdownSelfImplementation(userProfileMarkdown)}
          </div>
        ) : activeType === 'groups' && groupDetailsOriginal ? (
          <div className="animate-zoom-in-fade space-y-8 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 group max-w-md">
                  <input 
                    type="text" 
                    className="text-sm font-semibold outline-none bg-transparent border-b border-gray-200 focus:border-[var(--primary)] transition-all flex-1 py-1"
                    style={{ color: 'var(--text-main)' }}
                    value={draftGroupName}
                    onChange={(e) => setDraftGroupName(e.target.value)}
                  />
                  <Icon name="edit" className="opacity-20 group-hover:opacity-100 !text-xs" />
                </div>
                <div className="text-sm font-normal mt-2 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-main)' }}>
                  <span>Mã nhóm:</span>
                  <code className="px-1.5 py-0.5 border border-gray-200 rounded font-mono text-[11px] bg-gray-50 leading-none">
                    {groupDetailsOriginal.groupId}
                  </code>
                  <span className="opacity-30 mx-1">—</span>
                  <span>{groupDetailsOriginal.relatedEvents} thông báo đã gửi</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Thành viên ({draftMembers.length})</h3>
                <div className="relative" ref={dropdownRef}>
                  <button 
                    onClick={() => setIsAddingMember(!isAddingMember)}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--primary)] text-white text-[9px] font-black uppercase tracking-widest shadow-md hover:scale-105 active:scale-95 transition-all"
                  >
                    <Icon name="person_add" className="!text-xs !scale-100" style={{ color: 'white' }} />
                    Thêm thành viên
                  </button>

                  {isAddingMember && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-100 blocky-shadow z-50 p-2 animate-zoom-in-fade" style={{ borderRadius: 'var(--radius)' }}>
                      <input 
                        type="text" 
                        placeholder="Tìm theo ID/Tên..."
                        className="w-full text-xs p-2 border-b border-gray-100 outline-none mb-2 bg-transparent"
                        style={{ color: 'var(--text-main)' }}
                        autoFocus
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                      <div className="max-h-40 overflow-y-auto no-scrollbar space-y-1">
                        {memberSearchResults.map(user => (
                          <button 
                            key={user.UserId} 
                            onClick={() => handleAddMember(user)}
                            className="w-full text-left p-2 hover:bg-slate-50 text-xs flex justify-between items-center group"
                          >
                            <span>{user.FullName} ({user.UserId})</span>
                            <Icon name="add" className="!text-xs opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                        {memberSearch && memberSearchResults.length === 0 && (
                          <p className="text-[10px] text-center opacity-30 italic py-2">Không tìm thấy</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto no-scrollbar grid grid-cols-1 md:grid-cols-2 gap-2 content-start pb-20">
                {draftMembers.length > 0 ? draftMembers.map((mid: string) => {
                  return (
                    <div key={mid} className="flex items-center gap-3 p-3 bg-slate-50 rounded-sm border border-gray-100 group">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                        <Icon name="person" className="!text-sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{mid}</p>
                        <p className="text-[10px] opacity-40">{mid}</p>
                      </div>
                      <button 
                        onClick={() => handleRemoveMember(mid)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                      >
                        <Icon name="close" className="!text-xs" style={{ color: 'inherit' }} />
                      </button>
                    </div>
                  );
                }) : (
                  <div className="col-span-full py-10 text-center opacity-20 italic text-xs">Chưa có thành viên nào trong nhóm.</div>
                )}
              </div>
            </div>

            {/* Bottom Actions Area */}
            {hasChanges && (
              <div className="absolute bottom-6 left-6 right-6 p-2 bg-white/60 acrylic-material border border-gray-100 rounded-sm flex items-center justify-between shadow-lg animate-fly-in-bottom">
                <span className="text-[10px] font-bold uppercase tracking-widest pl-4 opacity-50">Bạn có thay đổi chưa lưu</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setDraftGroupName(groupDetailsOriginal.groupName);
                      setDraftMembers([...groupDetailsOriginal.members]);
                    }}
                    className="px-4 py-2 text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 rounded-sm transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={handleSaveChanges}
                    disabled={isSaving}
                    className="px-8 py-2 bg-[var(--primary)] text-white text-[9px] font-black uppercase tracking-widest rounded-sm shadow-md hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="save" className="!text-[10px] !scale-100" style={{ color: 'white' }} />
                    )}
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-30 space-y-4">
            <Icon name={activeType === 'users' ? "badge" : "account_tree"} className="!text-6xl" />
            <h3 className="text-lg font-black uppercase tracking-tight">Chi tiết {activeType === 'users' ? 'người dùng' : 'nhóm'}</h3>
            <p className="text-xs font-medium max-w-xs leading-relaxed">Chọn một mục từ danh sách bên trái để quản lý chi tiết.</p>
          </div>
        )}
      </div>
    </div>
  );
};
