import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { canViewGlobalProviderBalance } from "@/lib/auth/access-policies";
import { getSiteId } from "@/lib/site";
import { getApiProviderById } from "@/lib/api-providers/repository";
import { createBasicAuthHeader } from "@/lib/api-providers/utils";
import axios from "axios";
import qs from "qs";
import {
  getAdminAuditRequestContext,
  recordAdminAuditEvent,
} from "@/lib/audit/admin-audit";

type PeamSub24hrBalanceResponse = {
  statusCode: number;
  data?: {
    balance: string;
    username?: string;
    rank?: number;
  };
  error?: string;
  message?: string;
};

type GafiwShopBalanceResponse = {
  // Format 1: { ok: boolean, balance?: string }
  ok?: boolean;
  balance?: string;
  owner?: string;
  error?: string;
  // Format 2: { status: string, msg?: string }
  status?: string;
  msg?: string;
};

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

async function authorizeGlobalProviderBalance() {
  const me = await getCurrentUser();
  if (!me) {
    return { user: null, response: noStoreJson({ message: "Unauthorized" }, 401) };
  }
  if (!canViewGlobalProviderBalance(getSiteId(), me)) {
    return { user: null, response: noStoreJson({ message: "Forbidden" }, 403) };
  }
  return { user: me, response: null };
}

function externalBalanceError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status) return `HTTP ${error.response.status}`;
    if (error.request) return "ไม่ได้รับ response จาก API";
  }
  return "เกิดข้อผิดพลาดในการเชื่อมต่อ API";
}

export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeGlobalProviderBalance();
    if (authorization.response) return authorization.response;
    const me = authorization.user!;

    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");

    if (!providerId) {
      return noStoreJson(
        { message: "กรุณาระบุ provider ID" },
        400,
      );
    }

    const provider = await getApiProviderById(providerId);
    if (!provider) {
      return noStoreJson(
        { message: "ไม่พบ API provider" },
        404,
      );
    }

    if (!provider.apiKey) {
      return noStoreJson(
        { message: "API provider นี้ยังไม่มี API key" },
        400,
      );
    }

    let balance: string | null = null;
    let error: string | null = null;

    try {
      if (provider.name === "peamsub24hr" || provider.apiEndpoint.includes("peamsub24hr.com")) {
        // PeamSub24hr API
        const authHeader = createBasicAuthHeader(provider.apiKey);
        const response = await fetch("https://api.peamsub24hr.com/v2/user/inquiry", {
          method: "GET",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          // Do not parse or log the upstream error body: it is not needed for
          // the Admin result and could contain credential-shaped data.
          error = `HTTP ${response.status}`;
        } else {
          const data = (await response.json()) as PeamSub24hrBalanceResponse;
          if (data.statusCode === 200 && data.data?.balance) {
            balance = data.data.balance;
          } else {
            error = "ไม่สามารถดึงข้อมูล balance ได้";
          }
        }
      } else if (provider.name === "gafiwshop" || provider.apiEndpoint.includes("gafiwshop.xyz")) {
        // GafiwShop API - POST method with application/x-www-form-urlencoded
        const API_URL = "https://gafiwshop.xyz/api/api_money";
        const requestBody = qs.stringify({ keyapi: provider.apiKey });
        const requestHeaders = {
          "Content-Type": "application/x-www-form-urlencoded",
        };

        try {
          const response = await axios.post<GafiwShopBalanceResponse>(
            API_URL,
            requestBody,
            {
              headers: requestHeaders,
            }
          );

          const data = response.data;
          
          // รองรับ format ใหม่: { status: "success", msg: "150.56 บาท" }
          if (data.status === "success" && data.msg) {
            // Extract ตัวเลขจาก msg (ลบ "บาท" และช่องว่างออก)
            const balanceMatch = data.msg.match(/[\d.]+/);
            if (balanceMatch) {
              balance = balanceMatch[0];
            } else {
              error = "ไม่สามารถ parse balance จาก msg ได้";
            }
          }
          // รองรับ format เก่า: { ok: true, balance: "150.56" }
          else if (data.ok && data.balance !== undefined) {
            balance = data.balance;
          } else {
            error = "ไม่สามารถดึงข้อมูล balance ได้";
          }
        } catch (axiosError: unknown) {
          // Never log the Axios error object: its config/body may contain the
          // provider credential used in the form-encoded request.
          error = externalBalanceError(axiosError);
        }
      } else {
        error = "API provider นี้ยังไม่รองรับการดึง balance";
      }
    } catch {
      error = "เกิดข้อผิดพลาดในการเชื่อมต่อ API";
    }

    await recordAdminAuditEvent({
      actor: me,
      action: "API_PROVIDER_BALANCE_VIEW",
      category: "finance",
      severity: "medium",
      entityType: "api_provider",
      entityId: provider.id,
      entityLabel: provider.name,
      result: error ? "failed" : "success",
      reasonCode: error ? "PROVIDER_BALANCE_ERROR" : null,
      after: { hasBalance: balance !== null, provider: provider.name },
      details: "Checked an external API provider balance without storing credentials",
      ...getAdminAuditRequestContext(request),
    });

    return noStoreJson({
      providerId: provider.id,
      providerName: provider.name,
      balance,
      error,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ไม่สามารถดึงข้อมูล balance ได้";
    return noStoreJson({ message }, 500);
  }
}

