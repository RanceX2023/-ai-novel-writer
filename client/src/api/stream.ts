import { fetchJson } from '../utils/api';

export interface CancelStreamResponse {
  code: string;
  message: string;
}

export const cancelStreamJob = (jobId: string): Promise<CancelStreamResponse> =>
  fetchJson<CancelStreamResponse>(`/api/stream/${jobId}/cancel`, {
    method: 'POST',
  });
