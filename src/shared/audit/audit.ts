import { prisma } from '../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

export interface AuditLogInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      details: input.details ?? undefined,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
