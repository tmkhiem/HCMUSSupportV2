import React, { useState } from 'react';
import { ActionTile } from '../components/ActionTile';
import { Icon } from '../components/Icon';
import { AdminViewAs } from './features/AdminViewAs';
import { AdminCreateNews } from './features/AdminCreateNews';
import { AdminManageUsers } from './features/AdminManageUsers';
import { theme } from '../theme';

interface AdminAction {
  id: string;
  title: string;
  icon: string;
}

export const AdminTab: React.FC = () => {
  const [selectedAction, setSelectedAction] = useState<AdminAction | null>(null);

  const actions: AdminAction[] = [
    { id: 'view_as', title: "Xem thử", icon: theme.icons.mapping.vision },
    { id: 'create_news', title: "Tạo thông báo mới", icon: theme.icons.mapping.create },
    { id: 'manage_users', title: "Người dùng & nhóm", icon: theme.icons.mapping.manage }
  ];

  const handleActionClick = (action: AdminAction) => {
    setSelectedAction(action);
  };

  const handleBack = () => {
    setSelectedAction(null);
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar scroll-smooth">
      <div className="max-w-6xl mx-auto px-4 md:px-10 py-12">
        <div className="mb-10 animate-fly-in-top">
          <h1 className="text-3xl font-black tracking-tighter uppercase" style={{ color: 'var(--text-main)' }}>
            Quản trị hệ thống
          </h1>
          
          {selectedAction && (
            <button 
              onClick={handleBack}
              className="mt-3 inline-flex items-center gap-2 px-5 py-1.5 rounded-full transition-all text-[10px] font-black uppercase tracking-widest animate-fade-in 
                         bg-slate-400/10 border border-[var(--primary)] 
                         text-[var(--text-main)] hover:bg-[var(--primary)] hover:border-transparent hover:text-white group"
            >
              <Icon 
                name="arrow_back" 
                className="!text-[14px] !scale-100 !transition-none" 
                style={{ color: 'inherit' }} 
              />
              Quay lại danh mục
            </button>
          )}
        </div>

        {!selectedAction ? (
          <div className="flex flex-col lg:flex-row gap-12 animate-fade-in">
            <div className="w-full md:w-1/2 lg:w-1/3 flex flex-col">
              <h3 className="font-black text-[10px] uppercase tracking-widest mb-6 opacity-40 px-1" style={{ color: 'var(--text-main)' }}>
                Tác vụ nhanh
              </h3>
              <div className="flex flex-col">
                {actions.map((action, index) => (
                  <ActionTile
                    key={action.id}
                    index={index}
                    title={action.title}
                    icon={action.icon}
                    onClick={() => handleActionClick(action)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-8 animate-fly-in-fade" style={{ animationDelay: '0.4s' }}>
              <div className="acrylic-material border border-gray-100 p-8 blocky-shadow bg-white/60" style={{ borderRadius: 'var(--radius)' }}>
                <h3 className="font-black text-[10px] uppercase tracking-widest mb-6" style={{ color: 'var(--text-muted)' }}>
                  Trạng thái hệ thống
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Thông báo đã gửi</span>
                    <span className="font-bold text-lg" style={{ color: 'var(--primary)' }}>124</span>
                  </div>
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full w-2/3" style={{ backgroundColor: 'var(--primary)' }} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>Tỷ lệ xem</span>
                    <span className="font-bold text-lg" style={{ color: 'var(--text-main)' }}>86%</span>
                  </div>
                </div>
              </div>

              <div className="acrylic-material border border-gray-100 p-8 blocky-shadow bg-white/60" style={{ borderRadius: 'var(--radius)' }}>
                <h3 className="font-black text-[10px] uppercase tracking-widest mb-6" style={{ color: 'var(--text-muted)' }}>
                  Hoạt động gần đây
                </h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-4 text-xs font-medium" style={{ color: 'var(--text-main)' }}>
                    <div className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: '#4CAF50' }} />
                    <div>
                      <p className="font-bold">Cập nhật thông báo "Lịch thi học kỳ"</p>
                      <p className="opacity-50 text-[10px]">10 phút trước</p>
                    </div>
                  </li>
                  <li className="flex items-start gap-4 text-xs font-medium" style={{ color: 'var(--text-main)' }}>
                    <div className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: '#2196F3' }} />
                    <div>
                      <p className="font-bold">Tạo mới khảo sát "Sự hài lòng wifi"</p>
                      <p className="opacity-50 text-[10px]">2 giờ trước</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : selectedAction.id === 'view_as' ? (
          <AdminViewAs />
        ) : selectedAction.id === 'create_news' ? (
          <AdminCreateNews />
        ) : selectedAction.id === 'manage_users' ? (
          <AdminManageUsers />
        ) : (
          <div className="animate-zoom-in-fade acrylic-material border border-gray-100 p-12 blocky-shadow flex flex-col items-center justify-center min-h-[400px] text-center bg-white/60" style={{ borderRadius: 'var(--radius)' }}>
            <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 bg-[var(--primary-alpha-10)]">
              <Icon name={selectedAction.icon} isActive className="!text-[48px]" />
            </div>
            <h2 className="text-2xl font-black mb-4 uppercase tracking-tight" style={{ color: 'var(--text-main)' }}>
              Không gian {selectedAction.title}
            </h2>
            <p className="max-w-md text-sm font-medium opacity-60 leading-relaxed mb-8" style={{ color: 'var(--text-muted)' }}>
              Đây là khu vực làm việc dành riêng cho tác vụ "{selectedAction.title}". 
              Giao diện chi tiết cho chức năng này đang được đồng bộ hóa từ hệ thống backend.
            </p>
            <div className="flex gap-4">
               <div className="w-3 h-3 rounded-full animate-bounce bg-[var(--primary)]" style={{ animationDelay: '0s' }} />
               <div className="w-3 h-3 rounded-full animate-bounce bg-[var(--primary)]" style={{ animationDelay: '0.1s' }} />
               <div className="w-3 h-3 rounded-full animate-bounce bg-[var(--primary)]" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        )}

        <div className="h-20" />
      </div>
    </div>
  );
};