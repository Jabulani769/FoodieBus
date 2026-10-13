import { prisma } from './db/prisma.js';

export type VendorStatus = 'OPEN' | 'CLOSED' | 'BUSY';

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export async function getVendorStatus(
  vendorId: string,
  now = new Date(),
): Promise<{ status: VendorStatus; isOpen: boolean; label: string }> {
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorId },
    select: { isActive: true, isPaused: true },
  });
  if (!vendor || !vendor.isActive) {
    return { status: 'CLOSED', isOpen: false, label: 'Currently Closed' };
  }
  if (vendor.isPaused) {
    return { status: 'BUSY', isOpen: false, label: 'Busy - Not Accepting Orders' };
  }
  const day = now.getDay();
  const hours = await prisma.vendorOperatingHours.findUnique({
    where: { vendorId_dayOfWeek: { vendorId, dayOfWeek: day } },
  });
  if (hours) {
    if (hours.isClosed) {
      return { status: 'CLOSED', isOpen: false, label: 'Currently Closed' };
    }
    const cur = now.getHours() * 60 + now.getMinutes();
    const open = toMinutes(hours.openTime);
    const close = toMinutes(hours.closeTime);
    // Handles overnight spans (e.g. 18:00-02:00)
    const inside = close > open ? cur >= open && cur < close : cur >= open || cur < close;
    if (!inside) {
      return { status: 'CLOSED', isOpen: false, label: 'Currently Closed' };
    }
  }
  return { status: 'OPEN', isOpen: true, label: 'Open' };
}

export async function assertVendorAcceptingOrders(vendorId: string): Promise<void> {
  const { AppError } = await import('./errors/AppError.js');
  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorId } });
  if (!vendor || !vendor.isActive) {
    throw AppError.conflict('Store is Currently Closed');
  }
  if (vendor.isPaused) {
    throw AppError.conflict('Store is Busy - Not Accepting Orders');
  }
  const { isOpen } = await getVendorStatus(vendorId);
  if (!isOpen) {
    throw AppError.conflict('Store is Currently Closed');
  }
}
