-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "txRef" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationMismatch" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "localStatus" TEXT NOT NULL,
    "remoteStatus" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationMismatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEvent_txRef_idx" ON "WebhookEvent"("txRef");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_txRef_event_key" ON "WebhookEvent"("txRef", "event");

-- CreateIndex
CREATE INDEX "ReconciliationMismatch_resolved_idx" ON "ReconciliationMismatch"("resolved");

-- CreateIndex
CREATE INDEX "ReconciliationMismatch_createdAt_idx" ON "ReconciliationMismatch"("createdAt");

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_txRef_fkey" FOREIGN KEY ("txRef") REFERENCES "Payment"("txRef") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMismatch" ADD CONSTRAINT "ReconciliationMismatch_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

