
export enum MediaType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO'
}

export type AnalysisPreset = 'balanced' | 'sensitive' | 'conservative';
export type AnalysisFocus = 'general' | 'people' | 'documents' | 'art';

export interface AdvancedConfig {
  temperature: number; // 0.0 - 1.0
  topP: number;       // 0.0 - 1.0
  topK: number;       // 1 - 40
  reasoningDepth: 'concise' | 'standard' | 'exhaustive';
  progressiveAnalysis: boolean;
  sampleInterval: number; // Seconds
}

export interface KeyFeature {
  feature: string;
  impactScore: number; // 0-100 indicating importance/relevance
}

export interface AnalysisResult {
  probabilityAI: number; // 0-100
  label: 'Likely AI' | 'Likely Human' | 'Mixed/Uncertain';
  confidence: number; // 0-100
  reasoning: string;
  keyFeatures: KeyFeature[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isError?: boolean;
}

export interface FileData {
  file: File | null;
  previewUrl: string | null;
  base64: string | null;
  mimeType: string;
}

export interface QueueItem {
  id: string;
  file: File;
  status: 'uploading' | 'ready' | 'analyzing' | 'done' | 'error';
  progress: number; // 0-100
  previewUrl?: string;
  base64?: string;
  mimeType: string;
  result?: AnalysisResult;
  error?: string;
  segmentsProcessed?: number;
  totalSegments?: number;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  mediaType: MediaType;
  preview: string;
  result: AnalysisResult;
  content?: string;
  mimeType?: string;
  fileName?: string;
  config?: {
    preset: AnalysisPreset;
    focus: AnalysisFocus;
    advanced?: AdvancedConfig;
  };
}
