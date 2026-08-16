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
  isActive?: boolean;
}

export interface Dish {
  id: string;
  name: string;
  description?: string;
  price: string;
  imageUrl?: string;
  isAvailable: boolean;
  vendor?: { id: string; businessName: string };
  category?: { id: string; name: string; slug: string };
  rating?: { average: number; count: number };
}

export type FoodOrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'DELIVERED_TO_BUS' | 'CANCELLED';

export interface FoodOrder {
  id: string;
  status: FoodOrderStatus;
  totalAmount: string;
  note?: string;
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
    dish: { id: string; name: string; imageUrl?: string };
  }[];
}
