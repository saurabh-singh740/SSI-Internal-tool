import nodemailer from 'nodemailer';

// Lazy env readers — read inside functions, not at module load time
const getEmailUser  = () => process.env.EMAIL_USER  || '';
const getEmailPass  = () => process.env.EMAIL_PASS  || '';
const getAppBaseUrl = () => process.env.APP_BASE_URL || 'http://localhost:5173';

function esc(v: string): string {
  return String(v)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: getEmailUser(), pass: getEmailPass() },
  });
}

// ─── Payment reminder email ───────────────────────────────────────────────────

export interface PaymentReminderParams {
  to:            string;
  recipientName: string;
  projectName:   string;
  invoiceMonth:  string;
  grossAmount:   number;
  currency:      string;
  paymentDate:   Date;
  status:        string;
  daysUntilDue?: number;    // positive = due in N days; undefined = already overdue
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

  const emailUser = getEmailUser();
  const emailPass = getEmailPass();
  const baseUrl   = getAppBaseUrl();

  if (!emailUser || !emailPass) {
    return { success: false, error: 'Email credentials not configured' };
  }

  const isOverdue = daysUntilDue === undefined || daysUntilDue < 0;
  const headerColor = isOverdue ? '#dc2626' : '#d97706';
  const statusLabel = isOverdue
    ? 'OVERDUE'
    : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;

  const subject = isOverdue
    ? `[ACTION REQUIRED] Overdue Payment — ${esc(invoiceMonth)} · ${esc(projectName)}`
    : `Payment Reminder — ${esc(invoiceMonth)} due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
  }).format(grossAmount);

  const formattedDate = new Date(paymentDate).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(subject)}</title>
  <style>
    body { margin:0; padding:0; background:#f4f6f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
    .wrapper { max-width:560px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.06); }
    .header  { background:${headerColor}; padding:28px 40px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:20px; font-weight:700; }
    .header p  { margin:6px 0 0; color:rgba(255,255,255,0.8); font-size:13px; }
    .body    { padding:32px 40px; }
    .body p  { margin:0 0 14px; color:#374151; font-size:15px; line-height:1.6; }
    .info-box { background:#fafafa; border:1px solid #e5e7eb; border-radius:8px; padding:18px 22px; margin:20px 0; }
    .info-box table { width:100%; border-collapse:collapse; }
    .info-box td { padding:6px 0; font-size:14px; color:#374151; }
    .info-box td:first-child { font-weight:600; color:#1e40af; width:160px; }
    .status-badge { display:inline-block; padding:4px 10px; border-radius:9999px; font-size:12px; font-weight:700; background:${isOverdue ? '#fee2e2' : '#fef3c7'}; color:${isOverdue ? '#991b1b' : '#92400e'}; }
    .cta { text-align:center; margin:28px 0; }
    .cta a { display:inline-block; background:${headerColor}; color:#fff; text-decoration:none; padding:12px 28px; border-radius:8px; font-size:14px; font-weight:600; }
    .footer { background:#f9fafb; border-top:1px solid #e5e7eb; padding:18px 40px; text-align:center; }
    .footer p { margin:0; font-size:12px; color:#9ca3af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Payment ${isOverdue ? 'Overdue' : 'Reminder'}</h1>
      <p>${esc(projectName)}</p>
    </div>
    <div class="body">
      <p>Hello <strong>${esc(recipientName)}</strong>,</p>
      <p>${isOverdue
        ? 'A payment for the following invoice is <strong>past due</strong>. Please arrange payment at your earliest convenience.'
        : `This is a reminder that the following payment will be due in <strong>${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}</strong>.`
      }</p>

      <div class="info-box">
        <table>
          <tr><td>Project</td><td>${esc(projectName)}</td></tr>
          <tr><td>Invoice Period</td><td>${esc(invoiceMonth)}</td></tr>
          <tr><td>Amount Due</td><td><strong>${esc(formattedAmount)}</strong></td></tr>
          <tr><td>Due Date</td><td>${esc(formattedDate)}</td></tr>
          <tr><td>Status</td><td><span class="status-badge">${esc(statusLabel)}</span></td></tr>
        </table>
      </div>

      <div class="cta">
        <a href="${esc(baseUrl)}/payments">View Payment Details</a>
      </div>

      <p style="font-size:13px;color:#6b7280;">
        If payment has already been made, please update the reference/UTR number in the payment portal so the record can be marked as received.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Admin Project Setup Platform · Automated Payment Reminder</p>
    </div>
  </div>
</body>
</html>`;

  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"Cohort Admin" <${emailUser}>`,
      to,
      subject,
      html,
    });
    console.log(`[PaymentEmail] ✓ Reminder sent to ${to} — ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PaymentEmail] ✗ Failed to ${to}:`, message);
    return { success: false, error: message };
  }
}
