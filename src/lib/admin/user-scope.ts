export type UserTargetScope = {
  whereClause: string;
  params: string[];
};

/** Main is the intentional central operator view; tenants are exact-site. */
export function buildUserTargetScope(siteId: string, userId: string): UserTargetScope {
  return siteId === "main"
    ? { whereClause: "id = ?", params: [userId] }
    : { whereClause: "id = ? AND site_id = ?", params: [userId, siteId] };
}

type CreatedUserRecord = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: string;
  is_admin: number;
  user_tier: string;
  points: number;
  is_active: number;
  created_at: Date;
  updated_at: Date;
};

/** Never expose password_hash in an Admin JSON response. */
export function toAdminCreatedUser(record: CreatedUserRecord, siteId: string) {
  return {
    id: record.id,
    email: record.email,
    display_name: record.display_name,
    role: record.role,
    is_admin: record.is_admin === 1,
    user_tier: record.user_tier,
    points: record.points,
    is_active: record.is_active === 1,
    site_id: siteId,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}
