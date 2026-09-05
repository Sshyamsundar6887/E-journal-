/**
 * Shared Type Definitions for Personal Journaling App
 */

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  content: string;
  date: string; // ISO String
  mood: string; // e.g., "Calm", "Anxious", "Excited", "Burned Out"
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // -1 to 1 scale
  themes: string[];
  summary: string;
  actionItems: ActionItem[];
  imageUrl?: string;
  location?: EntryLocation;
  embedding?: number[];
  audioTranscript?: string;
  createdAt: number;
}

export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: number;
}

export interface MoodTrendPoint {
  date: string;
  score: number;
  mood: string;
}

export interface ThemeCount {
  theme: string;
  count: number;
}

export interface InsightsSummary {
  weeklySummary: string;
  moodOverview: string;
  dominantThemes: string[];
  recommendations: string[];
}

export type AppMode = 'cloud' | 'local';

export type LocalModelId = 'distilbert-sentiment' | 'minilm-embeddings';

export interface LocalModelMeta {
  id: LocalModelId;
  name: string;
  tagline: string;
  parameters: string;
  size: string; // e.g., "25.5 MB" or "23.1 MB"
  sizeBytes: number;
  quantization: string;
  ramRequired: string;
  description: string;
  strengths: string[];
  downloaded: boolean;
  downloadProgress: number; // 0 to 100
  isDownloading: boolean;
  cachedAt?: number;
  hfModelId?: string;
}

export interface LocalDatabaseStats {
  entryCount: number;
  actionItemCount: number;
  estimatedStorageBytes: number;
  lastUpdated: number;
}

export interface LocalInferenceResult {
  mood: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number;
  themes: string[];
  summary: string;
  actionItems: { text: string }[];
  embedding: number[];
  modelUsed: string;
  executionTimeMs: number;
}

export interface EntryLocation {
  name: string;
  lat?: number;
  lng?: number;
}


