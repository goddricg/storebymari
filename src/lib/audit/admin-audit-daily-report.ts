import type { RowDataPacket } from "mysql2/promise";

import { AUDIT_ACTION_TH, AUDIT_CATEGORY_TH } from "@/lib/audit/admin-audit-repository";
import pool from "@/lib/mysql";

const TIME_ZONE = "Asia/Bangkok";
const SESSION_INACTIVITY_GAP_MS = 30 * 60 * 1000; // 30 minutes gap threshold

export type AdminWorkSession = {
  sessionIndex: number;
  startTime: string;
  endTime: string;
  startTimeTh: string;
  endTimeTh: string;
  durationMinutes: number;
  durationFormatted: string;
  actionsCount: number;
  topCategoriesTh: string[];
  topActionsTh: string[];
};

export type AdminDailyWorkSummary = {
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  totalSessions: number;
  totalActiveMinutes: number;
  totalActiveFormatted: string;
  firstActionAt: string | null;
  lastActionAt: string | null;
  firstActionTh: string;
  lastActionTh: string;
  totalActions: number;
  successCount: number;
  failedCount: number;
  highRiskCount: number;
  sessions: AdminWorkSession[];
  categoryBreakdown: Array<{
    category: string;
    labelTh: string;
    count: number;
    percentage: number;
  }>;
  topActions: Array<{
    action: string;
    labelTh: string;
    count: number;
  }>;
};

export type AdminDailyReportResponse = {
  date: string;
  dateTh: string;
  totalAdminsActive: number;
  totalSessionsAll: number;
  totalActionsAll: number;
  totalActiveMinutesAll: number;
  totalActiveFormattedAll: string;
  admins: AdminDailyWorkSummary[];
};

export function formatDurationTh(minutes: number): string {
  if (minutes <= 1) return "1 นาที";
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (hours > 0) {
    return remain > 0 ? `${hours} ชม. ${remain} นาที` : `${hours} ชั่วโมง`;
  }
  return `${remain} นาที`;
}

function formatTimeOnly(date: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " น.";
}

function formatDateTh(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

type EventRow = RowDataPacket & {
  id: string;
  actor_id: string;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  event_action: string;
  event_category: string;
  severity: string;
  result: string;
  occurred_at: Date | string;
};

export async function getAdminDailyWorkReport(input: {
  siteId: string;
  date: string; // YYYY-MM-DD
  actorId?: string;
}): Promise<AdminDailyReportResponse> {
  const normalizedDate = input.date.trim().slice(0, 10);
  const targetActorId = input.actorId?.trim();

  let query = `
    SELECT
      id, actor_id, actor_name, actor_email, actor_role,
      event_action, event_category, severity, result, occurred_at
    FROM admin_audit_events
    WHERE site_id = ?
      AND actor_id IS NOT NULL
      AND DATE(CONVERT_TZ(occurred_at, '+00:00', '+07:00')) = ?
  `;
  const params: (string | number | null)[] = [input.siteId, normalizedDate];

  if (targetActorId) {
    query += ` AND actor_id = ?`;
    params.push(targetActorId);
  }

  query += ` ORDER BY actor_id ASC, occurred_at ASC, id ASC`;

  const [rows] = await pool.execute<EventRow[]>(query, params);

  // Group events by actor_id
  type RawActorGroup = {
    id: string;
    name: string;
    email: string;
    role: string;
    events: EventRow[];
  };

  const actorGroups = new Map<string, RawActorGroup>();

  for (const row of rows) {
    const actorId = String(row.actor_id);
    let group = actorGroups.get(actorId);
    if (!group) {
      group = {
        id: actorId,
        name: String(row.actor_name || row.actor_email || actorId),
        email: String(row.actor_email || ""),
        role: String(row.actor_role || "admin"),
        events: [],
      };
      actorGroups.set(actorId, group);
    }
    if (!group.name && (row.actor_name || row.actor_email)) {
      group.name = String(row.actor_name || row.actor_email);
    }
    if (!group.email && row.actor_email) {
      group.email = String(row.actor_email);
    }
    group.events.push(row);
  }

  const admins: AdminDailyWorkSummary[] = [];

  for (const [, group] of actorGroups) {
    type IntermediateSession = {
      startTime: Date;
      endTime: Date;
      actionsCount: number;
      categoryCounts: Record<string, number>;
      actionCounts: Record<string, number>;
    };

    const intermediateSessions: IntermediateSession[] = [];
    let currentSession: IntermediateSession | null = null;

    let successCount = 0;
    let failedCount = 0;
    let highRiskCount = 0;
    const allCategoryCounts: Record<string, number> = {};
    const allActionCounts: Record<string, number> = {};

    for (const ev of group.events) {
      const eventTime = new Date(ev.occurred_at);
      const timeMs = eventTime.getTime();

      if (ev.result === "success") successCount++;
      if (ev.result === "failed" || ev.result === "denied") failedCount++;
      if (ev.severity === "high" || ev.severity === "critical") highRiskCount++;

      allCategoryCounts[ev.event_category] = (allCategoryCounts[ev.event_category] || 0) + 1;
      allActionCounts[ev.event_action] = (allActionCounts[ev.event_action] || 0) + 1;

      if (!currentSession) {
        currentSession = {
          startTime: eventTime,
          endTime: eventTime,
          actionsCount: 1,
          categoryCounts: { [ev.event_category]: 1 },
          actionCounts: { [ev.event_action]: 1 },
        };
      } else {
        const gap = timeMs - currentSession.endTime.getTime();
        if (gap > SESSION_INACTIVITY_GAP_MS) {
          intermediateSessions.push(currentSession);
          currentSession = {
            startTime: eventTime,
            endTime: eventTime,
            actionsCount: 1,
            categoryCounts: { [ev.event_category]: 1 },
            actionCounts: { [ev.event_action]: 1 },
          };
        } else {
          currentSession.endTime = eventTime;
          currentSession.actionsCount++;
          currentSession.categoryCounts[ev.event_category] =
            (currentSession.categoryCounts[ev.event_category] || 0) + 1;
          currentSession.actionCounts[ev.event_action] =
            (currentSession.actionCounts[ev.event_action] || 0) + 1;
        }
      }
    }

    if (currentSession) {
      intermediateSessions.push(currentSession);
    }

    let totalActiveMinutes = 0;
    const formattedSessions: AdminWorkSession[] = intermediateSessions.map((s, idx) => {
      const diffMs = s.endTime.getTime() - s.startTime.getTime();
      const durMin = Math.max(1, Math.round(diffMs / 60000));
      totalActiveMinutes += durMin;

      // Sort categories
      const topCategories = Object.entries(s.categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat]) => AUDIT_CATEGORY_TH[cat] || cat);

      // Sort actions
      const topActions = Object.entries(s.actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([act]) => AUDIT_ACTION_TH[act] || act);

      return {
        sessionIndex: idx + 1,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        startTimeTh: formatTimeOnly(s.startTime),
        endTimeTh: formatTimeOnly(s.endTime),
        durationMinutes: durMin,
        durationFormatted: formatDurationTh(durMin),
        actionsCount: s.actionsCount,
        topCategoriesTh: topCategories,
        topActionsTh: topActions,
      };
    });

    const firstEvent = group.events[0];
    const lastEvent = group.events[group.events.length - 1];
    const firstDate = firstEvent ? new Date(firstEvent.occurred_at) : null;
    const lastDate = lastEvent ? new Date(lastEvent.occurred_at) : null;

    const totalActions = group.events.length;
    const categoryBreakdown = Object.entries(allCategoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({
        category: cat,
        labelTh: AUDIT_CATEGORY_TH[cat] || cat,
        count,
        percentage: totalActions > 0 ? Math.round((count / totalActions) * 100) : 0,
      }));

    const topActions = Object.entries(allActionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([action, count]) => ({
        action,
        labelTh: AUDIT_ACTION_TH[action] || action,
        count,
      }));

    admins.push({
      actorId: group.id,
      actorName: group.name,
      actorEmail: group.email,
      actorRole: group.role,
      totalSessions: formattedSessions.length,
      totalActiveMinutes,
      totalActiveFormatted: formatDurationTh(totalActiveMinutes),
      firstActionAt: firstDate ? firstDate.toISOString() : null,
      lastActionAt: lastDate ? lastDate.toISOString() : null,
      firstActionTh: firstDate ? formatTimeOnly(firstDate) : "-",
      lastActionTh: lastDate ? formatTimeOnly(lastDate) : "-",
      totalActions,
      successCount,
      failedCount,
      highRiskCount,
      sessions: formattedSessions,
      categoryBreakdown,
      topActions,
    });
  }

  // Sort admins by total actions descending
  admins.sort((a, b) => b.totalActions - a.totalActions);

  const totalSessionsAll = admins.reduce((acc, a) => acc + a.totalSessions, 0);
  const totalActionsAll = admins.reduce((acc, a) => acc + a.totalActions, 0);
  const totalActiveMinutesAll = admins.reduce((acc, a) => acc + a.totalActiveMinutes, 0);

  return {
    date: normalizedDate,
    dateTh: formatDateTh(normalizedDate),
    totalAdminsActive: admins.length,
    totalSessionsAll,
    totalActionsAll,
    totalActiveMinutesAll,
    totalActiveFormattedAll: formatDurationTh(totalActiveMinutesAll),
    admins,
  };
}
