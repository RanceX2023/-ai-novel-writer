import { fetchJson } from '../utils/api';
import type { PlotArc, PlotPoint, PlotSuggestion } from '../types/plot';

export interface PlotOverviewResponse {
  arcs: PlotArc[];
  points: PlotPoint[];
}

export interface CreatePlotArcPayload {
  title: string;
  color?: string;
  summary?: string;
  goal?: string;
  themes?: string[];
  order?: number;
  metadata?: Record<string, unknown>;
}

export type UpdatePlotArcPayload = Partial<CreatePlotArcPayload> & {
  title?: string;
};

export interface CreatePlotPointPayload {
  arcId: string;
  title: string;
  description?: string;
  chapterId?: string | null;
  tension?: number;
  order?: number;
  beatType?: string;
  status?: string;
  aiSuggested?: boolean;
  metadata?: Record<string, unknown>;
}

export type UpdatePlotPointPayload = Partial<Omit<CreatePlotPointPayload, 'arcId' | 'title'>> & {
  arcId?: string;
  title?: string;
  chapterId?: string | null;
};

export interface PlotSuggestionRequest {
  arcId?: string;
  chapterId?: string;
  count?: number;
  tone?: string;
  theme?: string;
  focus?: string;
}

export const getPlotOverview = (projectId: string): Promise<PlotOverviewResponse> =>
  fetchJson<PlotOverviewResponse>(`/api/projects/${projectId}/plot`);

export const createPlotArc = (
  projectId: string,
  payload: CreatePlotArcPayload
): Promise<{ arc: PlotArc }> =>
  fetchJson<{ arc: PlotArc }>(`/api/projects/${projectId}/plot/arcs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updatePlotArc = (
  projectId: string,
  arcId: string,
  payload: UpdatePlotArcPayload
): Promise<{ arc: PlotArc }> =>
  fetchJson<{ arc: PlotArc }>(`/api/projects/${projectId}/plot/arcs/${arcId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deletePlotArc = (projectId: string, arcId: string): Promise<void> =>
  fetchJson<void>(`/api/projects/${projectId}/plot/arcs/${arcId}`, {
    method: 'DELETE',
  });

export const createPlotPoint = (
  projectId: string,
  payload: CreatePlotPointPayload
): Promise<{ point: PlotPoint }> =>
  fetchJson<{ point: PlotPoint }>(`/api/projects/${projectId}/plot/points`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updatePlotPoint = (
  projectId: string,
  pointId: string,
  payload: UpdatePlotPointPayload
): Promise<{ point: PlotPoint }> =>
  fetchJson<{ point: PlotPoint }>(`/api/projects/${projectId}/plot/points/${pointId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deletePlotPoint = (projectId: string, pointId: string): Promise<void> =>
  fetchJson<void>(`/api/projects/${projectId}/plot/points/${pointId}`, {
    method: 'DELETE',
  });

export const generatePlotSuggestions = (
  projectId: string,
  payload: PlotSuggestionRequest
): Promise<{ suggestions: PlotSuggestion[] }> =>
  fetchJson<{ suggestions: PlotSuggestion[] }>(`/api/projects/${projectId}/plot/suggestions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
