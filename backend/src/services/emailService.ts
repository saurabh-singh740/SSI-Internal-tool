import nodemailer from 'nodemailer';

// ── HTML entity escaping ──────────────────────────────────────────────────────
// Prevents XSS when injecting user-provided values into HTML email templates.
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Lazy env readers ──────────────────────────────────────────────────────────
// Read from process.env INSIDE functions, not at module load time.
// This makes the service immune to dotenv load-order bugs — process.env is
// always current when the function actually executes.
const getEmailUser   = () => process.env.EMAIL_USER   || '';
const getEmailPass   = () => process.env.EMAIL_PASS   || '';
const getAppBaseUrl  = () => process.env.APP_BASE_URL || 'http://localhost:5173';

// ── Nodemailer transporter ────────────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: getEmailUser(),
      pass: getEmailPass(),
    },
  });
}

// ── HTML email template ───────────────────────────────────────────────────────
function buildAssignmentEmail(opts: {
  engineerName: string;
  projectName: string;
  clientName: string;
  invitationLink: string;
  timesheetUrl: string;
}): { subject: string; html: string } {
  const { engineerName, projectName, clientName, invitationLink, timesheetUrl } = opts;

  // Escape all user-provided values before injecting into HTML
  const safeEngineerName  = esc(engineerName);
  const safeProjectName   = esc(projectName);
  const safeClientName    = esc(clientName || 'N/A');
  const safeInviteLink    = esc(invitationLink);
  const safeTimesheetUrl  = esc(timesheetUrl);

  const subject = 'You have been assigned to a new project';

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
    .header  { background:#2563eb; padding:32px 40px; text-align:center; }
    .header h1 { margin:0; color:#fff; font-size:22px; font-weight:700; }
    .header p  { margin:6px 0 0; color:#bfdbfe; font-size:13px; }
    .body    { padding:36px 40px; }
    .body p  { margin:0 0 16px; color:#374151; font-size:15px; line-height:1.6; }
    .info-box { background:#f0f7ff; border:1px solid #bfdbfe; border-radius:8px; padding:20px 24px; margin:24px 0; }
    .info-box table { width:100%; border-collapse:collapse; }
    .info-box td { padding:6px 0; font-size:14px; color:#374151; }
    .info-box td:first-child { font-weight:600; color:#1e40af; width:140px; }
    .cta { text-align:center; margin:32px 0 8px; }
    .cta a { display:inline-block; background:#2563eb; color:#fff; text-decoration:none; padding:14px 32px; border-radius:8px; font-size:15px; font-weight:600; }
    .link-fallback { font-size:12px; color:#9ca3af; text-align:center; margin-top:6px; word-break:break-all; }
    .footer { background:#f9fafb; border-top:1px solid #e5e7eb; padding:20px 40px; text-align:center; }
    .footer p { margin:0; font-size:12px; color:#9ca3af; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Project Assignment</h1>
      <p>Admin Project Setup Platform</p>
    </div>
    <div class="body">
      <p>Hello <strong>${safeEngineerName}</strong>,</p>
      <p>You have been assigned to a new project. Please review the details below and confirm your assignment.</p>

      <div class="info-box">
        <table>
          <tr><td>Project Name</td><td>${safeProjectName}</td></tr>
          <tr><td>Client</td><td>${safeClientName}</td></tr>
        </table>
      </div>

      <p>Click the button below to confirm your assignment. This link expires in <strong>48 hours</strong>.</p>

      <div class="cta">
        <a href="${safeInviteLink}">Confirm Assignment</a>
      </div>
      <p class="link-fallback">
        Or copy this link into your browser:<br />
        <a href="${safeInviteLink}" style="color:#2563eb;">${safeInviteLink}</a>
      </p>

      <div style="margin-top:24px;padding:16px 20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#15803d;">📋 Your Timesheet Dashboard</p>
        <p style="margin:0 0 10px;font-size:13px;color:#374151;">
          Once you confirm your assignment, you can log hours directly in your timesheet:
        </p>
        <a href="${safeTimesheetUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 22px;border-radius:6px;font-size:13px;font-weight:600;">
          Open Timesheet
        </a>
        <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;word-break:break-all;">
          ${safeTimesheetUrl}
        </p>
      </div>

      <p style="margin-top:28px;">If you were not expecting this, please contact your project manager.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Admin Project Setup Platform · All rights reserved</p>
    </div>
  </div>
</body>
</html>
`;

  return { subject, html };
}

// ── Exported types ────────────────────────────────────────────────────────────
export interface SendAssignmentEmailParams {
  to: string;
  engineerName: string;
  projectName: string;
  clientName: string;
  inviteToken: string;
  timesheetUrl?: string; // direct link to the engineer's timesheet dashboard
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function sendEngineerAssignmentEmail(
  params: SendAssignmentEmailParams
): Promise<EmailResult> {
  const { to, engineerName, projectName, clientName, inviteToken, timesheetUrl } = params;

  // Read env vars NOW (inside the function) — guaranteed to be populated
  const emailUser  = getEmailUser();
  const emailPass  = getEmailPass();
  const baseUrl    = getAppBaseUrl();

  const invitationLink = `${baseUrl}/engineer/invite/${inviteToken}`;
  const { subject, html } = buildAssignmentEmail({
    engineerName, projectName, clientName, invitationLink,
    timesheetUrl: timesheetUrl || `${baseUrl}/timesheet`,
  });

  // ── Debug logs ──────────────────────────────────────────────────────────────
  console.log('[EmailService] Sending assignment email');
  console.log('[EmailService]   to:      ', to);
  console.log('[EmailService]   from:    ', emailUser || '(not set)');
  console.log('[EmailService]   project: ', projectName);
  console.log('[EmailService]   link:    ', invitationLink);

  // ── Config guard ────────────────────────────────────────────────────────────
  if (!emailUser) {
    const msg = 'EMAIL_USER is not set in environment — email skipped';
    console.error('[EmailService] ✗', msg);
    return { success: false, error: msg };
  }
  if (!emailPass) {
    const msg = 'EMAIL_PASS is not set in environment — email skipped';
    console.error('[EmailService] ✗', msg);
    return { success: false, error: msg };
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  try {
    const transporter = createTransporter();

    const info = await transporter.sendMail({
      from: `"Project Setup" <${emailUser}>`,
      to,
      subject,
      html,
    });

    console.log('[EmailService] ✓ Email sent');
    console.log('[EmailService]   messageId:     ', info.messageId);
    console.log('[EmailService]   SMTP response: ', info.response);

    return { success: true, messageId: info.messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[EmailService] ✗ sendMail failed:', err);
    return { success: false, error: message };
  }
}
