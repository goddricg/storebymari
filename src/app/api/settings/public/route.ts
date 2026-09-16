import { NextRequest, NextResponse } from "next/server";
import { getSettingValue, getSettingValues } from "@/lib/settings/repository";
import { isSafePublicSettingKey } from "@/lib/settings/public-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const keysParam = searchParams.get("keys");
  const requestedKeys =
    keysParam === null || keysParam.trim() === ""
      ? null
      : [...new Set(keysParam.split(",").map((key) => key.trim()).filter(Boolean))];

  if (requestedKeys !== null) {
    const hasUnsafeKey = requestedKeys.some((key) => !isSafePublicSettingKey(key));
    if (hasUnsafeKey) {
      return noStoreJson({ message: "ขอได้เฉพาะ setting ที่เปิดเผยต่อสาธารณะเท่านั้น" }, 400);
    }
  }

  try {
    if (requestedKeys !== null) {
      const result = await getSettingValues(requestedKeys);
      return noStoreJson(result);
    }

    const [bankAccountNumber, bankAccountName, bankName, minimumAmount] = await Promise.all([
      getSettingValue("bank_account_number"),
      getSettingValue("bank_account_name"),
      getSettingValue("bank_name"),
      getSettingValue("minimum_topup_amount"),
    ]);

    return noStoreJson({
      bankAccount: {
        number: bankAccountNumber || null,
        name: bankAccountName || null,
        bank: bankName || null,
      },
      minimumAmount: minimumAmount ? parseFloat(minimumAmount) || 49 : 49,
    });
  } catch (error) {
    console.error("Error fetching public settings:", error);
    if (requestedKeys !== null) {
      const result: Record<string, string | null> = {};
      for (const key of requestedKeys) {
        result[key] = null;
      }
      return noStoreJson(result);
    }
    return noStoreJson(
      {
        bankAccount: {
          number: null,
          name: null,
          bank: null,
        },
        minimumAmount: 49,
      },
    );
  }
}

