import { fetchJson } from '../utils/api';
import { AppConfigResponse, TestConnectionResponse } from '../types/config';

export const getAppConfig = () => fetchJson<AppConfigResponse>('/api/config');

export const testConfigConnection = (runtimeApiKey?: string) => {
  const trimmedKey = runtimeApiKey?.trim();
  const headers = trimmedKey ? { 'X-OpenAI-Key': trimmedKey } : undefined;

  return fetchJson<TestConnectionResponse>('/api/config/test-connection', {
    headers,
  });
};
