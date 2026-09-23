import type { ApiProvider } from "@/lib/api-providers/types";
import { getApiProviderByName } from "@/lib/api-providers/repository";
import {
  APPBYMARI_API_BASE_URL,
  APPBYMARI_PROVIDER_NAME,
  type AppByMariRemoteProduct,
} from "./types";
import { ensureAppByMariSchema } from "./schema";
import type { SupportCase, SupportCaseStatus, SupportCaseType } from "@/lib/support/types";

type JsonRecord = Record<string, unknown>;

export class AppByMariApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(status: number, message = "Store By Mari API request failed") {
    super(message);
    this.name = "AppByMariApiError";
    this.status = status;
    this.retryable = status === 0 || status >= 500 || status === 408 || status === 429;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveApiKey(provider: ApiProvider | null, override?: string): string {
  const apiKey = override?.trim() || provider?.apiKey?.trim() || "";
  if (!apiKey) throw new AppByMariApiError(401, "Store By Mari API key is not configured");
  return apiKey;
}

function endpoint(path: string): string {
  return `${APPBYMARI_API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

async function requestJson(
  path: string,
  apiKey: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<{ status: number; body: JsonRecord }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint(path), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        "x-api-key": apiKey,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    const raw = await response.text();
    let body: JsonRecord = {};
    try {
      body = asRecord(raw ? JSON.parse(raw) : null) ?? {};
    } catch {
      body = {};
    }

    if (!response.ok) {
      const status = response.status || 0;
      throw new AppByMariApiError(
        status,
        status === 401 || status === 403
          ? "Store By Mari API key was rejected"
          : status === 404
            ? "Store By Mari API endpoint was not found"
            : "Store By Mari API request failed",
      );
    }

    return { status: response.status, body };
  } catch (error) {
    if (error instanceof AppByMariApiError) throw error;
    throw new AppByMariApiError(
      0,
      error instanceof DOMException && error.name === "AbortError"
        ? "Store By Mari API request timed out"
        : "Store By Mari API is unavailable",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRemoteProduct(value: unknown): AppByMariRemoteProduct | null {
  const row = asRecord(value);
  if (!row) return null;

  const sourceTypeId = asText(row.type_id) ?? asText(row.typeId) ?? asText(row.id);
  const name = asText(row.name);
  if (!sourceTypeId || !name) return null;

  const costPrice = Math.max(0, asFiniteNumber(row.price, 0));
  const stock = Math.max(0, Math.trunc(asFiniteNumber(row.stock, 0)));
  return {
    sourceTypeId,
    name,
    imageUrl: asText(row.image_url) ?? asText(row.imageapi) ?? asText(row.imageUrl),
    details: asText(row.details),
    categoryName: asText(row.type_menu) ?? asText(row.category) ?? asText(row.categoryName),
    costPrice,
    stock,
  };
}

export async function getAppByMariProvider(): Promise<ApiProvider | null> {
  await ensureAppByMariSchema();
  return getApiProviderByName(APPBYMARI_PROVIDER_NAME);
}

export async function fetchAppByMariProducts(input: {
  provider?: ApiProvider | null;
  apiKey?: string;
} = {}): Promise<AppByMariRemoteProduct[]> {
  const provider = input.provider ?? await getAppByMariProvider();
  const apiKey = resolveApiKey(provider, input.apiKey);
  const products: AppByMariRemoteProduct[] = [];
  const limit = 100;
  let offset = 0;
  let total: number | null = null;

  for (let page = 0; page < 20; page += 1) {
    const result = await requestJson(`products?limit=${limit}&offset=${offset}`, apiKey);
    if (result.body.success !== true || !Array.isArray(result.body.data)) {
      throw new AppByMariApiError(result.status, "Store By Mari product response was invalid");
    }

    const pageProducts = result.body.data
      .map(normalizeRemoteProduct)
      .filter((product): product is AppByMariRemoteProduct => product !== null);
    products.push(...pageProducts);

    const pagination = asRecord(result.body.pagination);
    const reportedTotal = pagination ? asFiniteNumber(pagination.total, NaN) : NaN;
    total = Number.isFinite(reportedTotal) ? Math.max(0, Math.trunc(reportedTotal)) : total;
    offset += result.body.data.length;

    if (result.body.data.length === 0 || (total !== null && offset >= total) || result.body.data.length < limit) {
      break;
    }
  }

  return products;
}

export async function testAppByMariConnection(input: { apiKey: string }): Promise<{
  productCount: number;
  siteName: string | null;
}> {
  const apiKey = resolveApiKey(null, input.apiKey);
  const connection = await requestJson("test-connection", apiKey, { method: "POST" });
  if (connection.body.success !== true) {
    throw new AppByMariApiError(connection.status, "Store By Mari connection was rejected");
  }
  const products = await fetchAppByMariProducts({ apiKey });
  const tenant = asRecord(connection.body.tenant);
  return {
    productCount: products.length,
    siteName: tenant ? asText(tenant.site_name) : null,
  };
}

export async function fetchAppByMariBalance(input: {
  provider?: ApiProvider | null;
  apiKey?: string;
} = {}): Promise<number> {
  const provider = input.provider ?? await getAppByMariProvider();
  const apiKey = resolveApiKey(provider, input.apiKey);
  const result = await requestJson("tenant/balance", apiKey);
  const balance = asFiniteNumber(result.body.balance, NaN);
  if (result.body.success !== true || !Number.isFinite(balance)) {
    throw new AppByMariApiError(result.status, "Store By Mari balance response was invalid");
  }
  return Math.max(0, balance);
}

export type AppByMariSupportCaseForwardResult = {
  remoteCaseId: string | null;
  remoteCaseCode: string | null;
};

export type AppByMariSupportCaseStatus = {
  caseCode: string;
  status: SupportCaseStatus;
  updatedAt: string | null;
};

type AppByMariSupportCaseInput = Pick<
  SupportCase,
  | "caseCode"
  | "orderId"
  | "productName"
  | "productTypeId"
  | "accountEmail"
  | "accountPassword"
  | "expirationDate"
  | "screenNumber"
  | "problemDescription"
> & {
  caseType: SupportCaseType;
  shopName: string | null;
};

function normalizeSupportEmail(value: string | null): string | null {
  const normalized = asText(value);
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : null;
}

/** Forward one Store By Mari support case into AppByMari's central queue. */
export async function forwardAppByMariSupportCase(input: {
  provider?: ApiProvider | null;
  apiKey?: string;
  caseData: AppByMariSupportCaseInput;
}): Promise<AppByMariSupportCaseForwardResult> {
  const provider = input.provider ?? await getAppByMariProvider();
  const apiKey = resolveApiKey(provider, input.apiKey);
  const caseData = input.caseData;
  const result = await requestJson("support-cases", apiKey, {
    method: "POST",
    headers: {
      "Idempotency-Key": `storebymari-support-${caseData.caseCode}`,
    },
    body: JSON.stringify({
      orderId: caseData.orderId,
      productName: caseData.productName,
      productTypeId: caseData.productTypeId,
      accountEmail: normalizeSupportEmail(caseData.accountEmail),
      accountPassword: caseData.accountPassword,
      expirationDate: caseData.expirationDate,
      caseType: caseData.caseType,
      screenNumber: caseData.screenNumber,
      problemDescription: caseData.problemDescription,
      shopName: caseData.shopName,
    }),
  });

  if (result.body.success !== true && result.body.ok !== true) {
    throw new AppByMariApiError(result.status, "AppByMari did not accept the support case");
  }

  const remoteCase = asRecord(result.body.case);
  const remoteCaseId = remoteCase ? asText(remoteCase.id) : null;
  const remoteCaseCode = remoteCase
    ? asText(remoteCase.caseCode) ?? asText(remoteCase.case_code)
    : null;
  if (!remoteCaseId && !remoteCaseCode) {
    throw new AppByMariApiError(result.status, "AppByMari returned an invalid support case response");
  }

  return {
    remoteCaseId,
    remoteCaseCode,
  };
}

function isSupportCaseStatus(value: unknown): value is SupportCaseStatus {
  return value === "pending" || value === "in_progress" || value === "resolved";
}

/** Fetch only status metadata for Store By Mari cases linked to the central queue. */
export async function fetchAppByMariSupportCaseStatuses(input: {
  provider?: ApiProvider | null;
  apiKey?: string;
  caseCodes: string[];
}): Promise<AppByMariSupportCaseStatus[]> {
  const caseCodes = [...new Set(input.caseCodes.map((code) => code.trim()).filter(Boolean))];
  if (caseCodes.length === 0) return [];
  if (caseCodes.length > 100) {
    throw new AppByMariApiError(400, "Too many AppByMari support cases in one status request");
  }

  const provider = input.provider ?? await getAppByMariProvider();
  const apiKey = resolveApiKey(provider, input.apiKey);
  const result = await requestJson(
    "support-cases/bulk-status",
    apiKey,
    {
      method: "POST",
      body: JSON.stringify({ caseCodes }),
    },
    5_000,
  );

  if (result.body.success !== true || !Array.isArray(result.body.cases)) {
    throw new AppByMariApiError(result.status, "AppByMari returned an invalid support status response");
  }

  const requestedCaseCodes = new Set(caseCodes);
  const statuses: AppByMariSupportCaseStatus[] = [];

  for (const value of result.body.cases) {
    const row = asRecord(value);
    const caseCode = row ? asText(row.caseCode) : null;
    if (!row || !caseCode || !requestedCaseCodes.has(caseCode)) continue;
    if (!isSupportCaseStatus(row.status)) {
      throw new AppByMariApiError(result.status, "AppByMari returned an invalid support case status");
    }

    statuses.push({
      caseCode,
      status: row.status,
      updatedAt: asText(row.updatedAt),
    });
  }

  return statuses;
}

export async function buyAppByMariProduct(input: {
  provider: ApiProvider;
  sourceTypeId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<{
  orderId: string | null;
  productName: string;
  accountData: unknown;
  remainingStock: number | null;
}> {
  const apiKey = resolveApiKey(input.provider);
  const result = await requestJson("buy", apiKey, {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      typeId: input.sourceTypeId,
      quantity: input.quantity,
      requestId: input.idempotencyKey,
    }),
  });

  if (result.status === 202 || result.body.success !== true) {
    throw new AppByMariApiError(
      result.status === 202 ? 503 : result.status,
      result.status === 202
        ? "Store By Mari purchase is still processing"
        : "Store By Mari purchase was rejected",
    );
  }

  const productName = asText(result.body.productName) ?? input.sourceTypeId;
  const orderId = asText(result.body.orderId);
  const remainingStockValue = asFiniteNumber(result.body.remainingStock, NaN);
  return {
    orderId,
    productName,
    accountData: result.body.accountData,
    remainingStock: Number.isFinite(remainingStockValue)
      ? Math.max(0, Math.trunc(remainingStockValue))
      : null,
  };
}
