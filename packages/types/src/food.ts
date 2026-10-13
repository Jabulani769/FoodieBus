export interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Vendor {
  id: string;
  businessName: string;
  description?: string;
  phone?: string;
  logoUrl?: string;
  bannerUrl?: string;
  cuisineType?: string;
  deliveryTime?: number | null;
  deliveryRadiusKm?: number | null;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isActive?: boolean;
  isPaused?: boolean;
  storeStatus?: 'OPEN' | 'CLOSED' | 'BUSY';
  storeLabel?: string;
  isOpen?: boolean;
  distanceKm?: number | null;
  distanceM?: number | null;
  etaMin?: number | null;
  distanceLabel?: string | null;
}

export interface VendorHours {
  id: string;
  vendorId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface DishOption {
  id: string;
  label: string;
  priceDelta: string;
  sortOrder: number;
  isActive: boolean;
}

export interface DishOptionGroup {
  id: string;
  name: string;
  type: 'SINGLE' | 'MULTI';
  isRequired: boolean;
  minSelect: number;
  maxSelect?: number | null;
  sortOrder: number;
  isActive: boolean;
  options: DishOption[];
}

export interface Dish {
  id: string;
  name: string;
  description?: string;
  price: string;
  imageUrl?: string;
  isAvailable: boolean;
  badge?: string | null;
  locked?: boolean;
  vendor?: { id: string; businessName: string };
  category?: { id: string; name: string; slug: string };
  optionGroups?: DishOptionGroup[];
  rating?: { average: number; count: number };
}

export interface MenuGroup {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  items: Dish[];
}

export type PromotionStatus = 'PENDING_PAYMENT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface Promotion {
  id: string;
  vendorId: string;
  dishId: string;
  headline: string;
  description?: string | null;
  imageUrl?: string | null;
  days: number;
  amountMWK: string;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  txRef?: string | null;
  daysLeft?: number;
  dish?: { id: string; name: string; price: string; imageUrl?: string | null };
}

export interface ActivePromotion {
  id: string;
  headline: string;
  description?: string | null;
  imageUrl?: string | null;
  startsAt: string;
  endsAt: string;
  daysLeft: number;
  dish: { id: string; name: string; price: string; imageUrl?: string | null };
  vendor: { id: string; businessName: string; logoUrl?: string | null; city?: string | null };
}

export interface PromotionInlineParams {
  id: string;
  txRef: string;
  amountMWK: string;
  currency: 'MWK';
  publicKey: string;
  callbackUrl?: string;
  returnUrl?: string;
  customer: { email?: string; firstName?: string; lastName?: string };
  customization: { title: string; description?: string };
  meta: { kind: 'promotion'; promotionId: string; vendorId: string };
}

export type FoodOrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'DELIVERED_TO_BUS' | 'CANCELLED';

export interface SelectedOption {
  groupId: string;
  optionIds: string[];
}

export interface FoodOrder {
  id: string;
  status: FoodOrderStatus;
  totalAmount: string;
  note?: string;
  prepMinutes?: number | null;
  estimatedReadyAt?: string | null;
  acceptedAt?: string | null;
  readyAt?: string | null;
  trackerMessage?: string;
  createdAt: string;
  vendor: { id: string; businessName: string };
  booking: {
    id: string;
    trip: {
      id: string;
      departureTime: string;
      route: { fromCity: string; toCity: string };
      operator: { businessName: string };
    };
  };
  passenger: { id: string; fullName: string; phone: string };
  items: {
    id: string;
    quantity: number;
    unitPrice: string;
    lineTotal?: string | null;
    selectedOptions?: SelectedOption[] | null;
    dish: { id: string; name: string; imageUrl?: string };
  }[];
}
