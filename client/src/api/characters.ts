import { fetchJson } from '../utils/api';
import {
  CharacterListResponse,
  CharacterResponse,
  CharacterCreatePayload,
  CharacterUpdatePayload,
} from '../types/character';

export const listCharacters = (projectId: string) =>
  fetchJson<CharacterListResponse>(`/api/projects/${projectId}/characters`);

export const createCharacter = (projectId: string, payload: CharacterCreatePayload) =>
  fetchJson<CharacterResponse>(`/api/projects/${projectId}/characters`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateCharacter = (
  projectId: string,
  characterId: string,
  payload: CharacterUpdatePayload
) =>
  fetchJson<CharacterResponse>(`/api/projects/${projectId}/characters/${characterId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteCharacter = (projectId: string, characterId: string) =>
  fetchJson<void>(`/api/projects/${projectId}/characters/${characterId}`, {
    method: 'DELETE',
  });
