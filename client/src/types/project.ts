export interface StyleProfile {
  tone: string | null;
  pacing: string | null;
  pov: string | null;
  diction: string | null;
  authors: string[];
  styleStrength: number | null;
  language: string | null;
  model: string | null;
  notes: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  synopsis?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  styleProfile?: StyleProfile | null;
}

export interface ProjectListResponse {
  projects: ProjectSummary[];
}

export interface ProjectResponse {
  project: ProjectSummary;
}

export interface ProjectStyleResponse {
  style: StyleProfile | null;
}

export interface ProjectStylePayload {
  tone: string;
  pacing: string;
  pov: string;
  diction: string;
  authors?: string[];
  styleStrength?: number;
  language?: string;
  model?: string;
  notes?: string;
}
