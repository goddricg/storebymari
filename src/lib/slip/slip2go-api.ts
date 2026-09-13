import axios from "axios";

import type { Slip2GoApiResponse } from "./types";
import { logger } from "@/lib/utils/logger";

const DEFAULT_SLIP2GO_ENDPOINT =
  "https://connect.slip2go.com/api/verify-slip/qr-image/info";

export type Slip2GoTransportKind = "timeout" | "http" | "network" | "unknown";

export class Slip2GoTransportError extends Error {
  constructor(
    message: string,
    public readonly kind: Slip2GoTransportKind,
    public readonly httpStatus: number | undefined,
    public readonly axiosCode: string | undefined,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "Slip2GoTransportError";
  }
}

function safeErrorText(value: unknown): string {
  if (typeof value !== "string") return "Slip2Go request failed.";
  return (
    value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 160) ||
    "Slip2Go request failed."
  );
}

export function isRetryableSlip2GoHttpStatus(
  status: number | undefined
): boolean {
  return (
    status === undefined ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export async function verifySlipWithSlip2Go(
  formData: FormData,
  options: { secretKey: string; endpoint?: string }
): Promise<Slip2GoApiResponse> {
  const endpoint = options.endpoint ?? DEFAULT_SLIP2GO_ENDPOINT;
  const secretKey = options.secretKey;

  if (!secretKey) {
    throw new Error("Slip2Go secret key is missing");
  }

  try {
    logger.debug("[Slip2Go] Sending multipart request via Axios", {
      endpoint,
      hasPayload: formData.has("payload"),
    });

    const response = await axios.post(endpoint, formData, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
      responseType: "json",
      timeout: 20_000,
    });

    const data = response.data as Slip2GoApiResponse;

    logger.debug("[Slip2Go] Response received via Axios", {
      status: response.status,
      code: data.code,
      message: data.message,
    });

    return data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const httpStatus = error.response?.status;
      const axiosCode = typeof error.code === "string" ? error.code : undefined;
      const kind: Slip2GoTransportKind = httpStatus
        ? "http"
        : axiosCode === "ECONNABORTED" || axiosCode === "ETIMEDOUT"
          ? "timeout"
          : "network";
      const retryable = isRetryableSlip2GoHttpStatus(httpStatus);
      const responseData =
        typeof error.response?.data === "object" && error.response.data !== null
          ? (error.response.data as { message?: unknown })
          : null;
      const responseMessage =
        typeof responseData?.message === "string" ? responseData.message : null;
      const message = safeErrorText(responseMessage || error.message);

      logger.error("[Slip2Go] Axios request failed", {
        status: httpStatus,
        axiosCode,
        kind,
        retryable,
        message,
      });

      throw new Slip2GoTransportError(
        message,
        kind,
        httpStatus,
        axiosCode,
        retryable
      );
    }

    if (error instanceof Error) {
      throw new Slip2GoTransportError(
        safeErrorText(error.message),
        "unknown",
        undefined,
        undefined,
        true
      );
    }

    throw new Slip2GoTransportError(
      "Slip2Go request failed.",
      "unknown",
      undefined,
      undefined,
      true
    );
  }
}
