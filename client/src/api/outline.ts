import { fetchJson } from '../utils/api';
import type {
  OutlineGenerationPayload,
  OutlineNode,
  OutlineNodeUpsertPayload,
  OutlineReorderUpdate,
} from '../types/outline';

interface OutlineResponse {
  outline: OutlineNode[];
}

interface OutlineNodeResponse {
  node: OutlineNode;
}

interface OutlineGenerateResponse {
  outline: OutlineNode[];
}

export const fetchOutline = (projectId: string): Promise<OutlineNode[]> =>
  fetchJson<OutlineResponse>(`/api/projects/${projectId}/outline`).then((data) => data.outline ?? []);

export const generateOutline = (
  projectId: string,
  payload: OutlineGenerationPayload
): Promise<OutlineGenerateResponse> =>
  fetchJson<OutlineGenerateResponse>(`/api/projects/${projectId}/outline/generate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const upsertOutlineNode = (
  projectId: string,
  payload: OutlineNodeUpsertPayload
): Promise<OutlineNodeResponse> =>
  fetchJson<OutlineNodeResponse>(`/api/projects/${projectId}/outline`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const reorderOutlineNodes = (
  projectId: string,
  updates: OutlineReorderUpdate[]
): Promise<{ success: boolean }> =>
  fetchJson<{ success: boolean }>(`/api/projects/${projectId}/outline/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ updates }),
  });

export const deleteOutlineNode = (projectId: string, nodeId: string): Promise<{ removed: number }> =>
  fetchJson<{ removed: number }>(`/api/projects/${projectId}/outline/${nodeId}`, {
    method: 'DELETE',
  });
