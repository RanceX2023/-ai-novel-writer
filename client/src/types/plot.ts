export interface PlotArc {
  id: string;
  title: string;
  color?: string;
  summary?: string;
  goal?: string;
  order: number;
  themes: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlotPoint {
  id: string;
  arcId: string;
  chapterId: string | null;
  title: string;
  description?: string;
  tension: number;
  order: number;
  beatType?: string | null;
  status?: string | null;
  aiSuggested?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlotSuggestion {
  id: string;
  title: string;
  description: string;
  tension: number;
  beatType?: string | null;
  arcId?: string | null;
  arcName?: string | null;
  chapterId?: string | null;
  chapterTitle?: string | null;
}
