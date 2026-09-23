export type SupportCaseType = 'screen' | 'account';

export type SupportCaseStatus = 'pending' | 'in_progress' | 'resolved';

export type SupportCaseCenterSyncStatus = 'pending' | 'sent' | 'failed';

export type SupportCaseRecord = {
  id: string;
  case_code: string;
  user_id: string | null;
  order_id: string | null;
  product_type_id: string | null;
  product_name: string | null;
  account_email: string | null;
  account_password: string | null;
  expiration_date: string | null;
  case_type: SupportCaseType;
  screen_number: string | null;
  problem_description: string;
  status: SupportCaseStatus;
  admin_note: string | null;
  admin_response: string | null;
  created_at: string;
  updated_at: string;
  site_id?: string | null;
  shop_name?: string | null;
  center_case_id?: string | null;
  center_case_code?: string | null;
  center_synced_at?: string | null;
  center_sync_error?: string | null;
  handled_by_id?: string | null;
  handled_by_name?: string | null;
  handled_at?: string | null;
  claim_iteration?: number;
  previous_case_id?: string | null;
  is_disputed?: number | boolean;
  dispute_reason?: string | null;
  verified_warranty_status?: string | null;
  verified_remaining_days?: number | null;
};

export type SupportCase = {
  id: string;
  caseCode: string;
  userId: string | null;
  orderId: string | null;
  productTypeId: string | null;
  productName: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  expirationDate: string | null;
  caseType: SupportCaseType;
  screenNumber: string | null;
  problemDescription: string;
  status: SupportCaseStatus;
  adminNote: string | null;
  adminResponse: string | null;
  createdAt: string;
  updatedAt: string;
  attachments?: SupportCaseAttachment[];
  siteId?: string | null;
  shopName?: string | null;
  centerCaseId?: string | null;
  centerCaseCode?: string | null;
  centerSyncedAt?: string | null;
  centerSyncError?: string | null;
  centerSyncStatus?: SupportCaseCenterSyncStatus;
  centerStatusSyncState?: "synced" | "unavailable" | "not_found";
  centerStatusUpdatedAt?: string | null;
  handledById?: string | null;
  handledByName?: string | null;
  handledAt?: string | null;
  user?: SupportCaseUser | null;
  userName?: string | null;
  userEmail?: string | null;
  claimIteration?: number;
  previousCaseId?: string | null;
  previousCaseCode?: string | null;
  previousAdminResponse?: string | null;
  previousAdminNote?: string | null;
  isDisputed?: boolean;
  disputeReason?: string | null;
  verifiedWarrantyStatus?: 'active' | 'expiring_today' | 'expired' | 'not_found' | 'disputed' | null;
  verifiedRemainingDays?: number | null;
};

export type SupportCaseUser = {
  id: string;
  email: string;
  displayName: string | null;
  role?: string | null;
  userTier?: string | null;
  points?: number | null;
};

export type SupportCaseAttachment = {
  id: string;
  caseId: string;
  fileUrl: string;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
};

export type CreateSupportCaseInput = {
  orderId: string | null;
  productName: string | null;
  productTypeId: string | null;
  accountEmail: string | null;
  accountPassword: string | null;
  expirationDate: string | null;
  caseType: SupportCaseType;
  screenNumber: string | null;
  problemDescription: string;
  shopName?: string | null;
  claimIteration?: number;
  previousCaseId?: string | null;
  isDisputed?: boolean;
  disputeReason?: string | null;
  verifiedWarrantyStatus?: string | null;
  verifiedRemainingDays?: number | null;
  attachmentUrls?: string[];
};

export type UpdateSupportCaseInput = {
  status?: SupportCaseStatus;
  adminNote?: string | null;
  adminResponse?: string | null;
  handledById?: string | null;
  handledByName?: string | null;
  handledAt?: Date | null;
};


