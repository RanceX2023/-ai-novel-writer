import { fetchJson } from '../utils/api';
import { AppConfigResponse } from '../types/config';

export const getAppConfig = () => fetchJson<AppConfigResponse>('/api/config');
