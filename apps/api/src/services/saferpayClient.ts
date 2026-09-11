import { env } from '../config/env.js';

export interface SaferpayCredentials {
  customerId: string;
  terminalId: string;
  username: string;
  password: string;
  testMode?: boolean;
}

export interface InitializePaymentPageParams {
  orderId: string;
  orderNumber: number;
  amount: number; // in grosze / cents (e.g. 4950 = 49.50 PLN)
  currency: string;
  method?: string;
  returnUrl: string;
  credentials?: SaferpayCredentials;
}

export interface InitializePaymentPageResult {
  success: boolean;
  token?: string;
  redirectUrl?: string;
  expiration?: string;
  error?: string;
}

export interface AssertPaymentPageResult {
  success: boolean;
  transactionId?: string;
  status?: string;
  paymentMeans?: any;
  payer?: any;
  error?: string;
}

export interface CaptureTransactionResult {
  success: boolean;
  status?: string;
  captureId?: string;
  error?: string;
}

function getCredentials(custom?: SaferpayCredentials): SaferpayCredentials {
  return {
    customerId: custom?.customerId || env.SAFERPAY_CUSTOMER_ID,
    terminalId: custom?.terminalId || env.SAFERPAY_TERMINAL_ID,
    username: custom?.username || env.SAFERPAY_API_USERNAME,
    password: custom?.password || env.SAFERPAY_API_PASSWORD,
    testMode: custom?.testMode ?? env.SAFERPAY_TEST_MODE,
  };
}

function getBaseUrl(testMode: boolean): string {
  return testMode ? 'https://test.saferpay.com/api' : 'https://www.saferpay.com/api';
}

function buildHeaders(creds: SaferpayCredentials) {
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${auth}`,
  };
}

/**
 * Step 1: Initialize PaymentPage
 * Generates a Saferpay Token and RedirectUrl for web browser checkout.
 */
export async function initializePaymentPage(
  params: InitializePaymentPageParams
): Promise<InitializePaymentPageResult> {
  const creds = getCredentials(params.credentials);
  const baseUrl = getBaseUrl(creds.testMode ?? true);
  const url = `${baseUrl}/Payment/v1/PaymentPage/Initialize`;

  let paymentMethods: string[] | undefined;
  let wallets: string[] | undefined;

  if (params.method === 'blik') {
    paymentMethods = ['BLIK'];
  } else if (params.method === 'card') {
    paymentMethods = ['VISA', 'MASTERCARD'];
  } else if (params.method === 'apple_pay' || params.method === 'google_pay') {
    wallets = ['APPLEPAY', 'GOOGLEPAY'];
  } else {
    paymentMethods = ['BLIK', 'VISA', 'MASTERCARD'];
    wallets = ['APPLEPAY', 'GOOGLEPAY'];
  }

  const payload: any = {
    RequestHeader: {
      SpecVersion: '1.45',
      CustomerId: creds.customerId,
      RequestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      RetryIndicator: 0,
    },
    TerminalId: creds.terminalId,
    Payment: {
      Amount: {
        Value: params.amount,
        CurrencyCode: params.currency.toUpperCase(),
      },
      OrderId: String(params.orderNumber || params.orderId),
      Description: `Zamówienie #${params.orderNumber}`,
    },
    ReturnUrl: {
      Url: params.returnUrl,
    },
  };

  if (paymentMethods && paymentMethods.length > 0) {
    payload.PaymentMethods = paymentMethods;
  }
  if (wallets && wallets.length > 0) {
    payload.Wallets = wallets;
  }

  try {
    console.log(`[Saferpay] Initializing PaymentPage for Order #${params.orderNumber} (${params.amount} ${params.currency})`);
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(creds),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json();

    if (res.ok && data.Token && data.RedirectUrl) {
      console.log(`[Saferpay] Initialized: token=${data.Token}, redirectUrl=${data.RedirectUrl}`);
      return {
        success: true,
        token: data.Token,
        redirectUrl: data.RedirectUrl,
        expiration: data.Expiration,
      };
    }

    console.error(`[Saferpay] Initialize failed (HTTP ${res.status}):`, JSON.stringify(data));
    return {
      success: false,
      error: data.ErrorMessage || data.ErrorName || `HTTP ${res.status}`,
    };
  } catch (err: any) {
    console.error(`[Saferpay] Initialize exception:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Step 2: Assert PaymentPage
 * Checks payment status after the customer returns from the Saferpay RedirectUrl.
 */
export async function assertPaymentPage(
  token: string,
  customCreds?: SaferpayCredentials
): Promise<AssertPaymentPageResult> {
  const creds = getCredentials(customCreds);
  const baseUrl = getBaseUrl(creds.testMode ?? true);
  const url = `${baseUrl}/Payment/v1/PaymentPage/Assert`;

  const payload = {
    RequestHeader: {
      SpecVersion: '1.45',
      CustomerId: creds.customerId,
      RequestId: `assert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      RetryIndicator: 0,
    },
    Token: token,
  };

  try {
    console.log(`[Saferpay] Asserting PaymentPage for token: ${token}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(creds),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json();

    if (res.ok && data.Transaction) {
      const tx = data.Transaction;
      console.log(`[Saferpay] Assert OK: txId=${tx.Id}, status=${tx.Status}`);
      return {
        success: true,
        transactionId: tx.Id,
        status: tx.Status,
        paymentMeans: data.PaymentMeans,
        payer: data.Payer,
      };
    }

    console.error(`[Saferpay] Assert failed (HTTP ${res.status}):`, JSON.stringify(data));
    return {
      success: false,
      error: data.ErrorMessage || data.ErrorName || `HTTP ${res.status}`,
    };
  } catch (err: any) {
    console.error(`[Saferpay] Assert exception:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Step 3: Capture Transaction
 * Finalizes the payment if status is AUTHORIZED.
 */
export async function captureTransaction(
  transactionId: string,
  customCreds?: SaferpayCredentials
): Promise<CaptureTransactionResult> {
  const creds = getCredentials(customCreds);
  const baseUrl = getBaseUrl(creds.testMode ?? true);
  const url = `${baseUrl}/Payment/v1/Transaction/Capture`;

  const payload = {
    RequestHeader: {
      SpecVersion: '1.45',
      CustomerId: creds.customerId,
      RequestId: `cap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      RetryIndicator: 0,
    },
    TransactionReference: {
      TransactionId: transactionId,
    },
  };

  try {
    console.log(`[Saferpay] Capturing transaction: ${transactionId}`);
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(creds),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await res.json();

    if (res.ok) {
      console.log(`[Saferpay] Capture OK: status=${data.Status}, captureId=${data.CaptureId}`);
      return {
        success: true,
        status: data.Status,
        captureId: data.CaptureId,
      };
    }

    console.error(`[Saferpay] Capture failed (HTTP ${res.status}):`, JSON.stringify(data));
    return {
      success: false,
      error: data.ErrorMessage || data.ErrorName || `HTTP ${res.status}`,
    };
  } catch (err: any) {
    console.error(`[Saferpay] Capture exception:`, err.message);
    return { success: false, error: err.message };
  }
}
