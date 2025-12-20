import React, { useState } from 'react';
import { X, Trash2, Clock, FileType, Image as ImageIcon, Mic, Video, ChevronRight, AlertTriangle, FileText } from 'lucide-react';
import { HistoryItem, MediaType, AnalysisResult } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClear: () => void;
}

const HistoryDrawer: React.FC<HistoryDrawerProps> = ({ isOpen, onClose, history, onSelect, onClear }) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const getMediaPreview = (item: HistoryItem) => {
    switch (item.mediaType) {
      case MediaType.IMAGE:
        if (item.content) {
             if (item.mimeType === 'application/pdf') {
                 return (
                    <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700/50 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-red-500" />
                    </div>
                 );
             }
             return (
                 <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700/50">
                     <img 
                        src={`data:${item.mimeType || 'image/png'};base64,${item.content}`} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                        loading="lazy"
                     />
                 </div>
             );
        }
        return (
            <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800/50">
                <ImageIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
        );
      case MediaType.VIDEO:
        return (
            <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800/50">
                <Video className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
        );
      case MediaType.AUDIO:
        return (
            <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-800/50">
                <Mic className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
        );
      case MediaType.TEXT:
      default:
        return (
            <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700/50">
                <FileType className="w-6 h-6 text-slate-500 dark:text-slate-400" />
            </div>
        );
    }
  };

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[100] transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl z-[101] transform transition-transform duration-300 flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white/95 dark:bg-slate-900/95 backdrop-blur">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-semibold">
            <Clock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3>Analysis History</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-3">
              <Clock className="w-12 h-12 opacity-20" />
              <p>No history yet</p>
            </div>
          ) : (
            history.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className="w-full bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700/50 hover:border-indigo-500/50 rounded-xl p-3 text-left transition-all group relative overflow-hidden active:scale-[0.98] flex gap-3"
              >
                {/* Media Preview/Icon */}
                {getMediaPreview(item)}

                {/* Details */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.result.label === 'Likely AI' ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400' :
                        item.result.label === 'Likely Human' ? 'bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400' :
                        'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {item.result.probabilityAI}% AI
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {formatDate(item.timestamp)}
                      </span>
                    </div>
                    
                    <p className="text-slate-800 dark:text-slate-200 text-sm font-medium truncate mb-1">
                      {item.preview}
                    </p>

                    <div className="flex justify-between items-center">
                        <div className="flex gap-1">
                            {item.config && item.config.preset !== 'balanced' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 font-medium">
                                    {item.config.preset}
                                </span>
                            )}
                            {item.config && item.config.focus !== 'general' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium">
                                    {item.config.focus}
                                </span>
                            )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors transform group-hover:translate-x-0.5" />
                    </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur">
            {isConfirming ? (
               <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                   <div className="flex items-center gap-2 justify-center text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4" />
                      <p className="text-xs font-semibold uppercase tracking-wide">Are you sure?</p>
                   </div>
                   <p className="text-xs text-center text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
                   <div className="flex gap-2">
                       <button 
                         onClick={() => setIsConfirming(false)} 
                         className="flex-1 py-2 px-3 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                       >
                         Cancel
                       </button>
                       <button 
                         onClick={() => { onClear(); setIsConfirming(false); }} 
                         className="flex-1 py-2 px-3 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 transition-colors"
                       >
                         Yes, Clear All
                       </button>
                   </div>
               </div>
            ) : (
               <button
                 onClick={() => setIsConfirming(true)}
                 className="w-full flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 text-sm py-2.5 px-4 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-200 dark:hover:border-red-500/20 transition-all"
               >
                 <Trash2 className="w-4 h-4" />
                 Clear History
               </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default HistoryDrawer;