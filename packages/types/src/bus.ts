export interface Operator {
  id: string;
  businessName: string;
  description?: string;
  phone?: string;
  logoUrl?: string;
  licenseNumber?: string;
  isActive?: boolean;
}

export interface Bus {
  id: string;
  name: string;
  plateNumber: string;
  capacity: number;
  busType: 'STANDARD' | 'VIP' | 'EXECUTIVE';
  isActive: boolean;
}

export interface Route {
  id: string;
  fromCity: string;
  toCity: string;
  basePrice: string;
  distanceKm?: number;
  isActive?: boolean;
}

export type TripStatus = 'SCHEDULED' | 'BOARDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';

export interface Trip {
  id: string;
  departureTime: string;
  arrivalTime: string;
  price: string;
  status: TripStatus;
  operator: { id: string; businessName: string };
  route: { fromCity: string; toCity: string };
  bus?: { id: string; name: string };
  seats?: Seat[];
  rating?: { average: number; count: number };
}

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface Seat {
  id: string;
  seatNumber: string;
  status: SeatStatus;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export interface Booking {
  id: string;
  status: BookingStatus;
  totalAmount: string;
  createdAt: string;
  passengerName: string;
  passengerPhone: string;
  seat?: { id: string; seatNumber: string };
  trip: {
    id: string;
    departureTime: string;
    arrivalTime: string;
    price: string;
    route: { fromCity: string; toCity: string };
  };
}

export interface Driver {
  id: string;
  userId: string;
  licenseNumber?: string;
  phone?: string;
  isActive: boolean;
  user: { id: string; fullName: string; email: string; phone: string };
}

export interface TripManifest {
  tripId: string;
  route: string;
  driver: string | null;
  totalConfirmed: number;
  checkedIn: number;
  passengers: (Booking & { checkedInAt: string | null })[];
}
