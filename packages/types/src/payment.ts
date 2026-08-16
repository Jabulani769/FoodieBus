export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface Payment {
  id: string;
  txRef: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  checkoutUrl?: string;
  createdAt: string;
}

export interface CreatePaymentResponse extends Payment {
  checkoutUrl: string;
}

export interface UploadResponse {
  url: string;
  key: string;
}
