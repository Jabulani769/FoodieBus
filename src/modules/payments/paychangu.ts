import { env } from '../../shared/config/env.js';
import { AppError } from '../../shared/errors/AppError.js';

export interface InitiateParams {
  amount: number;
  currency: 'MWK' | 'USD';
  txRef: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  meta?: Record<string, unknown>;
}

export interface InitiateResult {
  checkoutUrl: string;
  txRef: string;
}

export interface VerifyResult {
  status: 'success' | 'failed' | string;
  amount: number;
  currency: string;
  charges?: number;
  reference?: string;
  channel?: string;
  provider?: string;
}

interface PayChanguErrorBody {
  message?: string;
}

export class PayChanguClient {
  private get secretKey(): string {
    if (!env.PAYCHANGU_SECRET_KEY) {
      throw AppError.internal('PayChangu is not configured (PAYCHANGU_SECRET_KEY missing)');
    }
    return env.PAYCHANGU_SECRET_KEY;
  }

  async initiate(params: InitiateParams): Promise<InitiateResult> {
    const res = await fetch(`${env.PAYCHANGU_BASE_URL}/payment`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.secretKey}`,
      },
      body: JSON.stringify({
        amount: String(params.amount),
        currency: params.currency,
        tx_ref: params.txRef,
        first_name: params.firstName,
        last_name: params.lastName,
        email: params.email,
        callback_url: env.PAYCHANGU_CALLBACK_URL,
        return_url: env.PAYCHANGU_RETURN_URL,
        meta: params.meta ? JSON.stringify(params.meta) : undefined,
      }),
    });

    const json = (await res.json()) as {
      status?: string;
      message?: string;
      data?: { checkout_url?: string };
    };

    if (json.status !== 'success' || !json.data?.checkout_url) {
      throw AppError.paymentFailed(json.message ?? 'PayChangu could not initiate payment');
    }

    return { checkoutUrl: json.data.checkout_url, txRef: params.txRef };
  }

  async verify(txRef: string): Promise<VerifyResult> {
    const res = await fetch(`${env.PAYCHANGU_BASE_URL}/verify-payment/${txRef}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.secretKey}`,
      },
    });

    const json = (await res.json()) as {
      status?: string;
      message?: string;
      data?: {
        status?: string;
        amount?: number;
        currency?: string;
        charges?: number;
        reference?: string;
        authorization?: { channel?: string; provider?: string };
      };
    };

    if (json.status !== 'success') {
      throw AppError.paymentFailed(
        (json as PayChanguErrorBody).message ?? 'PayChangu verification failed',
      );
    }

    const d = json.data ?? {};
    return {
      status: d.status ?? 'failed',
      amount: Number(d.amount ?? 0),
      currency: d.currency ?? 'MWK',
      charges: d.charges !== undefined ? Number(d.charges) : undefined,
      reference: d.reference,
      channel: d.authorization?.channel,
      provider: d.authorization?.provider,
    };
  }
}

export const paychangu = new PayChanguClient();
