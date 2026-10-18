import { env } from '../config/env.js';
import { OrderDetail } from '@rycos/shared';

export interface SendReceiptEmailParams {
  order: OrderDetail;
  recipientEmail: string;
}

export async function sendReceiptEmail({ order, recipientEmail }: SendReceiptEmailParams): Promise<{ success: boolean; id?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Usługa wysyłki e-maili nie jest skonfigurowana (brak klucza RESEND_API_KEY).');
  }

  const itemsHtml = order.items
    .map((it) => {
      const addonsText =
        it.addons && it.addons.length > 0
          ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">+ ${it.addons.map((a: any) => a.name).join(', ')}</div>`
          : '';
      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 12px 8px; font-weight: 600; color: #0f172a;">${it.quantity}x ${it.name}${addonsText}</td>
          <td style="padding: 12px 8px; text-align: right; font-weight: 700; color: #0f172a; white-space: nowrap;">${(it.lineTotal ?? it.quantity * it.unitPrice).toFixed(2)} ${order.currency}</td>
        </tr>
      `;
    })
    .join('');

  const fiscalNumberSection = order.fiscalReceiptNumber
    ? `
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin: 20px 0; text-align: center;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Numer e-Paragonu Fiskalnego</div>
        <div style="font-size: 18px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 4px;">${order.fiscalReceiptNumber}</div>
      </div>
    `
    : '';

  const pdfDownloadSection = order.fiscalPdfUrl
    ? `
      <div style="text-align: center; margin: 24px 0 12px 0;">
        <a href="${order.fiscalPdfUrl}" target="_blank" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 10px;">
          Pobierz oficjalny PDF e-Paragonu
        </a>
      </div>
    `
    : '';

  const onlineOrderLink = `${env.PUBLIC_CUSTOMER_URL}/order/${order.id}`;

  const html = `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="utf-8">
      <title>E-Paragon do zamówienia #${order.orderNumber}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #334155;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em;">${order.brandName || 'RYCOS'}</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8;">E-Paragon do zamówienia #${order.orderNumber}</p>
        </div>

        <div style="padding: 24px;">
          ${fiscalNumberSection}

          <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 10px;">
            <thead>
              <tr style="border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase;">
                <th style="padding: 8px; text-align: left;">Pozycja</th>
                <th style="padding: 8px; text-align: right;">Razem</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              ${
                order.tipAmount > 0
                  ? `
                <tr>
                  <td style="padding: 10px 8px 4px 8px; color: #64748b;">Napiwek:</td>
                  <td style="padding: 10px 8px 4px 8px; text-align: right; font-weight: 700; color: #0f172a;">${order.tipAmount.toFixed(2)} ${order.currency}</td>
                </tr>
              `
                  : ''
              }
              <tr>
                <td style="padding: 14px 8px; font-size: 16px; font-weight: 900; color: #0f172a; border-top: 2px solid #e2e8f0;">SUMA:</td>
                <td style="padding: 14px 8px; text-align: right; font-size: 18px; font-weight: 900; color: #0f172a; border-top: 2px solid #e2e8f0;">${order.totalAmount.toFixed(2)} ${order.currency}</td>
              </tr>
            </tfoot>
          </table>

          ${
            order.customerNip
              ? `
            <div style="margin-top: 16px; font-size: 12px; color: #64748b;">
              NIP Nabywcy: <strong style="color: #0f172a;">${order.customerNip}</strong>
            </div>
          `
              : ''
          }

          ${pdfDownloadSection}

          <div style="text-align: center; margin-top: 20px;">
            <a href="${onlineOrderLink}" style="font-size: 13px; color: #2563eb; text-decoration: underline;">
              Zobacz szczegóły i status zamówienia online
            </a>
          </div>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
          Wiadomość wygenerowana automatycznie przez system RYCOS.<br/>
          W razie pytań prosimy o kontakt z obsługą lokalu.
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || 'no-reply@receipts.rycos.eu',
      to: [recipientEmail],
      subject: `E-Paragon do zamówienia #${order.orderNumber} - ${order.brandName || 'RYCOS'}`,
      html,
    }),
  });

  const resJson: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = resJson?.message || resJson?.error || `Błąd Resend (${response.status})`;
    throw new Error(`Nie udało się wysłać e-maila: ${errorMsg}`);
  }

  return { success: true, id: resJson?.id };
}

export interface SendVerificationEmailParams {
  recipientEmail: string;
  name?: string;
  companyName: string;
  verifyUrl: string;
}

export async function sendAccountVerificationEmail({
  recipientEmail,
  name,
  companyName,
  verifyUrl,
}: SendVerificationEmailParams): Promise<{ success: boolean; id?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Usługa wysyłki e-maili nie jest skonfigurowana (brak klucza RESEND_API_KEY).');
  }

  const greeting = name ? `Cześć ${name},` : 'Dzień dobry,';

  const html = `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="utf-8">
      <title>Potwierdź adres e-mail — 100k-RYCOS</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #334155;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #002633 0%, #0f172a 100%); color: #ffffff; padding: 32px 28px; text-align: center;">
          <div style="font-size: 12px; font-weight: 700; color: #4DBFF5; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px;">100K-RYCOS ADMIN</div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Potwierdź swój adres e-mail</h1>
        </div>

        <div style="padding: 32px 28px;">
          <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e293b;">
            ${greeting}
          </p>
          <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
            Dziękujemy za rejestrację firmy <strong style="color: #0f172a;">${companyName}</strong> w systemie <strong style="color: #0f172a;">100k-RYCOS</strong>.<br/>
            Aby Twoje konto stało się aktywne, potwierdź swój adres e-mail klikając poniższy przycisk:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}" target="_blank" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px;">
              Potwierdź adres e-mail i aktywuj konto
            </a>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 24px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-align: center;">
              Jeśli przycisk nie działa, skopiuj i wklej poniższy link w przeglądarce:
            </p>
            <p style="margin: 0; font-size: 12px; color: #2563eb; text-align: center; word-break: break-all;">
              <a href="${verifyUrl}" style="color: #2563eb;">${verifyUrl}</a>
            </p>
          </div>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
          Link aktywacyjny jest ważny przez 24 godziny. Jeśli nie zakładałeś konta w 100k-RYCOS, zignoruj tę wiadomość.<br/>
          © SolutionsBay — 100k-RYCOS
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || 'no-reply@receipts.rycos.eu',
      to: [recipientEmail],
      subject: 'Potwierdź adres e-mail i aktywuj konto — 100k-RYCOS',
      html,
    }),
  });

  const resJson: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = resJson?.message || resJson?.error || `Błąd Resend (${response.status})`;
    throw new Error(`Nie udało się wysłać e-maila aktywacyjnego: ${errorMsg}`);
  }

  return { success: true, id: resJson?.id };
}

export interface SendPasswordResetEmailParams {
  recipientEmail: string;
  name?: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  recipientEmail,
  name,
  resetUrl,
}: SendPasswordResetEmailParams): Promise<{ success: boolean; id?: string }> {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Usługa wysyłki e-maili nie jest skonfigurowana (brak klucza RESEND_API_KEY).');
  }

  const greeting = name ? `Cześć ${name},` : 'Dzień dobry,';

  const html = `
    <!DOCTYPE html>
    <html lang="pl">
    <head>
      <meta charset="utf-8">
      <title>Resetowanie hasła — 100k-RYCOS</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 32px 16px; color: #334155;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
        <div style="background: linear-gradient(135deg, #002633 0%, #0f172a 100%); color: #ffffff; padding: 32px 28px; text-align: center;">
          <div style="font-size: 12px; font-weight: 700; color: #4DBFF5; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px;">100K-RYCOS ADMIN</div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Resetowanie hasła</h1>
        </div>

        <div style="padding: 32px 28px;">
          <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e293b;">
            ${greeting}
          </p>
          <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
            Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w panelu administracyjnym <strong style="color: #0f172a;">100k-RYCOS</strong>.<br/>
            Kliknij poniższy przycisk, aby ustawić nowe hasło:
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #ef4444; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px;">
              Ustaw nowe hasło
            </a>
          </div>

          <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 24px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; text-align: center;">
              Jeśli przycisk nie działa, skopiuj i wklej poniższy link w przeglądarce:
            </p>
            <p style="margin: 0; font-size: 12px; color: #2563eb; text-align: center; word-break: break-all;">
              <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
            </p>
          </div>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8;">
          Link jest ważny przez 1 godzinę. Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość — Twoje konto jest bezpieczne.<br/>
          © SolutionsBay — 100k-RYCOS
        </div>
      </div>
    </body>
    </html>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || 'no-reply@receipts.rycos.eu',
      to: [recipientEmail],
      subject: 'Resetowanie hasła — 100k-RYCOS',
      html,
    }),
  });

  const resJson: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMsg = resJson?.message || resJson?.error || `Błąd Resend (${response.status})`;
    throw new Error(`Nie udało się wysłać e-maila resetującego hasło: ${errorMsg}`);
  }

  return { success: true, id: resJson?.id };
}

