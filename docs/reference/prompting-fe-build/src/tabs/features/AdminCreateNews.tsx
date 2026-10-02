import React, { useState, useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { adminService } from '../../services';
import { theme } from '../../theme';
import { renderMarkdownSelfImplementation } from '../../markdown';

export const AdminCreateNews: React.FC = () => {
  const [title, setTitle] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [targetCategory, setTargetCategory] = useState<'Cá nhân' | 'Nhóm' | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [body, setBody] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDataEntryEnabled, setIsDataEntryEnabled] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);

  useEffect(() => {
    adminService.getAllTags().then(setAvailableTags);
  }, []);

  const templateLink = "#"; 

  const handleUpload = async (type: 'users' | 'groups') => {
    setIsUploading(true);
    try {
      const targets = await adminService.uploadRecipientFile(type);
      setTargetCategory(type === 'users' ? 'Cá nhân' : 'Nhóm');
      setSelectedTargets(targets);
      setIsDataEntryEnabled(true);
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setIsUploading(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (!isDataEntryEnabled) return;
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async () => {
    if (!isDataEntryEnabled) return;
    if (!title.trim() || selectedTargets.length === 0 || !body.trim()) {
      alert("Vui lòng điền đầy đủ thông tin (Tiêu đề, Người nhận, Nội dung).");
      return;
    }
    const success = await adminService.createEventWithTargets({
      title,
      targets: selectedTargets,
      targetCategory: targetCategory || '',
      tags: selectedTags,
      date,
      body
    });
    if (success) {
      alert("Thông báo đã được gửi thành công!");
    }
  };

  return (
    <div className="animate-zoom-in-fade space-y-8 max-w-5xl pb-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Config */}
        <div className="space-y-6">
          <div className="acrylic-material border border-gray-100 p-6 blocky-shadow bg-white/80" style={{ borderRadius: 'var(--radius)' }}>
            <div className="space-y-6">
              {/* Targets Section */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-baseline">
                  <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.colors.text.muted }}>Đối tượng nhận</label>
                  <p className="text-[10px] font-medium" style={{ color: theme.colors.text.muted }}>
                    Tải file mẫu tại <a href={templateLink} className="font-bold underline" style={{ color: theme.colors.primary }}>đây</a>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    disabled={isUploading}
                    onClick={() => handleUpload('users')}
                    className="flex flex-col items-center justify-center py-4 px-2 border border-dashed border-gray-300 rounded-sm hover:border-[var(--primary)] hover:bg-[var(--primary-alpha-10)] transition-all group disabled:opacity-50"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mb-1" />
                    ) : (
                      <Icon name="upload_file" className="!text-xl mb-1 opacity-40 group-hover:opacity-100" />
                    )}
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-[var(--primary)]">DS Cá nhân</span>
                  </button>
                  <button 
                    disabled={isUploading}
                    onClick={() => handleUpload('groups')}
                    className="flex flex-col items-center justify-center py-4 px-2 border border-dashed border-gray-300 rounded-sm hover:border-[var(--primary)] hover:bg-[var(--primary-alpha-10)] transition-all group disabled:opacity-50"
                  >
                    {isUploading ? (
                      <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin mb-1" />
                    ) : (
                      <Icon name="drive_folder_upload" className="!text-xl mb-1 opacity-40 group-hover:opacity-100" />
                    )}
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-[var(--primary)]">DS Nhóm</span>
                  </button>
                </div>

                {/* Selected Recipients Chips (Read-only) */}
                <div className="bg-slate-50/50 border border-gray-100 rounded-sm p-4 min-h-[120px] max-h-[200px] overflow-y-auto no-scrollbar shadow-inner mt-1">
                  {selectedTargets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-20 pointer-events-none">
                      <Icon name="file_present" className="!text-3xl mb-2" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Vui lòng tải tệp danh sách</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 opacity-50">
                        <Icon name={targetCategory === 'Cá nhân' ? "person" : "groups"} className="!text-xs" />
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Đã nhập {selectedTargets.length} {targetCategory}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedTargets.map(id => (
                          <div key={id} className="bg-white border border-gray-200 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-sm animate-zoom-in-fade hover:border-[var(--primary)] transition-colors">
                            <span className="text-[10px] font-black" style={{ color: 'var(--text-main)' }}>{id}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className={`flex flex-col gap-2 transition-opacity duration-300 ${!isDataEntryEnabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.colors.text.muted }}>Gắn thẻ</label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => (
                    <button 
                      key={tag}
                      disabled={!isDataEntryEnabled}
                      onClick={() => toggleTag(tag)}
                      className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-full border transition-all 
                        ${selectedTags.includes(tag) 
                          ? 'bg-[var(--primary)] text-white border-transparent shadow-md' 
                          : 'bg-white border-gray-100 hover:border-[var(--primary)] text-slate-500'}
                        ${!isDataEntryEnabled ? 'pointer-events-none' : ''}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <div className={`flex flex-col gap-2 transition-opacity duration-300 ${!isDataEntryEnabled ? 'opacity-30 cursor-not-allowed' : ''}`}>
                <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: theme.colors.text.muted }}>Ngày hiệu lực</label>
                <input 
                  type="date"
                  disabled={!isDataEntryEnabled}
                  className="w-full bg-white/60 border border-gray-100 px-4 py-3 rounded-sm outline-none focus:border-[var(--primary)] transition-all text-sm font-semibold disabled:cursor-not-allowed"
                  style={{ color: theme.colors.text.main }}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Content/Editor */}
        <div className="flex flex-col h-full gap-6">
          <div className="acrylic-material border border-gray-100 blocky-shadow bg-white/80 flex flex-col flex-1" style={{ borderRadius: 'var(--radius)' }}>
            <div className="flex flex-col border-b border-gray-100">
              <div className="flex items-center justify-between px-6 py-4 bg-white/40 border-b border-gray-50">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40" style={{ color: theme.colors.text.main }}>Nội dung thông báo</h3>
                <button 
                  disabled={!isDataEntryEnabled}
                  onClick={() => setShowPreview(!showPreview)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-[9px] font-black uppercase tracking-widest text-slate-600 hover:bg-[var(--primary)] hover:text-white transition-all disabled:opacity-50`}
                >
                  <Icon name={showPreview ? "edit" : "visibility"} className="!text-[12px] !scale-100" style={{ color: 'inherit' }} />
                  {showPreview ? "Soạn thảo" : "Xem thử"}
                </button>
              </div>
              
              <div className={`px-6 py-4 transition-opacity duration-300 ${!isDataEntryEnabled ? 'opacity-30' : ''}`}>
                <input 
                  type="text"
                  disabled={!isDataEntryEnabled}
                  placeholder="Nhập tiêu đề thông báo tại đây..."
                  className="w-full bg-transparent text-xl font-black tracking-tight outline-none placeholder:opacity-20 disabled:cursor-not-allowed"
                  style={{ color: theme.colors.text.main }}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
            
            <div className={`flex-1 min-h-[440px] flex flex-col transition-opacity duration-300 ${!isDataEntryEnabled ? 'opacity-30' : ''}`}>
              {!showPreview ? (
                <textarea 
                  disabled={!isDataEntryEnabled}
                  placeholder="Nhập nội dung chi tiết (hỗ trợ Markdown: * danh sách, **in đậm**, | bảng |)..."
                  className="w-full flex-1 p-6 bg-transparent outline-none font-medium text-sm leading-relaxed resize-none no-scrollbar disabled:cursor-not-allowed"
                  style={{ color: theme.colors.text.main }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              ) : (
                <div className="w-full flex-1 p-8 overflow-y-auto no-scrollbar prose prose-slate max-w-none">
                  {body.trim() ? (
                    renderMarkdownSelfImplementation(body)
                  ) : (
                    <div className="flex flex-col items-center justify-center py-32 opacity-20 italic text-sm text-center">
                       <Icon name="description" className="!text-5xl mb-4" />
                       Nhập nội dung để xem trước kết quả hiển thị...
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button 
            disabled={!isDataEntryEnabled}
            onClick={handleSubmit}
            className={`w-full py-5 bg-[var(--primary)] text-white font-black uppercase tracking-[0.3em] text-xs rounded-sm blocky-shadow hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-4 group disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed`}
          >
            <Icon name="send" className="!text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
            Phát hành thông báo
          </button>
        </div>
      </div>
    </div>
  );
};
