import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileType, Image as ImageIcon, Mic, Video, CheckCircle2, AlertTriangle, HelpCircle, Loader2, History as HistoryIcon, Activity, X, FileText, Trash2, Plus, Layers, Settings, Shield, User, PenTool, Layout, ScanFace, Sliders, Info, Sun, Moon, ChevronDown, ChevronUp, RotateCcw, Download, FileJson, Printer, Copy, Check, Link as LinkIcon, ExternalLink, Zap, FastForward, Eye, Maximize2, Play, Pause, FileBox, Monitor } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MediaType, AnalysisResult, QueueItem, HistoryItem, AnalysisPreset, AnalysisFocus, AdvancedConfig, KeyFeature } from './types';
import { detectAIContent } from './services/geminiService';
import AnalysisChart from './components/AnalysisChart';
import ChatWidget from './components/ChatWidget';
import HistoryDrawer from './components/HistoryDrawer';
import InfoTooltip from './components/InfoTooltip';
import PdfPreview from './components/PdfPreview';

// Support up to 100MB videos via progressive frame sampling
const MAX_FILE_SIZE = 100 * 1024 * 1024; 
const SAFE_INLINE_LIMIT = 18 * 1024 * 1024; // ~18MB safe limit for direct base64 injection

// Configuration for supported file types per media mode
const FILE_CONFIG: Record<string, { mime: string[]; label: string }> = {
  [MediaType.IMAGE]: {
    mime: [
      'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 
      'application/pdf'
    ],
    label: 'JPG, PNG, WEBP, HEIC, PDF'
  },
  [MediaType.AUDIO]: {
    mime: [
      'audio/wav', 'audio/x-wav', 'audio/mp3', 'audio/mpeg', 'audio/aac', 
      'audio/ogg', 'audio/flac', 'audio/x-m4a', 'audio/mp4', 'audio/webm',
      'audio/aiff', 'audio/x-aiff', 'audio/opus'
    ],
    label: 'MP3, WAV, AAC, FLAC, OGG, WEBM, AIFF'
  },
  [MediaType.VIDEO]: {
    mime: [
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo', 
      'video/webm', 'video/3gpp', 'video/x-matroska', 'video/x-flv',
      'video/x-ms-wmv'
    ],
    label: 'MP4, WEBM, MOV, AVI, MKV, WMV'
  }
};

// --- Helper: Robust MIME Type Detection for Mobile ---
const getMimeType = (file: File): string => {
  // If browser provides a valid type, use it
  if (file.type && file.type !== '') return file.type;

  // Fallback: Infer from extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext) return 'application/octet-stream';

  const mimeMap: Record<string, string> = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'heic': 'image/heic', 'heif': 'image/heif', 'pdf': 'application/pdf',
    'mp3': 'audio/mp3', 'wav': 'audio/wav', 'aac': 'audio/aac', 'flac': 'audio/flac', 'ogg': 'audio/ogg', 'm4a': 'audio/x-m4a',
    'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo', 'webm': 'video/webm', 'mkv': 'video/x-matroska'
  };

  return mimeMap[ext] || 'application/octet-stream';
};

// --- Toast Component ---
interface Toast {
    id: string;
    type: 'success' | 'error' | 'info';
    message: string;
}

const ToastContainer = ({ toasts, removeToast }: { toasts: Toast[], removeToast: (id: string) => void }) => (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
        {toasts.map((toast) => (
            <div 
                key={toast.id}
                className={`animate-toast-in pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-xl border backdrop-blur-md ${
                    toast.type === 'success' ? 'bg-white/95 dark:bg-slate-800/95 border-green-200 dark:border-green-900 text-green-700 dark:text-green-300' :
                    toast.type === 'error' ? 'bg-white/95 dark:bg-slate-800/95 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300' :
                    'bg-white/95 dark:bg-slate-800/95 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-300'
                }`}
            >
                {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
                {toast.type === 'error' && <AlertTriangle className="w-5 h-5 shrink-0" />}
                {toast.type === 'info' && <Info className="w-5 h-5 shrink-0" />}
                <p className="text-sm font-medium">{toast.message}</p>
                <button onClick={() => removeToast(toast.id)} className="ml-auto opacity-50 hover:opacity-100 p-1">
                    <X className="w-4 h-4" />
                </button>
            </div>
        ))}
    </div>
);

function App() {
  const [activeTab, setActiveTab] = useState<MediaType>(MediaType.TEXT);
  const [textInput, setTextInput] = useState('');
  
  // Settings State with Persistence
  const [analysisPreset, setAnalysisPreset] = useState<AnalysisPreset>(() => 
    (localStorage.getItem('veritas_preset') as AnalysisPreset) || 'balanced'
  );
  const [analysisFocus, setAnalysisFocus] = useState<AnalysisFocus>(() => 
    (localStorage.getItem('veritas_focus') as AnalysisFocus) || 'general'
  );
  
  // Advanced Config State
  const defaultAdvanced: AdvancedConfig = {
      temperature: 0.2,
      topP: 0.8,
      topK: 32,
      reasoningDepth: 'standard',
      progressiveAnalysis: false, // Disabled by default
      sampleInterval: 5
  };

  const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>(() => {
      const saved = localStorage.getItem('veritas_advanced');
      return saved ? JSON.parse(saved) : defaultAdvanced;
  });

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light' || saved === 'system') return saved as any;
    }
    return 'system';
  });

  // Queue State
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  
  // Drag State
  const [isDragging, setIsDragging] = useState(false);

  // Analysis Result State
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzingText, setIsAnalyzingText] = useState(false);
  
  // Popover States
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isSourceOpen, setIsSourceOpen] = useState(false);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);

  // UI State
  const [isCopying, setIsCopying] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast Helper
  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = crypto.randomUUID();
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
  };

  const removeToast = (id: string) => {
      setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Derived state for the currently active item
  const activeItem = queue.find(item => item.id === activeFileId) || null;
  const isAnalyzing = isAnalyzingText || (activeItem?.status === 'analyzing');

  // Generate a static waveform for audio files
  const audioWaveform = useMemo(() => {
    return Array.from({ length: 40 }, () => Math.max(20, Math.random() * 100));
  }, [activeItem?.id]);

  // Determine if configuration is modified from defaults
  const isModified = useMemo(() => {
      if (analysisPreset !== 'balanced') return true;
      if (analysisFocus !== 'general') return true;
      
      // Check advanced config against defaults for "balanced" preset
      if (advancedConfig.temperature !== 0.2) return true;
      if (advancedConfig.topP !== 0.8) return true;
      if (advancedConfig.topK !== 32) return true;
      if (advancedConfig.reasoningDepth !== 'standard') return true;
      if (advancedConfig.progressiveAnalysis !== false) return true;
      if (advancedConfig.sampleInterval !== 5) return true;

      return false;
  }, [analysisPreset, analysisFocus, advancedConfig]);

  // Persist Settings
  useEffect(() => {
    localStorage.setItem('veritas_preset', analysisPreset);
  }, [analysisPreset]);

  useEffect(() => {
    localStorage.setItem('veritas_focus', analysisFocus);
  }, [analysisFocus]);

  useEffect(() => {
      localStorage.setItem('veritas_advanced', JSON.stringify(advancedConfig));
  }, [advancedConfig]);

  // Apply Theme Side Effects
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (t: 'light' | 'dark' | 'system') => {
      const isDark = t === 'dark' || (t === 'system' && mediaQuery.matches);
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);
    localStorage.setItem('theme', theme);

    const handleSystemChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, [theme]);

  // Handle Share Param on Load
  useEffect(() => {
      const searchParams = new URLSearchParams(window.location.search);
      const shareData = searchParams.get('share');
      if (shareData) {
          try {
              // Decode base64 utf8
              const jsonStr = decodeURIComponent(escape(atob(shareData)));
              const data = JSON.parse(jsonStr);
              
              // Handle v1 (legacy) and v2 structure
              const resultData = data.result || data; // v1 might just be the object or wrapped
              setResult(resultData);
              
              // v2 Config Restoration
              if (data.config) {
                  setAnalysisPreset(data.config.preset);
                  setAnalysisFocus(data.config.focus);
                  setAdvancedConfig(data.config.advanced);
              }

              const mode = data.type || (data.text ? MediaType.TEXT : MediaType.IMAGE); // Inference fallback
              setActiveTab(mode);

              if (mode === MediaType.TEXT && data.text) {
                  setTextInput(data.text);
              } else if (data.meta) {
                  // Attempt to restore preview from content if available
                  let previewUrl: string | undefined = undefined;
                  if (data.content && data.meta.mime) {
                      try {
                           const byteCharacters = atob(data.content);
                           const byteNumbers = new Array(byteCharacters.length);
                           for (let i = 0; i < byteCharacters.length; i++) {
                               byteNumbers[i] = byteCharacters.charCodeAt(i);
                           }
                           const byteArray = new Uint8Array(byteNumbers);
                           const blob = new Blob([byteArray], { type: data.meta.mime });
                           previewUrl = URL.createObjectURL(blob);
                      } catch (e) {
                          console.error("Failed to restore preview content", e);
                      }
                  }

                  // Restore Ghost Item for Media
                   const dummyFile = new File([""], data.meta.name || "Shared File", { type: data.meta.mime || 'application/octet-stream' });
                   const ghostItem: QueueItem = {
                      id: 'shared-' + Date.now(),
                      file: dummyFile,
                      status: 'done',
                      progress: 100,
                      mimeType: data.meta.mime || 'unknown',
                      base64: data.content,
                      previewUrl: previewUrl,
                      result: resultData
                   };
                   setQueue([ghostItem]);
                   setActiveFileId(ghostItem.id);
              } else if (data.text === undefined && !data.meta) {
                   // v1 legacy fallback for image share (no meta)
                   const dummyFile = new File([""], "Shared Content", { type: 'unknown' });
                   const ghostItem: QueueItem = {
                      id: 'shared-legacy-' + Date.now(),
                      file: dummyFile,
                      status: 'done',
                      progress: 100,
                      mimeType: 'unknown',
                      previewUrl: undefined,
                      result: resultData
                   };
                   setQueue([ghostItem]);
                   setActiveFileId(ghostItem.id);
              }

              // Clean URL
              window.history.replaceState({}, '', window.location.pathname);
              addToast('Shared analysis loaded', 'success');
          } catch (e) {
              console.error("Failed to parse shared data", e);
              addToast('Invalid shared link', 'error');
          }
      }
  }, []);

  const cycleTheme = () => {
    setTheme(prev => {
        if (prev === 'light') return 'dark';
        if (prev === 'dark') return 'system';
        return 'light';
    });
  };

  // Handle Preset Change acting as a Macro for Advanced Settings
  const handlePresetChange = (preset: AnalysisPreset) => {
      setAnalysisPreset(preset);
      // Update advanced config based on preset defaults
      switch (preset) {
          case 'sensitive':
              setAdvancedConfig(prev => ({ ...prev, temperature: 0.1, topP: 0.7 }));
              break;
          case 'conservative':
              setAdvancedConfig(prev => ({ ...prev, temperature: 0.3, topP: 0.9 }));
              break;
          case 'balanced':
          default:
              setAdvancedConfig(prev => ({ ...prev, temperature: 0.2, topP: 0.8 }));
              break;
      }
  };

  const handleResetConfig = () => {
    setAnalysisPreset('balanced');
    setAnalysisFocus('general');
    setAdvancedConfig(defaultAdvanced);
    addToast('Configuration reset to defaults', 'info');
  };

  const handleDownloadJSON = () => {
    if (!result) return;
    
    const exportData = {
      timestamp: new Date().toISOString(),
      mediaType: activeTab,
      fileName: activeItem?.file.name || 'text-input',
      configuration: {
        preset: analysisPreset,
        focus: analysisFocus,
        advanced: advancedConfig
      },
      analysisResult: result
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `veritas_report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    setIsExportOpen(false);
    addToast('Report downloaded successfully', 'success');
  };

  const handlePrint = () => {
    setIsExportOpen(false);
    setTimeout(() => {
        window.print();
    }, 150);
  };

  const handleShare = () => {
      if (!result) return;
      
      const MAX_URL_LENGTH = 8000;

      const generateUrl = (payload: any) => {
          try {
            const jsonStr = JSON.stringify(payload);
            return `${window.location.origin}${window.location.pathname}?share=${btoa(unescape(encodeURIComponent(jsonStr)))}`;
          } catch(e) {
            return "";
          }
      };

      // Configuration for degradation levels (strategies) to fit URL limits
      const shareStrategies = [
        // Level 1: Full Fidelity (Include content if possible)
        { includeContent: true, textLimit: Infinity, reasoningLimit: Infinity },
        // Level 2: No Media Content (if applicable)
        { includeContent: false, textLimit: Infinity, reasoningLimit: Infinity },
        // Level 3: Truncate Text Input (if Text Mode) to ~2000 chars
        { includeContent: false, textLimit: 2000, reasoningLimit: Infinity },
        // Level 4: Aggressive Text Truncate + Reasoning Truncate
        { includeContent: false, textLimit: 500, reasoningLimit: 500 }
      ];

      for (const settings of shareStrategies) {
          // If strategy requires content but we are in text mode or no active item, 
          // essentially acts same as 'includeContent: false', but redundant.
          // However, 'includeContent' specifically refers to base64 media content.
          
          // Prepare Text (for Text Mode or fallback)
          let textToShare = activeTab === MediaType.TEXT ? textInput : undefined;
          if (textToShare && textToShare.length > settings.textLimit) {
              textToShare = textToShare.substring(0, settings.textLimit) + "\n... [Truncated for Share]";
          }

          // Prepare Reasoning (Truncate if needed)
          let reasoningToShare = result.reasoning;
          if (reasoningToShare.length > settings.reasoningLimit) {
              reasoningToShare = reasoningToShare.substring(0, settings.reasoningLimit) + "... [Truncated]";
          }
          
          const payload = {
              v: 2,
              type: activeTab,
              result: { ...result, reasoning: reasoningToShare },
              config: {
                  preset: analysisPreset,
                  focus: analysisFocus,
                  advanced: advancedConfig
              },
              text: textToShare,
              meta: activeTab !== MediaType.TEXT && activeItem ? {
                  name: activeItem.file.name,
                  mime: activeItem.mimeType,
                  size: activeItem.file.size
              } : undefined,
              // Only include content if strategy says so, and it exists
              content: settings.includeContent && activeTab !== MediaType.TEXT && activeItem ? activeItem.base64 : undefined,
              timestamp: Date.now()
          };

          const url = generateUrl(payload);
          
          // Check if URL was generated successfully and fits limits
          if (url && url.length <= MAX_URL_LENGTH) {
              setShareUrl(url);
              setIsShareOpen(true);
              return;
          }
      }
      
      // If all strategies fail
      addToast("Result too large to share via URL", 'error');
  };

  const copyShareUrl = async () => {
      try {
          await navigator.clipboard.writeText(shareUrl);
          addToast("Link copied to clipboard", 'success');
          setIsShareOpen(false);
      } catch (e) {
          addToast("Failed to copy link", 'error');
      }
  };

  const handleCopyReasoning = async () => {
      if (!result?.reasoning) return;
      try {
          await navigator.clipboard.writeText(result.reasoning);
          setIsCopying(true);
          addToast('Reasoning copied to clipboard', 'success');
          setTimeout(() => setIsCopying(false), 2000);
      } catch (err) {
          addToast('Failed to copy text', 'error');
      }
  };

  // Load history from local storage
  useEffect(() => {
    const saved = localStorage.getItem('veritas_history');
    if (saved) {
      try {
        const parsedHistory = JSON.parse(saved);
        setHistory(parsedHistory);
      } catch (e) {
        console.error("Failed to parse history", e);
        addToast('Error loading history', 'error');
      }
    }
  }, []);

  const saveToHistory = (
    newResult: AnalysisResult, 
    type: MediaType, 
    previewText: string,
    content?: string,
    mimeType?: string,
    fileName?: string
  ) => {
    // For large files (progressive), we might not want to save the whole content to localstorage
    // if it exceeds limits. 
    let safeContent = content;
    if (content && content.length > 5 * 1024 * 1024) {
        // Just save a placeholder if too big for localStorage
        // Or if it was a video analyzed progressively, we might not have the full blob string anyway
        safeContent = undefined; 
    }

    const newItem: HistoryItem = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      mediaType: type,
      preview: previewText,
      result: newResult,
      content: safeContent,
      mimeType,
      fileName,
      config: {
        preset: analysisPreset,
        focus: analysisFocus,
        advanced: advancedConfig
      }
    };
    
    setHistory(prev => {
        const updatedHistory = [newItem, ...prev].slice(0, 50);
        try {
            localStorage.setItem('veritas_history', JSON.stringify(updatedHistory));
        } catch (e) {
            console.warn("History persistence failed. Quota exceeded.");
        }
        return updatedHistory;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('veritas_history');
    addToast('History cleared', 'info');
  };

  const restoreFromHistory = (item: HistoryItem) => {
    setActiveTab(item.mediaType);
    
    // Restore Analysis Configuration
    if (item.config) {
        setAnalysisPreset(item.config.preset);
        setAnalysisFocus(item.config.focus);
        if (item.config.advanced) {
            setAdvancedConfig(item.config.advanced);
        }
    }

    if (item.mediaType === MediaType.TEXT) {
        setTextInput(item.content || '');
        setQueue([]);
        setResult(item.result); 
    } else {
        // For Media Types
        let restoredItem: QueueItem | null = null;
        
        if (item.content && item.mimeType) {
            try {
                const byteCharacters = atob(item.content);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: item.mimeType });
                const file = new File([blob], item.fileName || 'restored_media', { type: item.mimeType });
                const url = URL.createObjectURL(blob);

                restoredItem = {
                    id: crypto.randomUUID(), // Always new ID to force re-render
                    file: file,
                    status: 'done',
                    progress: 100,
                    mimeType: item.mimeType,
                    base64: item.content,
                    previewUrl: url,
                    result: item.result
                };
            } catch (e) {
                console.error("Error restoring media from history", e);
                addToast("Could not restore media content from history", 'error');
            }
        } 

        // If content was too large and not saved, create a placeholder
        if (!restoredItem) {
             const dummyFile = new File([""], item.fileName || "Large File", { type: item.mimeType || 'application/octet-stream' });
             restoredItem = {
                id: crypto.randomUUID(),
                file: dummyFile,
                status: 'done',
                progress: 100,
                mimeType: item.mimeType || 'unknown',
                base64: undefined,
                previewUrl: undefined, // No preview available
                result: item.result
            };
            addToast("Media content not available (too large), showing result only.", 'info');
        }

        if (restoredItem) {
            setQueue([restoredItem]);
            setActiveFileId(restoredItem.id);
            setResult(item.result);
        }
    }
  };

  const resetState = () => {
    setQueue([]);
    setActiveFileId(null);
    setTextInput('');
    setResult(null);
  };

  const handleTabChange = (type: MediaType) => {
    setActiveTab(type);
    resetState();
  };

  const updateQueueItem = (id: string, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const processFile = (item: QueueItem) => {
    // If file is very large, don't read the whole thing into base64 immediately
    // Only read if it's small enough for inline processing or we need a preview
    // For 100MB video, reading to base64 string might crash browser
    if (item.file.size > SAFE_INLINE_LIMIT && activeTab === MediaType.VIDEO) {
        // Just create object URL for preview and progressive analysis
        updateQueueItem(item.id, {
            status: 'ready',
            progress: 100,
            previewUrl: URL.createObjectURL(item.file),
            base64: '' // Don't load large video to base64
        });
        return;
    }

    const reader = new FileReader();
    
    reader.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        updateQueueItem(item.id, { progress: percent });
      }
    };

    reader.onload = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(',')[1];
      
      updateQueueItem(item.id, {
        status: 'ready',
        progress: 100,
        base64: base64Content,
        previewUrl: URL.createObjectURL(item.file)
      });
    };

    reader.onerror = () => {
      updateQueueItem(item.id, { status: 'error', error: 'Read failed', progress: 0 });
      addToast(`Failed to read file: ${item.file.name}`, 'error');
    };

    reader.readAsDataURL(item.file);
  };

  const handleFiles = (files: File[]) => {
    if (!files.length) return;
    
    if (activeTab === MediaType.TEXT) {
        addToast("File upload not available for text mode. Paste text instead.", 'error');
        return;
    }

    const config = FILE_CONFIG[activeTab];
    const validFiles: File[] = [];
    let rejectedCount = 0;
    let errorDetails = '';

    files.forEach(file => {
        let isValid = true;
        const inferredMime = getMimeType(file);
        
        if (file.size > MAX_FILE_SIZE) {
            isValid = false;
            if (!errorDetails) errorDetails = 'File size > 100MB';
        }

        if (isValid && !config.mime.includes(inferredMime)) {
             // Second check: sometimes mapped type is slightly different (e.g. audio/x-m4a vs audio/mp4)
             // If the file.type itself is valid but getMimeType returned something else, double check file.type
             if (file.type && config.mime.includes(file.type)) {
                 // It's valid per browser type
             } else {
                 isValid = false;
                 if (!errorDetails) errorDetails = 'Invalid format';
             }
        }

        if (isValid) {
            validFiles.push(file);
        } else {
            rejectedCount++;
        }
    });

    if (rejectedCount > 0) {
        addToast(`${rejectedCount} file(s) ignored: ${errorDetails || 'Incompatible'}`, 'error');
    }

    if (validFiles.length === 0) return;

    const newItems: QueueItem[] = validFiles.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'uploading',
      progress: 0,
      mimeType: getMimeType(f) // Use robust detection
    }));

    setQueue(prev => {
      const updated = [...prev, ...newItems];
      if (!activeFileId && newItems.length > 0) {
        setActiveFileId(newItems[0].id);
      }
      return updated;
    });
    
    newItems.forEach(item => processFile(item));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    handleFiles(files as File[]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeTab !== MediaType.TEXT) {
        setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles as File[]);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData?.items) {
        const files: File[] = [];
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }

        if (files.length > 0) {
          e.preventDefault();
          handleFiles(files);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  const removeFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setQueue(prev => {
      const filtered = prev.filter(item => item.id !== id);
      if (activeFileId === id) {
        setActiveFileId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  const handleClearQueue = () => {
    if (isAnalyzing) return;
    setQueue([]);
    setActiveFileId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    addToast('Queue cleared', 'info');
  };

  // --- Progressive Video Analysis Logic ---
  const handleProgressiveVideoAnalysis = async (item: QueueItem) => {
      if (!item.previewUrl) return;

      // Setup hidden video element to seek and capture frames
      const video = document.createElement('video');
      video.src = item.previewUrl;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      await new Promise((resolve) => {
          video.onloadedmetadata = resolve;
          video.load();
      });

      const duration = video.duration || 1;
      const interval = Math.max(1, advancedConfig.sampleInterval); // Ensure interval at least 1s
      const timestamps: number[] = [];
      for(let t = 0; t < duration; t += interval) {
          timestamps.push(t);
      }
      // Ensure at least one frame if short video
      if (timestamps.length === 0) timestamps.push(0);

      const totalSegments = timestamps.length;
      updateQueueItem(item.id, { totalSegments, segmentsProcessed: 0, status: 'analyzing' });

      // Canvas for drawing frames
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      let aggregatedProb = 0;
      let aggregatedConf = 0;
      let allKeyFeatures: KeyFeature[] = [];
      let lastResult: AnalysisResult | null = null;

      // Helper to capture frame
      const captureFrame = async (time: number): Promise<string> => {
          return new Promise((resolve) => {
              const onSeeked = () => {
                  video.removeEventListener('seeked', onSeeked);
                  if (ctx) {
                      canvas.width = video.videoWidth;
                      canvas.height = video.videoHeight;
                      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
                  } else {
                      resolve('');
                  }
              };
              video.currentTime = time;
              video.addEventListener('seeked', onSeeked);
          });
      };

      try {
          for (let i = 0; i < totalSegments; i++) {
              const time = timestamps[i];
              const base64Frame = await captureFrame(time);
              
              if (!base64Frame) continue;

              // Analyze frame as an Image
              const frameResult = await detectAIContent(
                  MediaType.IMAGE,
                  base64Frame,
                  'image/jpeg',
                  { preset: analysisPreset, focus: analysisFocus, advanced: advancedConfig }
              );

              // Update Running Aggregates
              aggregatedProb += frameResult.probabilityAI;
              aggregatedConf += frameResult.confidence;
              allKeyFeatures = [...allKeyFeatures, ...frameResult.keyFeatures];
              lastResult = frameResult;

              const count = i + 1;
              const currentAvgProb = Math.round(aggregatedProb / count);
              const currentAvgConf = Math.round(aggregatedConf / count);

              // Deduplicate features by name and take highest impact
              const uniqueFeatures = Array.from(new Map(allKeyFeatures.map(f => [f.feature, f])).values())
                                     .sort((a, b) => b.impactScore - a.impactScore)
                                     .slice(0, 6);

              const progressiveResult: AnalysisResult = {
                  probabilityAI: currentAvgProb,
                  confidence: currentAvgConf,
                  label: currentAvgProb > 50 ? 'Likely AI' : 'Likely Human',
                  reasoning: `Progressive analysis in progress (${count}/${totalSegments} segments). Latest frame finding: ${frameResult.reasoning.substring(0, 100)}...`,
                  keyFeatures: uniqueFeatures
              };

              // Update UI with intermediate result
              setResult(progressiveResult);
              updateQueueItem(item.id, { 
                  segmentsProcessed: count, 
                  result: progressiveResult
              });
          }

          // Finalize
          if (lastResult) {
              const count = totalSegments;
              const finalProb = Math.round(aggregatedProb / count);
              const finalConf = Math.round(aggregatedConf / count);
              
              const uniqueFeatures = Array.from(new Map(allKeyFeatures.map(f => [f.feature, f])).values())
                                     .sort((a, b) => b.impactScore - a.impactScore)
                                     .slice(0, 6);

              const finalResult: AnalysisResult = {
                  probabilityAI: finalProb,
                  confidence: finalConf,
                  label: finalProb > 50 ? 'Likely AI' : (finalProb > 30 ? 'Mixed/Uncertain' : 'Likely Human'),
                  reasoning: `Comprehensive progressive analysis of ${totalSegments} video segments completed. The aggregate probability suggests ${finalProb > 50 ? 'artificial generation' : 'human origin'}. Key artifacts detected across frames have been summarized.`,
                  keyFeatures: uniqueFeatures
              };
              
              setResult(finalResult);
              updateQueueItem(item.id, { 
                  status: 'done', 
                  result: finalResult,
                  segmentsProcessed: totalSegments
              });
              saveToHistory(finalResult, MediaType.VIDEO, item.file.name, undefined, item.mimeType, item.file.name);
              addToast('Progressive analysis complete', 'success');
          }

      } catch (e: any) {
          const errMsg = e.message || 'Progressive analysis failed';
          updateQueueItem(item.id, { status: 'error', error: errMsg });
          addToast(errMsg, 'error');
      } finally {
          // Cleanup
          video.removeAttribute('src'); 
      }
  };

  const handleAnalyze = async () => {
    if (!activeItem) {
      if (activeTab === MediaType.TEXT && textInput) {
        handleTextAnalyze();
        return;
      }
      return;
    }

    // Check for Progressive Video Mode
    if (activeTab === MediaType.VIDEO && (advancedConfig.progressiveAnalysis || activeItem.file.size > SAFE_INLINE_LIMIT)) {
        handleProgressiveVideoAnalysis(activeItem);
        return;
    }

    updateQueueItem(activeItem.id, { status: 'analyzing' });
    
    try {
      const content = activeItem.base64!;
      const mimeType = activeItem.mimeType;
      
      const analysis = await detectAIContent(
        activeTab, 
        content, 
        mimeType,
        { preset: analysisPreset, focus: analysisFocus, advanced: advancedConfig }
      );
      
      updateQueueItem(activeItem.id, { 
        status: 'done', 
        result: analysis 
      });
      saveToHistory(analysis, activeTab, activeItem.file.name, content, mimeType, activeItem.file.name);
      addToast('Analysis complete', 'success');

    } catch (err: any) {
      const errMsg = err.message || "Analysis failed";
      updateQueueItem(activeItem.id, { 
        status: 'error', 
        error: errMsg
      });
      addToast(errMsg, 'error');
    }
  };

  const handleBatchAnalyze = async () => {
    if (activeTab === MediaType.TEXT) return;
    const itemsToProcess = queue.filter(item => item.status === 'ready' || item.status === 'error');
    if (itemsToProcess.length === 0) return;

    setQueue(prev => prev.map(item => {
        if (item.status === 'ready' || item.status === 'error') {
            return { ...item, status: 'analyzing', error: undefined };
        }
        return item;
    }));

    addToast(`Starting batch analysis for ${itemsToProcess.length} items`, 'info');

    await Promise.allSettled(itemsToProcess.map(async (item) => {
        try {
             // For batch, simple logic: if video is huge, skip or force progressive. 
             // To simplify batch, we'll force progressive if enabled globally OR file huge
             if (activeTab === MediaType.VIDEO && (advancedConfig.progressiveAnalysis || item.file.size > SAFE_INLINE_LIMIT)) {
                 // Note: handleProgressiveVideoAnalysis updates queue state internally
                 await handleProgressiveVideoAnalysis(item);
             } else {
                 const analysis = await detectAIContent(
                    activeTab, 
                    item.base64!, 
                    item.mimeType,
                    { preset: analysisPreset, focus: analysisFocus, advanced: advancedConfig }
                 );
                 
                 setQueue(prev => prev.map(current => 
                     current.id === item.id 
                        ? { ...current, status: 'done', result: analysis } 
                        : current
                 ));
                 
                 saveToHistory(analysis, activeTab, item.file.name, item.base64, item.mimeType, item.file.name);
             }
        } catch (err: any) {
             setQueue(prev => prev.map(current => 
                 current.id === item.id 
                    ? { ...current, status: 'error', error: err.message || "Analysis failed" } 
                    : current
             ));
        }
    }));
    addToast('Batch analysis complete', 'success');
  };

  const handleTextAnalyze = async () => {
    setIsAnalyzingText(true);
    setResult(null); 
    try {
        if (!textInput.trim()) throw new Error("Please enter text.");
        const analysis = await detectAIContent(
            MediaType.TEXT, 
            textInput,
            undefined, 
            { preset: analysisPreset, focus: analysisFocus, advanced: advancedConfig }
        );
        setResult(analysis);
        saveToHistory(analysis, MediaType.TEXT, textInput.substring(0, 40) + '...', textInput);
        addToast('Text analysis complete', 'success');
    } catch (err: any) {
        addToast(err.message, 'error');
    } finally {
        setIsAnalyzingText(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          if (textInput.trim() && !isAnalyzing) {
              handleTextAnalyze();
          }
      }
  };

  useEffect(() => {
    if (activeTab !== MediaType.TEXT) {
        if (activeItem) {
            setResult(activeItem.result || null);
        } else {
            setResult(null);
        }
    }
  }, [activeItem, activeTab]);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-inter transition-colors duration-300 flex flex-col">
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      
      {/* Container wrapper with responsive padding */}
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8 p-4 lg:p-8 w-full print:p-0 print:space-y-4 print:max-w-none">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 md:pb-6 border-b border-slate-300 dark:border-slate-800 print:hidden">
          <div className="flex items-center gap-3.5 w-full md:w-auto">
            <div className="w-10 h-10 md:w-11 md:h-11 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/10 shrink-0">
              <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 via-indigo-600 to-slate-600 dark:from-white dark:via-indigo-100 dark:to-slate-400 tracking-tight">
                Veritas
              </h1>
              <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 font-medium hidden sm:block">Deterministic Multimodal Content Analysis</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
            <span className="text-slate-600 dark:text-slate-500 text-xs font-medium mr-auto md:mr-0 md:hidden lg:block">
              Powered by Gemini 3 Pro
            </span>
            
            <div className="flex items-center gap-2">
                <button 
                onClick={() => setIsAboutOpen(true)}
                className="p-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                aria-label="About & Changelog"
                >
                <Info className="w-4 h-4" />
                </button>

                <button 
                onClick={cycleTheme}
                className="p-2.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-all border border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                aria-label="Toggle theme"
                title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
                >
                {theme === 'dark' ? <Moon className="w-4 h-4" /> : theme === 'light' ? <Sun className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                </button>

                <button 
                onClick={() => setIsHistoryOpen(true)}
                className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white px-3 py-2 md:px-4 md:py-2.5 rounded-lg text-sm font-medium transition-all border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 shadow-sm"
                >
                <HistoryIcon className="w-4 h-4" />
                <span className="hidden sm:inline">History</span>
                </button>
            </div>
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 print:block">
          
          {/* Left Column: Input Panel */}
          <div className="lg:col-span-7 space-y-4 md:space-y-5 print:hidden">
            
            {/* Tabs */}
            <div className="bg-white dark:bg-slate-900 p-1.5 rounded-xl flex gap-1 border border-slate-300 dark:border-slate-800 shadow-sm overflow-x-auto">
              {[
                { type: MediaType.TEXT, icon: FileType, label: 'Text' },
                { type: MediaType.IMAGE, icon: ImageIcon, label: 'Image' },
                { type: MediaType.AUDIO, icon: Mic, label: 'Audio' },
                { type: MediaType.VIDEO, icon: Video, label: 'Video' }
              ].map((tab) => (
                <button
                  key={tab.type}
                  onClick={() => handleTabChange(tab.type)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 min-w-[80px] ${
                    activeTab === tab.type 
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-300 dark:ring-slate-700/50' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Config Dropdown */}
            <div className="relative z-10">
              <button 
                onClick={() => setIsConfigOpen(!isConfigOpen)}
                className="w-full flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800/50"
              >
                 <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    <span>Analysis Configuration</span>
                    {isModified && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-full normal-case">Modified</span>}
                 </div>
                 {isConfigOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isConfigOpen ? 'max-h-[2000px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}>
                 <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4 md:p-6 shadow-lg shadow-slate-200/50 dark:shadow-none relative flex flex-col">
                    
                    <div className="flex justify-end mb-2">
                        <button 
                            onClick={handleResetConfig}
                            className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center gap-1 transition-colors bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700"
                            title="Reset configuration to defaults"
                        >
                            <RotateCcw className="w-3 h-3" />
                            <span className="hidden sm:inline">Reset Defaults</span>
                            <span className="sm:hidden">Reset</span>
                        </button>
                    </div>

                    {/* Pro Tip - GPU */}
                    <div className="mb-6 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg p-3 flex items-start gap-3">
                         <div className="p-1.5 bg-blue-100 dark:bg-blue-800/50 rounded-full text-blue-600 dark:text-blue-400 shrink-0">
                             <Zap className="w-3.5 h-3.5" />
                         </div>
                         <div>
                             <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-0.5">Pro Tip: Hardware Acceleration</p>
                             <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
                                 Processing large audio/video files (encoding & decoding) is significantly faster on systems with GPU acceleration enabled in browser settings.
                             </p>
                         </div>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
                        {/* Presets */}
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider pt-1">
                                <span>Sensitivity Mode</span>
                                <InfoTooltip content="Adjusts the strictness of the AI model. Balanced is recommended for most cases. Sensitive aims to catch every possible fake. Conservative avoids flagging unless certain." />
                            </div>
                            <div className="flex flex-col gap-3">
                                {[
                                    { 
                                        id: 'balanced', 
                                        label: 'Balanced', 
                                        icon: Sliders,
                                        desc: 'Standard threshold. Weighs evidence equally.' 
                                    },
                                    { 
                                        id: 'sensitive', 
                                        label: 'Sensitive', 
                                        icon: Activity,
                                        desc: 'Aggressive detection. Flags minor anomalies.' 
                                    },
                                    { 
                                        id: 'conservative', 
                                        label: 'Conservative', 
                                        icon: Shield,
                                        desc: 'High burden of proof. Assumes human origin.' 
                                    }
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => handlePresetChange(item.id as AnalysisPreset)}
                                        className={`relative flex items-start gap-3 p-3 md:p-4 rounded-xl text-left transition-all border ${
                                            analysisPreset === item.id 
                                                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-500 ring-1 ring-indigo-500/30' 
                                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        <div className={`p-2 rounded-lg shrink-0 ${analysisPreset === item.id ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                            <item.icon className="w-4 h-4 md:w-5 md:h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-center mb-0.5">
                                                <span className={`text-sm font-bold truncate ${analysisPreset === item.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-slate-700 dark:text-slate-200'}`}>{item.label}</span>
                                                {analysisPreset === item.id && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 ml-2" />}
                                            </div>
                                            <p className={`text-xs leading-relaxed line-clamp-2 ${analysisPreset === item.id ? 'text-indigo-700/80 dark:text-indigo-300/70' : 'text-slate-500'}`}>
                                                {item.desc}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="hidden lg:block w-px bg-slate-300 dark:bg-slate-800 self-stretch my-2"></div>
                        <div className="lg:hidden h-px bg-slate-300 dark:bg-slate-800 w-full my-2"></div>

                        {/* Focus Area */}
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider pt-1">
                                <span>Focus Area</span>
                                <InfoTooltip content="Directs the analysis engine to look for specific artifacts relevant to the content type, improving accuracy." />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { id: 'general', label: 'General', icon: Layout },
                                    { id: 'people', label: 'People', icon: ScanFace },
                                    { id: 'documents', label: 'Documents', icon: FileText },
                                    { id: 'art', label: 'Art', icon: PenTool }
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setAnalysisFocus(item.id as AnalysisFocus)}
                                        className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl text-xs font-semibold border transition-all h-24 md:h-28 ${
                                            analysisFocus === item.id 
                                                ? 'bg-slate-100 dark:bg-slate-800 border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30' 
                                                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        <div className={`p-2 rounded-full ${analysisFocus === item.id ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                           <item.icon className={`w-4 h-4 md:w-5 md:h-5 ${analysisFocus === item.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`} />
                                        </div>
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Advanced Section Divider */}
                    <div className="h-px bg-slate-200 dark:bg-slate-800 w-full my-6"></div>

                    {/* Advanced Analysis Parameters */}
                    <div>
                        <button 
                            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                            <span>Advanced Analysis Parameters</span>
                            {isAdvancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        
                        <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAdvancedOpen ? 'max-h-[1200px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800/50">
                                
                                {/* Temperature Slider */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Temperature (Randomness)</label>
                                        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">{advancedConfig.temperature}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.05"
                                        value={advancedConfig.temperature}
                                        onChange={(e) => setAdvancedConfig({...advancedConfig, temperature: parseFloat(e.target.value)})}
                                        className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <p className="text-[10px] text-slate-500">Lower values (0.1) are more deterministic. Higher values (0.8) are more creative.</p>
                                </div>

                                {/* Top P Slider */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Top P (Nucleus Sampling)</label>
                                        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">{advancedConfig.topP}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="1" 
                                        step="0.05"
                                        value={advancedConfig.topP}
                                        onChange={(e) => setAdvancedConfig({...advancedConfig, topP: parseFloat(e.target.value)})}
                                        className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <p className="text-[10px] text-slate-500">Controls diversity. Lower values restrict token selection to most likely options.</p>
                                </div>

                                {/* Top K Slider */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Top K</label>
                                        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">{advancedConfig.topK}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="1" 
                                        max="40" 
                                        step="1"
                                        value={advancedConfig.topK}
                                        onChange={(e) => setAdvancedConfig({...advancedConfig, topK: parseInt(e.target.value)})}
                                        className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <p className="text-[10px] text-slate-500">Limits prediction to the top K most likely next tokens.</p>
                                </div>

                                {/* Reasoning Depth */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Reasoning Detail</label>
                                    </div>
                                    <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                                        {['concise', 'standard', 'exhaustive'].map((depth) => (
                                            <button
                                                key={depth}
                                                onClick={() => setAdvancedConfig({...advancedConfig, reasoningDepth: depth as any})}
                                                className={`flex-1 text-[10px] font-medium py-1.5 rounded-md capitalize transition-all ${
                                                    advancedConfig.reasoningDepth === depth
                                                        ? 'bg-indigo-100 dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                            >
                                                {depth}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-slate-500">Controls the verbosity and depth of the generated forensic report.</p>
                                </div>

                                {/* Progressive Video Analysis (Conditional) */}
                                {activeTab === MediaType.VIDEO && (
                                    <>
                                        <div className="md:col-span-2 h-px bg-slate-200 dark:bg-slate-800 my-2" />
                                        <div className="md:col-span-2 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <FastForward className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Progressive Video Analysis</label>
                                                </div>
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={advancedConfig.progressiveAnalysis}
                                                        onChange={(e) => setAdvancedConfig({...advancedConfig, progressiveAnalysis: e.target.checked})}
                                                        className="sr-only peer"
                                                    />
                                                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                                                </label>
                                            </div>
                                            <p className="text-[10px] text-slate-500">Analyzes video in segments by extracting frames over time. Required for videos &gt; 18MB. Provides intermediate results.</p>
                                            
                                            {advancedConfig.progressiveAnalysis && (
                                                <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                     <div className="flex justify-between items-center">
                                                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Sample Interval (Seconds)</label>
                                                        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">{advancedConfig.sampleInterval}s</span>
                                                    </div>
                                                    <input 
                                                        type="range" 
                                                        min="1" 
                                                        max="60" 
                                                        step="1"
                                                        value={advancedConfig.sampleInterval}
                                                        onChange={(e) => setAdvancedConfig({...advancedConfig, sampleInterval: parseInt(e.target.value)})}
                                                        className="w-full h-1.5 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                    />
                                                    <p className="text-[10px] text-slate-500">How often to capture a frame for analysis. Shorter intervals increase accuracy but take longer.</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                 </div>
              </div>
            </div>

            {/* Input Area */}
            <div 
                className={`bg-white dark:bg-slate-900 border transition-all duration-300 rounded-2xl p-4 md:p-6 shadow-xl shadow-slate-200/40 dark:shadow-none flex flex-col relative overflow-hidden min-h-[350px] lg:min-h-[500px] ${
                    isDragging 
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-slate-50 dark:bg-slate-900/80 scale-[1.01]' 
                        : 'border-slate-300 dark:border-slate-800'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
              
              {/* Drag Overlay */}
              {isDragging && (
                  <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-indigo-500 rounded-2xl m-2 animate-in fade-in duration-200">
                      <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mb-4 animate-bounce">
                          <Upload className="w-8 h-8 md:w-10 md:h-10 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Drop files here</h3>
                      <p className="text-indigo-600 dark:text-indigo-300/80 text-sm mt-2">Add to {activeTab.toLowerCase()} analysis queue</p>
                  </div>
              )}

              {activeTab === MediaType.TEXT ? (
                // TEXT MODE UI
                <div className="flex-1 flex flex-col relative">
                    <textarea
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Paste the text you want to analyze here..."
                        className="w-full flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700/50 rounded-xl p-4 md:p-5 text-slate-900 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none font-mono text-sm leading-relaxed transition-all"
                    />
                    <div className="absolute bottom-4 right-4 text-xs text-slate-400 pointer-events-none hidden sm:block">
                        {textInput.length > 0 && `${textInput.length} chars • Ctrl + Enter to analyze`}
                    </div>
                </div>
              ) : (
                // MEDIA MODE UI
                <div className="flex-1 flex flex-col gap-4 md:gap-5">
                  
                  {/* Hidden Input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    multiple // Allow multiple files
                    accept={FILE_CONFIG[activeTab]?.mime.join(',')}
                    onChange={handleFileChange}
                  />

                  {/* Drop Zone / Add Button */}
                  {queue.length === 0 ? (
                    // Empty State Drop Zone
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all gap-4 md:gap-5 group"
                    >
                        <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner ring-1 ring-black/5 dark:ring-white/5">
                          <Upload className="w-8 h-8 md:w-9 md:h-9 text-slate-400 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <div className="text-center px-4">
                          <p className="text-slate-700 dark:text-slate-200 font-semibold text-base md:text-lg">Click to upload {activeTab.toLowerCase()}s</p>
                          <p className="text-slate-500 text-sm mt-1.5">Drag, drop, or paste from clipboard</p>
                          <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Supported formats: {FILE_CONFIG[activeTab]?.label}</p>
                          <p className="text-slate-500 dark:text-slate-600 text-xs mt-3 bg-slate-100 dark:bg-slate-800/50 inline-block px-3 py-1 rounded-full">Max 100MB per file</p>
                        </div>
                    </div>
                  ) : (
                    // Queue Mode
                    <div className="flex flex-col h-full gap-4 md:gap-5">
                        
                        {/* Queue List */}
                        <div className="flex gap-3 overflow-x-auto pb-3 min-h-[110px] scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent snap-x snap-mandatory">
                            {/* Add Button */}
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-shrink-0 w-24 md:w-28 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-indigo-600 dark:hover:text-white hover:border-indigo-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all gap-2 snap-start"
                            >
                                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                   <Plus className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-medium">Add File</span>
                            </button>

                            {/* Items */}
                            {queue.map(item => (
                                <div 
                                    key={item.id}
                                    onClick={() => setActiveFileId(item.id)}
                                    className={`relative flex-shrink-0 w-60 md:w-64 bg-white dark:bg-slate-800 rounded-xl border p-3 md:p-3.5 cursor-pointer transition-all group snap-start ${
                                        activeFileId === item.id 
                                            ? 'border-indigo-500 ring-1 ring-indigo-500/50 bg-white dark:bg-slate-800' 
                                            : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-9 h-9 bg-slate-100 dark:bg-slate-900 rounded-lg flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-800">
                                            {activeTab === MediaType.IMAGE ? <ImageIcon className="w-4 h-4 text-slate-500 dark:text-slate-400"/> : 
                                             activeTab === MediaType.AUDIO ? <Mic className="w-4 h-4 text-slate-500 dark:text-slate-400"/> : 
                                             <Video className="w-4 h-4 text-slate-500 dark:text-slate-400"/>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{item.file.name}</p>
                                            <p className="text-[10px] text-slate-500">{(item.file.size / 1024 / 1024).toFixed(1)} MB</p>
                                        </div>
                                        <button 
                                            onClick={(e) => removeFile(item.id, e)}
                                            className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Progress Bar / Status */}
                                    <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden ring-1 ring-black/5 dark:ring-white/5 relative">
                                        {item.status === 'uploading' ? (
                                            <div 
                                                className="h-full bg-indigo-500 transition-all duration-300"
                                                style={{ width: `${item.progress}%` }}
                                            />
                                        ) : item.status === 'analyzing' ? (
                                             item.totalSegments ? (
                                                 // Progressive Bar
                                                <div 
                                                    className="h-full bg-indigo-500 transition-all duration-300"
                                                    style={{ width: `${((item.segmentsProcessed || 0) / item.totalSegments) * 100}%` }}
                                                />
                                             ) : (
                                                 <div className="h-full w-full bg-indigo-500 animate-pulse" />
                                             )
                                        ) : item.status === 'error' ? (
                                            <div className="h-full bg-red-500 w-full" />
                                        ) : (
                                            <div className="h-full w-full bg-green-500" />
                                        )}
                                    </div>
                                    
                                    {/* Status Text */}
                                    <div className="flex justify-between items-center mt-2">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                                            item.status === 'error' ? 'text-red-500 dark:text-red-400' : 
                                            item.status === 'done' ? 'text-green-600 dark:text-green-400' :
                                            item.status === 'analyzing' ? 'text-indigo-600 dark:text-indigo-400' :
                                            'text-slate-500'
                                        }`}>
                                            {item.status === 'uploading' ? `UPLOADING ${item.progress}%` :
                                             item.status === 'error' ? 'FAILED' :
                                             item.status === 'analyzing' ? (item.totalSegments ? `SEGMENT ${item.segmentsProcessed}/${item.totalSegments}` : 'ANALYZING...') :
                                             item.status === 'done' ? 'COMPLETED' : 'READY'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Active Item Preview */}
                        <div className="flex-1 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center p-4 md:p-6 overflow-hidden relative min-h-[300px]">
                            {activeItem ? (
                                activeItem.status === 'uploading' ? (
                                    <div className="flex flex-col items-center animate-pulse">
                                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
                                        <p className="text-slate-500 dark:text-slate-400 font-medium">Processing file...</p>
                                    </div>
                                ) : activeItem.status === 'error' ? (
                                    <div className="flex flex-col items-center text-red-500 dark:text-red-400">
                                        <AlertTriangle className="w-10 h-10 mb-2" />
                                        <p className="font-medium">{activeItem.error}</p>
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-300 relative group">
                                        {activeItem.previewUrl ? (
                                            <>
                                                {activeTab === MediaType.IMAGE && (
                                                    activeItem.mimeType === 'application/pdf' ? (
                                                        <div className="w-full h-full border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white" key={activeItem.id}>
                                                             <PdfPreview url={activeItem.previewUrl} />
                                                        </div>
                                                    ) : (
                                                        <div className="relative w-full h-full flex items-center justify-center" key={activeItem.id}>
                                                            <img 
                                                                src={activeItem.previewUrl} 
                                                                alt="Preview" 
                                                                className="max-h-[300px] max-w-full rounded-lg shadow-2xl object-contain" 
                                                            />
                                                             <button 
                                                                onClick={(e) => { e.stopPropagation(); setIsSourceOpen(true); }}
                                                                className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 z-10 cursor-pointer"
                                                              >
                                                                  <div className="bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-white p-3 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                                                      <Maximize2 className="w-6 h-6" />
                                                                  </div>
                                                              </button>
                                                        </div>
                                                    )
                                                )}
                                                {activeTab === MediaType.VIDEO && (
                                                    <video 
                                                        src={activeItem.previewUrl} 
                                                        controls 
                                                        className="max-h-full max-w-full rounded-lg shadow-2xl" 
                                                        key={activeItem.id}
                                                    />
                                                )}
                                                {activeTab === MediaType.AUDIO && (
                                                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl flex flex-col items-center justify-center gap-5 border border-slate-200 dark:border-slate-800 shadow-2xl shadow-slate-200/50 dark:shadow-none" key={activeItem.id}>
                                                        <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-500/10 rounded-full flex items-center justify-center ring-1 ring-indigo-500/20">
                                                            <Mic className="w-8 h-8 md:w-10 md:h-10 text-indigo-600 dark:text-indigo-400" />
                                                        </div>
                                                        <div className="text-center w-full">
                                                            <p className="text-lg font-semibold text-slate-900 dark:text-white break-all line-clamp-2">{activeItem.file.name}</p>
                                                            <p className="text-slate-500 text-sm mt-1">{(activeItem.file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                        </div>
                                                        <audio src={activeItem.previewUrl} controls className="w-full mt-2" />
                                                        
                                                        {/* Waveform Visualization */}
                                                        <div className="flex items-center justify-center gap-1 h-12 w-full px-4" aria-hidden="true">
                                                            {audioWaveform.map((height, i) => (
                                                                <div 
                                                                    key={i} 
                                                                    className="flex-1 max-w-[6px] bg-indigo-500/40 rounded-full"
                                                                    style={{ height: `${height}%` }}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 text-center p-4">
                                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                                    <FileText className="w-8 h-8 opacity-50" />
                                                </div>
                                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Preview Unavailable</p>
                                                <p className="text-xs">This file is too large to display directly from history.</p>
                                            </div>
                                        )}
                                    </div>
                                )
                            ) : (
                                <div className="text-slate-400 dark:text-slate-500 text-sm font-medium flex flex-col items-center gap-2">
                                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center opacity-50">
                                    <FileType className="w-6 h-6" />
                                  </div>
                                  Select a file from the queue to preview
                                </div>
                            )}
                        </div>
                    </div>
                  )}

                </div>
              )}

              {/* Action Bar */}
              <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                 <div className="flex-1 w-full sm:w-auto text-center sm:text-left">
                     {activeTab !== MediaType.TEXT && queue.length > 0 && (
                        <div className="flex items-center justify-center sm:justify-start gap-2 text-xs text-slate-500 font-medium px-1">
                           <div className="w-2 h-2 rounded-full bg-green-500"></div>
                           {queue.filter(i => i.status === 'done').length} analyzed
                           <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 ml-2"></div>
                           {queue.length} total
                        </div>
                     )}
                 </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    {queue.length > 0 && (
                        <button
                            onClick={handleClearQueue}
                            disabled={isAnalyzing}
                            className="bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3.5 rounded-xl font-medium border border-slate-300 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-900/50 transition-all flex items-center justify-center gap-2 text-sm order-2 sm:order-1"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Clear Queue</span>
                            <span className="sm:hidden">Clear</span>
                        </button>
                    )}

                    {queue.length > 1 && (
                        <button
                            onClick={handleBatchAnalyze}
                            disabled={queue.filter(i => i.status === 'ready' || i.status === 'error').length === 0 || queue.some(i => i.status === 'analyzing')}
                            className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-white px-5 py-3.5 rounded-xl font-medium border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-2 text-sm order-3 sm:order-2"
                        >
                            <Layers className="w-4 h-4" />
                            Batch Analyze ({queue.filter(i => i.status === 'ready' || i.status === 'error').length})
                        </button>
                    )}
                    <button
                      onClick={activeTab === MediaType.TEXT ? handleTextAnalyze : handleAnalyze}
                      disabled={
                        activeTab === MediaType.TEXT 
                            ? (!textInput || isAnalyzing) 
                            : (!activeItem || activeItem.status === 'uploading' || activeItem.status === 'analyzing')
                      }
                      className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-2.5 text-sm order-1 sm:order-3"
                    >
                      {isAnalyzing || (activeItem?.status === 'analyzing') ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          {activeItem?.totalSegments ? `Analyzing Segment ${activeItem.segmentsProcessed! + 1}/${activeItem.totalSegments}` : 'Running Analysis...'}
                        </>
                      ) : (
                        <>Analyze {activeTab === MediaType.TEXT ? 'Text' : 'Selected File'}</>
                      )}
                    </button>
                </div>
              </div>

            </div>
          </div>

          {/* Right Column: Results Panel */}
          <div className="lg:col-span-5 space-y-6 print:w-full print:col-span-12 print:absolute print:top-0 print:left-0 print:m-0 print:p-0 print:static">
            
            {result ? (
              <div className="space-y-6 animate-in slide-in-from-right-4 fade-in duration-500">
                {/* Progressive Status Bar */}
                {activeItem?.totalSegments && activeItem?.status === 'analyzing' && (
                    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4 shadow-sm flex items-center justify-between animate-pulse">
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Progressive Analysis Active</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Processing segment {activeItem.segmentsProcessed! + 1} of {activeItem.totalSegments}...</p>
                            </div>
                        </div>
                        <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded">
                            {Math.round((activeItem.segmentsProcessed! / activeItem.totalSegments) * 100)}%
                        </div>
                    </div>
                )}

                {/* Score Cards */}
                <AnalysisChart result={result} />

                {/* Details Card */}
                <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl shadow-slate-200/40 dark:shadow-none print:shadow-none print:border-none">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100 dark:border-slate-800/50">
                    <div className="flex items-center gap-2.5">
                       <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                       <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                           {activeItem?.totalSegments && activeItem?.status !== 'done' ? 'Intermediate Forensic Report' : 'Forensic Report'}
                       </h3>
                    </div>
                    
                    {/* Export Dropdown */}
                    <div className="relative print:hidden flex items-center gap-2">
                       {/* Copy Button */}
                       <button
                         onClick={handleCopyReasoning}
                         className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg border border-transparent hover:border-indigo-100 dark:hover:border-indigo-500/30"
                         title="Copy Reasoning"
                       >
                          {isCopying ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                       </button>

                       {/* Share Button */}
                       <div className="relative">
                           <button
                             onClick={handleShare}
                             className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg border border-transparent hover:border-indigo-100 dark:hover:border-indigo-500/30"
                             title="Share Link"
                           >
                              <LinkIcon className="w-4 h-4" />
                           </button>
                           {isShareOpen && (
                               <>
                                <div className="fixed inset-0 z-10" onClick={() => setIsShareOpen(false)} />
                                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-4 animate-in fade-in zoom-in-95 duration-200">
                                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase text-slate-500">
                                        <ExternalLink className="w-3 h-3" />
                                        Share Analysis
                                    </div>
                                    <div className="flex gap-2 mb-2">
                                        <input 
                                            readOnly 
                                            value={shareUrl} 
                                            className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300 truncate"
                                        />
                                        <button 
                                            onClick={copyShareUrl}
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                        >
                                            Copy
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-slate-400">Media files are not included in shared links due to size limits.</p>
                                </div>
                                </>
                           )}
                       </div>

                       <button
                          onClick={() => setIsExportOpen(!isExportOpen)}
                          className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg border border-transparent hover:border-indigo-100 dark:hover:border-indigo-500/30"
                          title="Export Results"
                       >
                          <Download className="w-4 h-4" />
                       </button>

                       {isExportOpen && (
                          <>
                             <div className="fixed inset-0 z-10" onClick={() => setIsExportOpen(false)} />
                             <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <button 
                                   onClick={handleDownloadJSON}
                                   className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                                >
                                   <FileJson className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                   <span>Export as JSON</span>
                                </button>
                                <button 
                                   onClick={handlePrint}
                                   className="w-full flex items-center gap-2 px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left border-t border-slate-100 dark:border-slate-800"
                                >
                                   <Printer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                   <span>Print / Save as PDF</span>
                                </button>
                             </div>
                          </>
                       )}
                    </div>
                  </div>
                  
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Classification */}
                      <div className={`p-4 rounded-xl border transition-colors ${
                          result.label === 'Mixed/Uncertain' 
                            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30' 
                            : 'bg-slate-50 dark:bg-slate-950/50 border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
                      }`}>
                        <div className="flex items-center mb-1.5">
                          <p className={`text-[10px] uppercase tracking-widest font-bold ${
                              result.label === 'Mixed/Uncertain' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'
                          }`}>Verdict</p>
                          <InfoTooltip content="The final verdict categorizing the content based on the calculated AI probability." />
                        </div>
                        <div className="flex items-center gap-2">
                            <p className={`text-lg font-bold truncate ${
                              result.label === 'Likely AI' ? 'text-red-600 dark:text-red-400' : 
                              result.label === 'Likely Human' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'
                            }`}>
                              {result.label}
                            </p>
                            {result.label === 'Mixed/Uncertain' && (
                                <InfoTooltip content="Ambiguous Result: The analysis detected conflicting signals (both human and AI traits) or lacked strong evidence for either category. Manual review is recommended." />
                            )}
                        </div>
                      </div>
                      
                      {/* Confidence */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 transition-colors">
                        <div className="flex items-center mb-1.5">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Confidence</p>
                          <InfoTooltip content="The model's certainty level (0-100%) regarding this analysis. Higher confidence implies clearer evidence." />
                        </div>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-200">
                          {result.confidence}%
                        </p>
                      </div>
                    </div>

                     <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                        Detailed Reasoning
                        <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
                      </p>
                      <div className="text-slate-800 dark:text-slate-300 text-sm leading-relaxed prose prose-sm max-w-none prose-p:my-2 prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-strong:text-slate-900 dark:prose-strong:text-slate-100 bg-slate-50 dark:bg-slate-950/30 p-4 rounded-xl border border-slate-300 dark:border-slate-800/50">
                        <ReactMarkdown components={{
                            a: ({node, ...props}) => <a {...props} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 underline underline-offset-2" target="_blank" rel="noopener noreferrer" />
                        }}>
                          {result.reasoning}
                        </ReactMarkdown>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold Key Identifiers">Key Identifiers</p>
                        <InfoTooltip content="Distinctive characteristics identified during analysis. The percentage represents the 'Impact Score' — how strongly that specific feature influenced the final verdict." />
                      </div>
                      <ul className="space-y-3">
                        {result.keyFeatures.map((item, idx) => (
                          <li key={idx} className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3.5 border border-slate-300 dark:border-slate-800 group/item hover:border-indigo-500/30 hover:bg-white dark:hover:bg-slate-800/80 transition-all shadow-sm dark:shadow-none">
                            <div className="flex justify-between items-start gap-3 mb-2">
                              <span className="text-sm text-slate-700 dark:text-slate-200 font-medium group-hover/item:text-indigo-600 dark:group-hover/item:text-indigo-300 transition-colors leading-tight">{item.feature}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  item.impactScore > 70 ? 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/10' :
                                  item.impactScore > 40 ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/10' :
                                  'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600'
                                }`}>
                                  {item.impactScore}%
                                </span>
                              </div>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 mt-1 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-1000 ${
                                   item.impactScore > 70 ? 'bg-red-500' :
                                   item.impactScore > 40 ? 'bg-amber-500' :
                                   'bg-slate-400 dark:bg-slate-500'
                                }`} 
                                style={{ width: `${item.impactScore}%` }} 
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Empty State for Right Column
              <div className="h-full bg-slate-50 dark:bg-slate-900/30 border-2 border-slate-300 dark:border-slate-800 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 text-center min-h-[400px] hover:border-slate-400 dark:hover:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-all group print:hidden">
                <div className="w-20 h-20 md:w-24 md:h-24 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-xl shadow-slate-200/50 dark:shadow-none ring-1 ring-black/5 dark:ring-white/5">
                  <Activity className="w-8 h-8 md:w-10 md:h-10 text-slate-400 dark:text-slate-600 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Awaiting Analysis</h3>
                <p className="text-slate-500 max-w-xs leading-relaxed text-sm md:text-base">
                  {activeTab === MediaType.TEXT ? 'Enter text on the left panel to begin forensic analysis.' : 'Upload media or select a file from the queue to start detection.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* History Drawer */}
      <HistoryDrawer 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        history={history} 
        onSelect={restoreFromHistory}
        onClear={clearHistory}
      />

      {/* About Modal */}
      {isAboutOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 print:hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAboutOpen(false)} />
            <div className="relative bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Veritas</h2>
                        <p className="text-xs font-mono text-slate-500">v1.2.0</p>
                        </div>
                    </div>
                    <button onClick={() => setIsAboutOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Changelog</h3>
                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                        <div className="relative pl-4 border-l-2 border-indigo-500">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">v1.2.0 <span className="text-[10px] font-normal text-slate-500 ml-2">Current</span></p>
                            <ul className="mt-1 space-y-1.5">
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Added <span className="font-medium text-slate-700 dark:text-slate-300">Progressive Video Analysis</span> for handling large files ({'>'}18MB) via frame sampling.</li>
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Enhanced UI for <span className="font-medium text-slate-700 dark:text-slate-300">Mixed/Uncertain</span> results with dedicated styling and tooltips.</li>
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Improved accuracy of the configuration 'Modified' indicator.</li>
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• UI/UX polish and performance optimizations.</li>
                            </ul>
                        </div>
                        <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-800">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">v1.1.0</p>
                            <ul className="mt-1 space-y-1.5">
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Initial public release.</li>
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Multimodal support: Text, Image, Audio, Video.</li>
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Powered by Gemini 3 Pro model.</li>
                                <li className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">• Local history persistence and JSON export.</li>
                            </ul>
                        </div>
                        </div>
                    </div>
                    
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] text-slate-500 leading-relaxed text-center">
                        Veritas uses advanced LLMs to analyze patterns. Results are probabilistic estimates, not absolute facts. Always verify important content with multiple sources.
                        </p>
                    </div>
                </div>
            </div>
            </div>
        </div>
      )}

      {/* Image Lightbox Modal */}
      {isSourceOpen && activeItem?.previewUrl && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 print:hidden backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsSourceOpen(false)}>
            <div className="relative w-full h-full flex items-center justify-center">
                <img 
                    src={activeItem.previewUrl} 
                    alt="Full Source" 
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-in zoom-in-95 duration-300"
                    onClick={(e) => e.stopPropagation()} 
                />
                <button 
                    onClick={() => setIsSourceOpen(false)}
                    className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition-all backdrop-blur-md border border-white/10 pointer-events-auto"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>
        </div>
      )}

      {/* Chat Widget Overlay */}
      <div className="print:hidden">
        <ChatWidget />
      </div>
    </div>
  );
}

export default App;