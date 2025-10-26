export interface AppConfigResponse {
  port: number;
  models: string[];
  defaultModel: string;
  allowRuntimeKeyOverride: boolean;
}

export interface TestConnectionResponse {
  ok: boolean;
  modelUsed: string;
  latencyMs: number;
}
