/**
 * paymentEmailService.ts — Payment reminder emails via Resend.
 */

import { Resend } from 'resend';

function esc(v: string): string {
  return String(v)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

const getApiKey    = () => process.env.RESEND_API_KEY || '';
const getFromEmail = () => process.env.FROM_EMAIL     || 'noreply@stallionsi.com';
const getAppUrl    = () => process.env.APP_BASE_URL   || 'http://localhost:5173';

export interface PaymentReminderParams {
  to:            string;
  recipientName: string;
  projectName:   string;
  invoiceMonth:  string;
  grossAmount:   number;
  currency:      string;
  paymentDate:   Date;
  status:        string;
  daysUntilDue?: number;
}

export interface EmailResult {
  success:    boolean;
  messageId?: string;
  error?:     string;
}

export async function sendPaymentReminderEmail(
  params: PaymentReminderParams
): Promise<EmailResult> {
  const {
    to, recipientName, projectName, invoiceMonth,
    grossAmount, currency, paymentDate, status, daysUntilDue,
  } = params;

  const apiKey = getApiKey();
  if (!apiKey) return { success: false, error: 'RESEND_API_KEY not configured' };

  const isOverdue    = daysUntilDue === undefined || daysUntilDue < 0;
  const headerColor  = isOverdue ? '#dc2626' : '#d97706';
  const statusLabel  = isOverdue ? 'OVERDUE' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
  const formattedAmt = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(grossAmount);
  const formattedDt  = new Date(paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const subject = isOverdue
    ? `[ACTION REQUIRED] Overdue Payment — ${invoiceMonth} · ${projectName}`
    : `Payment Reminder — ${invoiceMonth} due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <style>
    body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
    .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);}
    .hdr{background:${headerColor};padding:28px 40px;text-align:center;}
    .hdr h1{margin:0;color:#fff;font-size:20px;font-weight:700;}
    .hdr p{margin:4px 0 0;color:rgba(255,255,255,.8);font-size:12px;}
    .bdy{padding:32px 40px;}
    .bdy p{margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;}
    .box{background:#fafafa;border:1px solid #e5e7eb;border-radius:8px;padding:18px 22px;margin:20px 0;}
    .box table{width:100%;border-collapse:collapse;}
    .box td{padding:5px 0;font-size:13px;color:#374151;}
    .box td:first-child{font-weight:600;color:#1e40af;width:150px;}
    .badge{display:inline-block;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:700;background:${isOverdue ? '#fee2e2' : '#fef3c7'};color:${isOverdue ? '#991b1b' : '#92400e'};}
    .cta{text-align:center;margin:24px 0;}
    .btn{display:inline-block;background:${headerColor};color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;}
    .ftr{background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 40px;text-align:center;}
    .ftr p{margin:0;font-size:11px;color:#9ca3af;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>Payment ${isOverdue ? 'Overdue' : 'Reminder'}</h1>
      <p>${esc(projectName)}</p>
    </div>
    <div class="bdy">
      <p>Hello <strong>${esc(recipientName)}</strong>,</p>
      <p>${isOverdue
        ? 'A payment is <strong>past due</strong>. Please arrange payment at your earliest convenience.'
        : `This payment will be due in <strong>${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}</strong>.`
      }</p>
      <div class="box">
        <table>
          <tr><td>Project</td><td>${esc(projectName)}</td></tr>
          <tr><td>Invoice Period</td><td>${esc(invoiceMonth)}</td></tr>
          <tr><td>Amount Due</td><td><strong>${esc(formattedAmt)}</strong></td></tr>
          <tr><td>Due Date</td><td>${esc(formattedDt)}</td></tr>
          <tr><td>Status</td><td><span class="badge">${esc(statusLabel)}</span></td></tr>
        </table>
      </div>
      <div class="cta"><a class="btn" href="${esc(getAppUrl())}/payments">View Payment Details</a></div>
      <p style="font-size:13px;color:#6b7280;">If payment has already been made, update the reference/UTR in the portal so the record can be marked as received.</p>
    </div>
    <div class="ftr"><p>© ${new Date().getFullYear()} Stallion SI · Automated Payment Reminder</p></div>
  </div>
</body>
</html>`;

  try {
    const resend  = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from:    `Stallion SI <${getFromEmail()}>`,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[PaymentEmail] Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[PaymentEmail] ✓ Reminder sent to ${to} — id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[PaymentEmail] ✗ Failed:', msg);
    return { success: false, error: msg };
  }
}
