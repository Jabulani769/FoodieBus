import type { AxiosInstance } from 'axios';
import type {
  Booking,
  BookingStatus,
  Bus,
  Category,
  CreateRatingInput,
  Dish,
  Driver,
  DriverPayout,
  DriverPayoutStatus,
  FoodOrder,
  FoodOrderStatus,
  LoginResponse,
  Operator,
  Page,
  Payment,
  PlatformOverview,
  Rating,
  ReconciliationMismatch,
  Refund,
  RefundStatus,
  Route,
  Settlement,
  SettlementStatus,
  Trip,
  TripStatus,
  User,
  Vendor,
} from '@foodiebus/types';
import { unwrap, type ApiClientError } from './http.js';

export { createHttpClient, extractError } from './http.js';
export type { ApiClientError, ApiError, TokenStore, ClientOptions } from './http.js';

export interface NotificationItem {
  id: string;
  channel?: string | null;
  subject?: string | null;
  body: string;
  status?: string | null;
  reference?: string | null;
  referenceType?: string | null;
  createdAt: string;
}

export class Api {
  constructor(public readonly http: AxiosInstance) {}

  // ---- Auth ----
  async login(identifier: string, password: string): Promise<LoginResponse> {
    return unwrap(await this.http.post<LoginResponse>('/auth/login', { identifier, password }));
  }

  async logout(refreshToken: string): Promise<void> {
    await this.http.post('/auth/logout', { refreshToken });
  }

  async getMe(): Promise<User> {
    return unwrap(await this.http.get<User>('/auth/me'));
  }

  async updateMe(input: { fullName?: string; phone?: string }): Promise<{ id: string }> {
    return unwrap(await this.http.patch<{ id: string }>('/auth/me', input));
  }

  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ ok: boolean }> {
    return unwrap(await this.http.post<{ ok: boolean }>('/auth/change-password', input));
  }

  async forgotPassword(identifier: string): Promise<void> {
    await this.http.post('/auth/forgot-password', { identifier });
  }

  async resetPassword(
    identifier: string,
    code: string,
    newPassword: string,
  ): Promise<{ ok: boolean }> {
    return unwrap(await this.http.post('/auth/reset-password', { identifier, code, newPassword }));
  }

  async verifyInvite(email: string, code: string, newPassword: string): Promise<{ ok: boolean }> {
    return unwrap(await this.http.post('/auth/verify-invite', { email, code, newPassword }));
  }

  async inviteUser(input: {
    email: string;
    phone: string;
    fullName: string;
    role: string;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/auth/invite', input));
  }

  async createUser(input: {
    email: string;
    phone: string;
    fullName: string;
    password: string;
    role: string;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/users', input));
  }

  // ---- Food ----
  async listCategories(): Promise<{ items: Category[] }> {
    return unwrap(await this.http.get('/categories'));
  }

  async createCategory(input: {
    name: string;
    slug: string;
    sortOrder?: number;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/categories', input));
  }

  async updateCategory(
    id: string,
    input: Partial<{ name: string; slug: string; sortOrder: number; isActive: boolean }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/categories/${id}`, input));
  }

  async deleteCategory(id: string): Promise<void> {
    await this.http.delete(`/categories/${id}`);
  }

  async listVendors(params: { page?: number; limit?: number } = {}): Promise<Page<Vendor>> {
    return unwrap(await this.http.get('/vendors', { params }));
  }

  async getVendor(id: string): Promise<Vendor> {
    return unwrap(await this.http.get(`/vendors/${id}`));
  }

  async getVendorProfile(): Promise<Vendor> {
    return unwrap(await this.http.get('/vendors/me/profile'));
  }

  async updateVendorProfile(
    input: Partial<{ businessName: string; description: string; phone: string; logoUrl: string }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch('/vendors/me/profile', input));
  }

  async listDishes(
    vendorId: string,
    params: { page?: number; limit?: number; categoryId?: string; isAvailable?: string } = {},
  ): Promise<Page<Dish>> {
    return unwrap(await this.http.get(`/vendors/${vendorId}/dishes`, { params }));
  }

  async getDish(id: string): Promise<Dish> {
    return unwrap(await this.http.get(`/dishes/${id}`));
  }

  async createDish(input: {
    categoryId: string;
    name: string;
    description?: string;
    price: number;
    imageUrl?: string;
    sortOrder?: number;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/dishes', input));
  }

  async updateDish(
    id: string,
    input: Partial<{
      categoryId: string;
      name: string;
      description: string;
      price: number;
      imageUrl: string;
      sortOrder: number;
    }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/dishes/${id}`, input));
  }

  async deleteDish(id: string): Promise<void> {
    await this.http.delete(`/dishes/${id}`);
  }

  async setDishAvailability(
    id: string,
    input: { isAvailable: boolean; availableFrom?: string; availableTo?: string },
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/dishes/${id}/availability`, input));
  }

  // ---- Bus ----
  async listOperators(params: { page?: number; limit?: number } = {}): Promise<Page<Operator>> {
    return unwrap(await this.http.get('/operators', { params }));
  }

  async getOperator(id: string): Promise<Operator> {
    return unwrap(await this.http.get(`/operators/${id}`));
  }

  async getOperatorProfile(): Promise<Operator> {
    return unwrap(await this.http.get('/operators/me/profile'));
  }

  async updateOperatorProfile(
    input: Partial<{
      businessName: string;
      description: string;
      phone: string;
      logoUrl: string;
      licenseNumber: string;
    }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch('/operators/me/profile', input));
  }

  async listOperatorBuses(operatorId: string): Promise<{ items: Bus[] }> {
    return unwrap(await this.http.get(`/operators/${operatorId}/buses`));
  }

  async createBus(input: {
    name: string;
    plateNumber: string;
    capacity: number;
    busType?: string;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/buses', input));
  }

  async updateBus(
    id: string,
    input: Partial<{
      name: string;
      plateNumber: string;
      capacity: number;
      busType: string;
      isActive: boolean;
    }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/buses/${id}`, input));
  }

  async deleteBus(id: string): Promise<void> {
    await this.http.delete(`/buses/${id}`);
  }

  async listRoutes(): Promise<{ items: Route[] }> {
    return unwrap(await this.http.get('/bus-routes'));
  }

  async createRoute(input: {
    fromCity: string;
    toCity: string;
    basePrice: number;
    distanceKm?: number;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/bus-routes', input));
  }

  async updateRoute(
    id: string,
    input: Partial<{
      fromCity: string;
      toCity: string;
      basePrice: number;
      distanceKm: number;
      isActive: boolean;
    }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/bus-routes/${id}`, input));
  }

  async deleteRoute(id: string): Promise<void> {
    await this.http.delete(`/bus-routes/${id}`);
  }

  async searchTrips(
    params: {
      page?: number;
      limit?: number;
      fromCity?: string;
      toCity?: string;
      date?: string;
    } = {},
  ): Promise<Page<Trip>> {
    return unwrap(await this.http.get('/trips/search', { params }));
  }

  async getTrip(id: string): Promise<Trip> {
    return unwrap(await this.http.get(`/trips/${id}`));
  }

  async createTrip(input: {
    routeId: string;
    busId: string;
    departureTime: string;
    arrivalTime: string;
    price: number;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/trips', input));
  }

  async updateTrip(
    id: string,
    input: Partial<{ departureTime: string; arrivalTime: string; price: number }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/trips/${id}`, input));
  }

  async updateTripStatus(id: string, status: TripStatus): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/trips/${id}/status`, { status }));
  }

  async deleteTrip(id: string): Promise<void> {
    await this.http.delete(`/trips/${id}`);
  }

  async createBooking(input: {
    tripId: string;
    seatNumber: string;
    passengerName: string;
    passengerPhone: string;
  }): Promise<{ id: string }> {
    return unwrap(await this.http.post('/bookings', input));
  }

  async listMyBookings(): Promise<{ items: Booking[] }> {
    return unwrap(await this.http.get('/bookings/me'));
  }

  async cancelBooking(id: string): Promise<{ id: string }> {
    return unwrap(await this.http.post(`/bookings/${id}/cancel`));
  }

  // ---- Drivers ----
  async listDrivers(): Promise<{ items: Driver[] }> {
    return unwrap(await this.http.get('/drivers/me'));
  }

  async createDriver(input: {
    fullName: string;
    phone: string;
    email: string;
    password: string;
    licenseNumber?: string;
  }): Promise<{ id: string; userId: string }> {
    return unwrap(await this.http.post('/drivers', input));
  }

  async updateDriver(
    id: string,
    input: Partial<{ fullName: string; licenseNumber: string; phone: string }>,
  ): Promise<Driver> {
    return unwrap(await this.http.patch(`/drivers/${id}`, input));
  }

  async deactivateDriver(id: string): Promise<{ id: string }> {
    return unwrap(await this.http.delete(`/drivers/${id}`));
  }

  async assignDriver(tripId: string, driverId: string): Promise<{ id: string }> {
    return unwrap(await this.http.post(`/trips/${tripId}/assign-driver`, { driverId }));
  }

  async checkInPassenger(tripId: string, bookingId: string): Promise<unknown> {
    return unwrap(await this.http.post(`/trips/${tripId}/check-in`, { bookingId }));
  }

  async getManifest(tripId: string): Promise<unknown> {
    return unwrap(await this.http.get(`/trips/${tripId}/manifest`));
  }

  async updateTripLocation(
    tripId: string,
    lat: number,
    lng: number,
  ): Promise<{ tripId: string; lat: number; lng: number; updatedAt: string }> {
    return unwrap(await this.http.patch(`/trips/${tripId}/location`, { lat, lng }));
  }

  async getTripLocation(
    tripId: string,
  ): Promise<{ tripId: string; lat: number; lng: number; updatedAt: string; stale: boolean }> {
    return unwrap(await this.http.get(`/trips/${tripId}/location`));
  }

  // ---- Food orders ----
  async placeFoodOrder(input: {
    bookingId: string;
    items: { dishId: string; quantity: number }[];
    note?: string;
  }): Promise<FoodOrder> {
    return unwrap(await this.http.post('/food-orders', input));
  }

  async listMyFoodOrders(): Promise<{ items: FoodOrder[] }> {
    return unwrap(await this.http.get('/food-orders/me'));
  }

  async getFoodOrder(id: string): Promise<FoodOrder> {
    return unwrap(await this.http.get(`/food-orders/${id}`));
  }

  async listVendorOrders(
    vendorId: string,
    params: { page?: number; limit?: number; status?: FoodOrderStatus } = {},
  ): Promise<{ items: FoodOrder[]; total: number }> {
    return unwrap(await this.http.get(`/vendors/${vendorId}/orders`, { params }));
  }

  async updateFoodOrderStatus(id: string, status: FoodOrderStatus): Promise<FoodOrder> {
    return unwrap(await this.http.patch(`/food-orders/${id}/status`, { status }));
  }

  // ---- Payments ----
  async createPayment(bookingId: string): Promise<Payment & { checkoutUrl: string }> {
    return unwrap(await this.http.post('/payments', { bookingId }));
  }

  async listMyPayments(): Promise<{ items: Payment[] }> {
    return unwrap(await this.http.get('/payments/me'));
  }

  async listPayments(params: { limit?: number } = {}): Promise<{
    items: Array<Payment & { passenger?: { id: string; fullName: string; email: string } }>;
  }> {
    return unwrap(await this.http.get('/financial/payments', { params }));
  }

  async getPayment(id: string): Promise<Payment> {
    return unwrap(await this.http.get(`/payments/${id}`));
  }

  async verifyPayment(id: string): Promise<{ id: string; txRef: string; status: string }> {
    return unwrap(await this.http.post(`/payments/${id}/verify`));
  }

  // ---- Ratings ----
  async createRating(input: CreateRatingInput): Promise<{ id: string }> {
    return unwrap(await this.http.post('/ratings', input));
  }

  async listRatings(
    params: { entityType?: string; entityId?: string; page?: number; limit?: number } = {},
  ): Promise<Page<Rating>> {
    return unwrap(await this.http.get('/ratings', { params }));
  }

  async updateRating(
    id: string,
    input: Partial<{ score: number; comment: string }>,
  ): Promise<{ id: string }> {
    return unwrap(await this.http.patch(`/ratings/${id}`, input));
  }

  async deleteRating(id: string): Promise<void> {
    await this.http.delete(`/ratings/${id}`);
  }

  // ---- Admin ----
  async getAdminDashboard(): Promise<unknown> {
    return unwrap(await this.http.get('/admin/dashboard'));
  }

  async listUsers(
    params: { page?: number; limit?: number; role?: string; search?: string } = {},
  ): Promise<Page<User>> {
    return unwrap(await this.http.get('/admin/users', { params }));
  }

  async getUser(id: string): Promise<unknown> {
    return unwrap(await this.http.get(`/admin/users/${id}`));
  }

  async toggleUserStatus(id: string): Promise<{ id: string; isActive: boolean }> {
    return unwrap(await this.http.patch(`/admin/users/${id}/status`));
  }

  async deleteUser(id: string): Promise<{ id: string }> {
    return unwrap(await this.http.delete(`/admin/users/${id}`));
  }

  async approveVendor(id: string): Promise<{ id: string; isActive: boolean }> {
    return unwrap(await this.http.patch(`/admin/vendors/${id}/approve`));
  }

  async approveOperator(id: string): Promise<{ id: string; isActive: boolean }> {
    return unwrap(await this.http.patch(`/admin/operators/${id}/approve`));
  }

  async listAuditLogs(
    params: {
      page?: number;
      limit?: number;
      actorId?: string;
      action?: string;
      entity?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<Page<unknown>> {
    return unwrap(await this.http.get('/admin/audit-logs', { params }));
  }

  async listSettings(): Promise<unknown[]> {
    return unwrap(await this.http.get('/admin/settings'));
  }

  async upsertSetting(key: string, value: unknown): Promise<unknown> {
    return unwrap(await this.http.put(`/admin/settings/${key}`, { value }));
  }

  // ---- Financial ----
  async listRefunds(
    params: {
      page?: number;
      limit?: number;
      status?: RefundStatus;
      from?: string;
      to?: string;
    } = {},
  ): Promise<Page<Refund>> {
    return unwrap(await this.http.get('/financial/refunds', { params }));
  }

  async createRefund(input: {
    paymentId: string;
    amount: number;
    reason: string;
  }): Promise<Refund> {
    return unwrap(await this.http.post('/financial/refunds', input));
  }

  async getRefund(id: string): Promise<Refund> {
    return unwrap(await this.http.get(`/financial/refunds/${id}`));
  }

  async approveRefund(id: string): Promise<Refund> {
    return unwrap(await this.http.patch(`/financial/refunds/${id}/approve`));
  }

  async rejectRefund(id: string, reason: string): Promise<Refund> {
    return unwrap(await this.http.patch(`/financial/refunds/${id}/reject`, { reason }));
  }

  async processRefund(id: string): Promise<Refund> {
    return unwrap(await this.http.post(`/financial/refunds/${id}/process`));
  }

  async getRevenue(from: string, to: string): Promise<unknown> {
    return unwrap(await this.http.get('/financial/reports/revenue', { params: { from, to } }));
  }

  async getRevenueByRoute(from: string, to: string): Promise<unknown> {
    return unwrap(
      await this.http.get('/financial/reports/revenue/by-route', { params: { from, to } }),
    );
  }

  async getRevenueByOperator(from: string, to: string): Promise<unknown> {
    return unwrap(
      await this.http.get('/financial/reports/revenue/by-operator', { params: { from, to } }),
    );
  }

  async listSettlements(
    params: {
      page?: number;
      limit?: number;
      operatorId?: string;
      vendorId?: string;
      period?: string;
      status?: SettlementStatus;
    } = {},
  ): Promise<Page<Settlement>> {
    return unwrap(await this.http.get('/financial/settlements', { params }));
  }

  async generateSettlements(period: string): Promise<unknown> {
    return unwrap(await this.http.post('/financial/settlements/generate', { period }));
  }

  async paySettlement(id: string): Promise<Settlement> {
    return unwrap(await this.http.patch(`/financial/settlements/${id}/pay`));
  }

  async listDriverPayouts(
    params: { page?: number; limit?: number; driverId?: string; status?: DriverPayoutStatus } = {},
  ): Promise<Page<DriverPayout>> {
    return unwrap(await this.http.get('/financial/driver-payouts', { params }));
  }

  async payDriverPayout(id: string): Promise<DriverPayout> {
    return unwrap(await this.http.patch(`/financial/driver-payouts/${id}/pay`));
  }

  async listMismatches(
    params: { page?: number; limit?: number; resolved?: string } = {},
  ): Promise<Page<ReconciliationMismatch>> {
    return unwrap(await this.http.get('/financial/reconciliation/mismatches', { params }));
  }

  async resolveMismatch(id: string): Promise<ReconciliationMismatch> {
    return unwrap(await this.http.patch(`/financial/reconciliation/mismatches/${id}/resolve`));
  }

  // ---- Analytics ----
  async platformOverview(from: string, to: string): Promise<PlatformOverview> {
    return unwrap(await this.http.get('/analytics/platform/overview', { params: { from, to } }));
  }

  async platformGrowth(
    from: string,
    to: string,
    granularity = 'daily',
  ): Promise<{
    granularity: string;
    items: { period: string; users: number; bookings: number; revenue: string }[];
  }> {
    return unwrap(
      await this.http.get('/analytics/platform/growth', { params: { from, to, granularity } }),
    );
  }

  async tripUtilization(
    from: string,
    to: string,
    filters: { routeId?: string; operatorId?: string } = {},
  ): Promise<{ items: unknown[] }> {
    return unwrap(
      await this.http.get('/analytics/utilization/trips', { params: { from, to, ...filters } }),
    );
  }

  async routeUtilization(from: string, to: string): Promise<{ items: unknown[] }> {
    return unwrap(await this.http.get('/analytics/utilization/routes', { params: { from, to } }));
  }

  async operatorUtilization(from: string, to: string): Promise<{ items: unknown[] }> {
    return unwrap(
      await this.http.get('/analytics/utilization/operators', { params: { from, to } }),
    );
  }

  async bookingFunnel(from: string, to: string): Promise<unknown> {
    return unwrap(await this.http.get('/analytics/funnel/bookings', { params: { from, to } }));
  }

  async paymentFunnel(from: string, to: string): Promise<unknown> {
    return unwrap(await this.http.get('/analytics/funnel/payments', { params: { from, to } }));
  }

  async passengerOverview(from: string, to: string): Promise<unknown> {
    return unwrap(await this.http.get('/analytics/passengers/overview', { params: { from, to } }));
  }

  async topPassengers(
    from: string,
    to: string,
    params: { sortBy?: string; limit?: number } = {},
  ): Promise<{ items: unknown[] }> {
    return unwrap(
      await this.http.get('/analytics/passengers/top', { params: { from, to, ...params } }),
    );
  }

  async notificationDeliveryRate(from: string, to: string): Promise<{ items: unknown[] }> {
    return unwrap(
      await this.http.get('/analytics/notifications/delivery-rate', { params: { from, to } }),
    );
  }

  async notificationFailures(from: string, to: string): Promise<{ items: unknown[] }> {
    return unwrap(
      await this.http.get('/analytics/notifications/failures', { params: { from, to } }),
    );
  }

  async refundSummary(from: string, to: string): Promise<unknown> {
    return unwrap(await this.http.get('/analytics/refunds/summary', { params: { from, to } }));
  }

  // ---- Notifications ----
  async getMyNotifications(
    page = 1,
    limit = 20,
  ): Promise<{ items: NotificationItem[]; total: number }> {
    return unwrap(
      await this.http.get<{ items: NotificationItem[]; total: number }>('/notifications/me', {
        params: { page, limit },
      }),
    );
  }

  async markNotificationRead(id: string): Promise<{ id: string }> {
    return unwrap(await this.http.patch<{ id: string }>(`/notifications/${id}/read`));
  }

  async getNotificationPreferences(): Promise<{
    sms: boolean;
    whatsapp: boolean;
    email: boolean;
  }> {
    return unwrap(await this.http.get('/notifications/preferences'));
  }

  async updateNotificationPreferences(input: {
    sms?: boolean;
    whatsapp?: boolean;
    email?: boolean;
  }): Promise<{ sms: boolean; whatsapp: boolean; email: boolean }> {
    return unwrap(await this.http.put('/notifications/preferences', input));
  }
}
