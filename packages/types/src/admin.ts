export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: unknown;
  ipAddress?: string;
  createdAt: string;
  actor?: { id: string; fullName: string; email: string };
}

export interface PlatformSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface AdminDashboardStats {
  [key: string]: unknown;
}
