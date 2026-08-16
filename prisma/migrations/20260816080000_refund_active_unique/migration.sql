-- Prevent more than one active (REQUESTED/APPROVED) refund per payment.
-- PROCESSED/FAILED refunds are excluded so the full sequence
-- (request -> approve -> process) and partial refunds keep working.
CREATE UNIQUE INDEX "Refund_paymentId_status_active_key"
  ON "Refund"("paymentId")
  WHERE "status" IN ('REQUESTED', 'APPROVED');
