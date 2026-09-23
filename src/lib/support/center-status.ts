import {
  AppByMariApiError,
  fetchAppByMariSupportCaseStatuses,
  getAppByMariProvider,
  type AppByMariSupportCaseStatus,
} from "@/lib/appbymari/client";
import type { SupportCase } from "./types";

/** Merge the central status projection without changing the local database record. */
export function applyCenterSupportCaseStatuses(
  cases: SupportCase[],
  centralStatuses: AppByMariSupportCaseStatus[],
): SupportCase[] {
  const statusByCaseCode = new Map(
    centralStatuses.map((status) => [status.caseCode.trim(), status]),
  );

  return cases.map<SupportCase>((caseData) => {
    if (!caseData.centerCaseId && !caseData.centerCaseCode) return caseData;

    const centralStatus = caseData.centerCaseCode
      ? statusByCaseCode.get(caseData.centerCaseCode.trim())
      : undefined;
    if (!centralStatus) {
      return {
        ...caseData,
        centerStatusSyncState: "not_found",
      };
    }

    return {
      ...caseData,
      status: centralStatus.status,
      centerStatusSyncState: "synced",
      centerStatusUpdatedAt: centralStatus.updatedAt,
    };
  });
}

/** Read linked statuses in batches and keep the Store record visible if Center is unavailable. */
export async function syncSupportCaseStatusesFromCenter(
  cases: SupportCase[],
): Promise<SupportCase[]> {
  const caseCodes = [...new Set(
    cases
      .map((caseData) => caseData.centerCaseCode?.trim())
      .filter((caseCode): caseCode is string => Boolean(caseCode)),
  )];
  const linkedCases = cases.filter((caseData) => caseData.centerCaseId || caseData.centerCaseCode);
  if (linkedCases.length === 0) return cases;
  if (caseCodes.length === 0) return applyCenterSupportCaseStatuses(cases, []);

  try {
    const provider = await getAppByMariProvider();
    const centralStatuses: AppByMariSupportCaseStatus[] = [];
    for (let index = 0; index < caseCodes.length; index += 100) {
      centralStatuses.push(...await fetchAppByMariSupportCaseStatuses({
        provider,
        caseCodes: caseCodes.slice(index, index + 100),
      }));
    }
    return applyCenterSupportCaseStatuses(cases, centralStatuses);
  } catch (error) {
    const errorCode = error instanceof AppByMariApiError
      ? `http_${error.status}`
      : error instanceof Error
        ? error.name
        : "unknown";
    console.warn("[Support Center] Central status refresh unavailable", { errorCode });
    return cases.map<SupportCase>((caseData) => (
      caseData.centerCaseId || caseData.centerCaseCode
        ? { ...caseData, centerStatusSyncState: "unavailable" }
        : caseData
    ));
  }
}
