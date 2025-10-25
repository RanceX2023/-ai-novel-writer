import { fetchJson } from '../utils/api';
import {
  ProjectListResponse,
  ProjectResponse,
  ProjectStylePayload,
  ProjectStyleResponse,
} from '../types/project';

export const listProjects = () => fetchJson<ProjectListResponse>('/api/projects');

export const createProject = (payload: { name: string; synopsis?: string }) =>
  fetchJson<ProjectResponse>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getProjectStyle = (projectId: string) =>
  fetchJson<ProjectStyleResponse>(`/api/projects/${projectId}/style`);

export const saveProjectStyle = (projectId: string, payload: ProjectStylePayload) =>
  fetchJson<ProjectResponse>(`/api/projects/${projectId}/style`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
