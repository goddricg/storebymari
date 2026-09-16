import type { ApiProvider } from "./types";

export type SafeApiProvider = Omit<ApiProvider, "apiKey"> & {
  /** Always null: the full credential never crosses the Admin API boundary. */
  apiKey: null;
  hasApiKey: boolean;
};

export function toSafeApiProvider(provider: ApiProvider): SafeApiProvider {
  return {
    ...provider,
    apiKey: null,
    hasApiKey: Boolean(provider.apiKey),
  };
}
