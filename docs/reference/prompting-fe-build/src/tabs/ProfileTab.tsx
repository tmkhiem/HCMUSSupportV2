
import React, { useState, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { theme } from '../theme';
import { profileService } from '../services';
import { ActionTile } from '../components/ActionTile';
import { ViewerCard } from '../components/ViewerCard';
import type { ProfileOverviewDto, UserDto } from '../types';

interface ProfileSectionProps {
  title: string;
  icon: string;
  index: number;
  onClickDetail: () => void;
  children: React.ReactNode;
}

const ProfileSection: React.FC<ProfileSectionProps> = ({ title, icon, index, onClickDetail, children }) => {
  const delay = index * 0.05;
  return (
    <div 
      className="animate-fly-in-fade acrylic-material border border-gray-100 p-6 blocky-shadow blocky-shadow-hover transition-all flex flex-col group h-full"
      style={{ 
        animationDelay: `${delay}s`,
        borderRadius: 'var(--radius)' 
      }}
    >
      <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-4">
        <Icon name={icon} className="group-hover:scale-110" isActive />
        <h3 className="font-black text-xs uppercase tracking-widest" style={{ color: 'var(--text-main)' }}>{title}</h3>
      </div>
      
      <div className="text-sm space-y-2 flex-1 mb-6" style={{ color: 'var(--text-muted)' }}>
        {children}
      </div>

      <div className="mt-auto">
        <hr className="border-gray-100 mb-4" />
        <ActionTile 
          title="Chi tiết"
          variant="minimal"
          index={index + 5}
          onClick={onClickDetail}
        />
      </div>
    </div>
  );
};

interface ProfileTabProps {
  user: UserDto;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ user: currentUser }) => {
  const [data, setData] = useState<ProfileOverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeViewer, setActiveViewer] = useState<{ title: string; content: string } | null>(null);

  useEffect(() => {
    profileService.getProfileOverview().then((res) => {
      setData(res);
      setIsLoading(false);
    });
  }, []);

  const openViewer = (title: string, fetchFn: () => Promise<string>) => {
    fetchFn().then(content => {
      setActiveViewer({ title, content });
    });
  };

  if (isLoading || !data) {
    return (
      <div className="h-full flex items-center justify-center opacity-30 italic">
        Đang tải hồ sơ...
      </div>
    );
  }

  const { user } = data;
  
  // Use PpUrl from UserDto instead of introducing it to ProfileOverviewDto
  const avatarUrl = (currentUser.PpUrl && currentUser.PpUrl.trim() !== '') 
    ? currentUser.PpUrl 
    : `${theme.icons.baseUrl}/customer-100.png`;

  return (
    <div className="h-full overflow-y-auto no-scrollbar scroll-smooth">
      <div className="max-w-6xl mx-auto px-4 md:px-10 py-8 md:py-12">
        
        <div 
          className="animate-fly-in-top acrylic-material p-8 md:p-10 mb-10 border-l-8 blocky-shadow flex flex-col md:flex-row items-center gap-8"
          style={{ borderRadius: 'var(--radius)', borderLeftColor: 'var(--primary)' }}
        >
          <div className="relative group">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-sm overflow-hidden border-4 border-white blocky-shadow-hover transition-all transform group-hover:rotate-2">
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
          </div>
          
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-baseline gap-2 mb-2">
              <h1 className="text-4xl font-black tracking-tighter" style={{ color: 'var(--text-main)' }}>{user.fullName}</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-widest"
                    style={{ backgroundColor: 'var(--primary-alpha-10)', color: 'var(--primary)' }}>
                {user.employeeId}
              </span>
            </div>
            <p className="text-xl font-bold mb-6" style={{ color: 'var(--text-muted)' }}>{user.position} — {user.department}</p>
            
            <div className="flex flex-col md:flex-row md:items-center flex-wrap gap-x-10 gap-y-3 max-w-2xl">
              <div className="flex items-center gap-3 text-sm font-semibold opacity-70 shrink-0" style={{ color: 'var(--text-main)' }}>
                <Icon name={theme.icons.mapping.mail} className="!text-[14px] shrink-0" isActive />
                <span className="break-all">{user.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-semibold opacity-70 shrink-0" style={{ color: 'var(--text-main)' }}>
                <Icon name={theme.icons.mapping.phone} className="!text-[14px] shrink-0" isActive />
                <span>{user.phone}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ProfileSection title="Thông tin chung" icon={theme.icons.mapping.general} index={1} onClickDetail={() => openViewer("Thông tin chung", profileService.getGeneralInfo)}>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Ngày sinh</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.general_information.date_of_birth}</span></div>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Giới tính</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.general_information.gender}</span></div>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Dân tộc</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.general_information.ethnicity}</span></div>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Tôn giáo</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.general_information.religion}</span></div>
          </ProfileSection>

          <ProfileSection title="Thông tin chi tiết" icon={theme.icons.mapping.detail} index={2} onClickDetail={() => openViewer("Thông tin chi tiết", profileService.getDetailedInfo)}>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Quê quán</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.contact_details.hometown}</span></div>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Thường trú</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.contact_details.permanent_residence}</span></div>
            <div className="flex justify-between border-b border-gray-50 py-1"><span>Số CCCD</span> <span className="font-bold" style={{ color: 'var(--text-main)' }}>{data.contact_details.id_number}</span></div>
          </ProfileSection>

          <ProfileSection title="Quá trình lương" icon={theme.icons.mapping.salary} index={3} onClickDetail={() => openViewer("Quá trình lương", profileService.getSalaryProgress)}>
            <div className="p-3 bg-gray-50 rounded-sm mb-2">
              <p className="text-[10px] font-black uppercase" style={{ color: 'var(--text-muted)' }}>Bậc lương hiện tại</p>
              <p className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>{data.salary_history}</p>
            </div>
          </ProfileSection>

          <ProfileSection title="Khen thưởng" icon={theme.icons.mapping.awardBlue} index={4} onClickDetail={() => openViewer("Khen thưởng", profileService.getAwards)}>
            <div className="flex gap-3 items-start p-2 hover:bg-white/50 rounded-sm transition-colors">
              <div className="p-1 bg-yellow-50 rounded-sm">
                 <Icon name={theme.icons.mapping.awards} isActive />
              </div>
              <div>
                <p className="font-bold text-xs" style={{ color: 'var(--text-main)' }}>{data.commendations.split(' Năm học ')[0]}</p>
                <p className="text-[10px]">Năm học {data.commendations.split(' Năm học ')[1]}</p>
              </div>
            </div>
          </ProfileSection>

          <ProfileSection title="Chức vụ" icon={theme.icons.mapping.position} index={5} onClickDetail={() => openViewer("Lịch sử chức vụ", profileService.getPositionHistory)}>
            <div className="flex flex-col gap-2">
              <div className="border-l-2 pl-3 py-1" style={{ borderLeftColor: 'var(--primary)' }}>
                <p className="font-bold text-xs uppercase" style={{ color: 'var(--text-main)' }}>{data.position.title}</p>
                <p className="text-[10px]">{data.position.department_info}</p>
              </div>
            </div>
          </ProfileSection>

          <ProfileSection title="Quá trình đào tạo" icon={theme.icons.mapping.education} index={6} onClickDetail={() => openViewer("Quá trình đào tạo", profileService.getAcademicProgress)}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon name={theme.icons.mapping.education} isActive className="!text-[1em]" />
                <span className="font-bold text-xs">{data.educational_background.degree}</span>
              </div>
              <p className="text-[10px] italic">{data.educational_background.institution_and_year}</p>
            </div>
          </ProfileSection>

          <ProfileSection title="Quá trình bồi dưỡng" icon={theme.icons.mapping.training} index={7} onClickDetail={() => openViewer("Quá trình bồi dưỡng", profileService.getTrainingProgress)}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-xs font-bold">Chứng chỉ GVC (2020)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <span className="text-xs font-bold">IELTS Academic 7.5</span>
              </div>
            </div>
          </ProfileSection>

          <ProfileSection title="Đi công tác" icon={theme.icons.mapping.trip} index={8} onClickDetail={() => openViewer("Đi công tác", profileService.getBusinessMissions)}>
            <div className="p-3 rounded-sm border" style={{ backgroundColor: 'var(--primary-alpha-10)', borderColor: 'var(--primary-alpha-50)' }}>
              <p className="font-bold text-[10px] uppercase" style={{ color: 'var(--primary)' }}>Chuyến đi gần nhất</p>
              <p className="font-bold text-xs mt-1" style={{ color: 'var(--text-main)' }}>{data.business_trips.purpose}</p>
              <p className="text-[10px]">{data.business_trips.location_and_date}</p>
            </div>
          </ProfileSection>
        </div>

        <div className="h-20" />
      </div>

      {activeViewer && (
        <ViewerCard 
          title={activeViewer.title} 
          markdown={activeViewer.content} 
          onClose={() => setActiveViewer(null)} 
        />
      )}
    </div>
  );
};
