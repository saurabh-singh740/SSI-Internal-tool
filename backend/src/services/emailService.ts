/**
 * emailService.ts — All transactional emails via Resend.
 *
 * Single file for every email template. Resend replaces nodemailer+Gmail:
 * no SMTP credentials, no app passwords, just an API key.
 *
 * All functions read env vars lazily (inside the call) so dotenv
 * load-order never causes a silent misconfiguration.
 */

import { Resend } from 'resend';

// ── HTML entity escaping ───────────────────────────────────────────────────────
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Lazy env helpers ──────────────────────────────────────────────────────────
const getApiKey    = () => process.env.RESEND_API_KEY   || '';
const getFromEmail = () => process.env.FROM_EMAIL        || 'noreply@stallionsi.com';
const getAppUrl    = () => process.env.APP_BASE_URL      || 'http://localhost:5173';

// ── Shared result type ────────────────────────────────────────────────────────
export interface EmailResult {
  success:    boolean;
  messageId?: string;
  error?:     string;
}

// ── Resend sender ─────────────────────────────────────────────────────────────
async function send(opts: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<EmailResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    const msg = 'RESEND_API_KEY is not set — email skipped';
    console.error('[Email]', msg);
    return { success: false, error: msg };
  }

  const resend = new Resend(apiKey);
  try {
    const { data, error } = await resend.emails.send({
      from:    `Stallion SI <${getFromEmail()}>`,
      to:      opts.to,
      subject: opts.subject,
      html:    opts.html,
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Email] ✓ Sent "${opts.subject}" to ${opts.to} — id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Email] ✗ send failed:', msg);
    return { success: false, error: msg };
  }
}

// ── Shared header/footer wrappers ─────────────────────────────────────────────
function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    body{margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
    .wrap{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07);}
    .hdr{background:#1e1b4b;padding:28px 40px;text-align:center;}
    .hdr h1{margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-.3px;}
    .hdr p{margin:4px 0 0;color:#a5b4fc;font-size:12px;}
    .bdy{padding:36px 40px;}
    .bdy p{margin:0 0 14px;color:#374151;font-size:15px;line-height:1.65;}
    .box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px 22px;margin:22px 0;}
    .box table{width:100%;border-collapse:collapse;}
    .box td{padding:5px 0;font-size:13px;color:#374151;vertical-align:top;}
    .box td:first-child{font-weight:600;color:#4338ca;width:140px;}
    .cta{text-align:center;margin:28px 0 8px;}
    .btn{display:inline-block;background:#4f46e5;color:#fff!important;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:14px;font-weight:600;}
    .fallback{font-size:11px;color:#9ca3af;text-align:center;margin-top:6px;word-break:break-all;}
    .ftr{background:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 40px;text-align:center;}
    .ftr p{margin:0;font-size:11px;color:#9ca3af;}
    .warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#9a3412;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <h1>Stallion SI · IPM</h1>
      <p>Internal Project Management</p>
    </div>
    <div class="bdy">${body}</div>
    <div class="ftr"><p>© ${new Date().getFullYear()} Stallion SI · This email was sent automatically. Do not reply.</p></div>
  </div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ENGINEER ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface SendAssignmentEmailParams {
  to:           string;
  engineerName: string;
  projectName:  string;
  clientName:   string;
  inviteToken:  string;
  timesheetUrl?: string;
}

export async function sendEngineerAssignmentEmail(
  params: SendAssignmentEmailParams
): Promise<EmailResult> {
  const { to, engineerName, projectName, clientName, inviteToken, timesheetUrl } = params;
  const base         = getAppUrl();
  const inviteLink   = `${base}/engineer/invite/${inviteToken}`;
  const tsUrl        = timesheetUrl || `${base}/timesheet`;

  const body = `
    <p>Hello <strong>${esc(engineerName)}</strong>,</p>
    <p>You have been assigned to a new project. Please review the details and confirm your assignment.</p>
    <div class="box">
      <table>
        <tr><td>Project</td><td>${esc(projectName)}</td></tr>
        <tr><td>Client</td><td>${esc(clientName || 'N/A')}</td></tr>
      </table>
    </div>
    <p>Click below to confirm your assignment. This link expires in <strong>48 hours</strong>.</p>
    <div class="cta"><a class="btn" href="${esc(inviteLink)}">Confirm Assignment</a></div>
    <p class="fallback">Or paste this link in your browser:<br/><a href="${esc(inviteLink)}" style="color:#4f46e5;">${esc(inviteLink)}</a></p>
    <div style="margin-top:20px;padding:14px 18px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0 0 8px;font-weight:600;color:#15803d;font-size:13px;">Your Timesheet Dashboard</p>
      <a href="${esc(tsUrl)}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:9px 20px;border-radius:6px;font-size:13px;font-weight:600;">Open Timesheet</a>
    </div>
    <p style="margin-top:22px;font-size:13px;color:#6b7280;">If you were not expecting this, please contact your project manager.</p>`;

  return send({ to, subject: 'You have been assigned to a new project', html: emailShell('Project Assignment', body) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. FORGOT PASSWORD / RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendPasswordResetEmail(opts: {
  to:        string;
  name:      string;
  resetToken: string;
}): Promise<EmailResult> {
  const { to, name, resetToken } = opts;
  const link = `${getAppUrl()}/reset-password?token=${resetToken}`;

  const body = `
    <p>Hello <strong>${esc(name)}</strong>,</p>
    <p>We received a request to reset the password for your Stallion SI account.</p>
    <div class="cta"><a class="btn" href="${esc(link)}">Reset Password</a></div>
    <p class="fallback">Or paste this link in your browser:<br/><a href="${esc(link)}" style="color:#4f46e5;">${esc(link)}</a></p>
    <div class="warn">⏱ This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not change.</div>`;

  return send({ to, subject: 'Reset your Stallion SI password', html: emailShell('Password Reset', body) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. WELCOME EMAIL (admin creates a new user)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendWelcomeEmail(opts: {
  to:       string;
  name:     string;
  role:     string;
  password: string;
}): Promise<EmailResult> {
  const { to, name, role, password } = opts;
  const loginUrl = `${getAppUrl()}/login`;

  const body = `
    <p>Hello <strong>${esc(name)}</strong>,</p>
    <p>Your account on the <strong>Stallion SI Internal Project Management</strong> platform has been created.</p>
    <div class="box">
      <table>
        <tr><td>Email</td><td>${esc(to)}</td></tr>
        <tr><td>Password</td><td><code style="font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px;">${esc(password)}</code></td></tr>
        <tr><td>Role</td><td>${esc(role)}</td></tr>
      </table>
    </div>
    <div class="warn">⚠ Please change your password after your first login.</div>
    <div class="cta"><a class="btn" href="${esc(loginUrl)}">Log In Now</a></div>`;

  return send({ to, subject: 'Your Stallion SI account has been created', html: emailShell('Welcome to Stallion SI', body) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PASSWORD CHANGED CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendPasswordChangedEmail(opts: {
  to:   string;
  name: string;
}): Promise<EmailResult> {
  const { to, name } = opts;
  const resetUrl = `${getAppUrl()}/forgot-password`;

  const body = `
    <p>Hello <strong>${esc(name)}</strong>,</p>
    <p>Your Stallion SI account password was successfully changed.</p>
    <p>If you did not make this change, please <a href="${esc(resetUrl)}" style="color:#4f46e5;font-weight:600;">reset your password immediately</a> and contact your administrator.</p>`;

  return send({ to, subject: 'Your password has been changed', html: emailShell('Password Changed', body) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PROJECT CREATED (notify admin / project owner)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendProjectCreatedEmail(opts: {
  to:           string;
  adminName:    string;
  projectName:  string;
  projectCode:  string;
  clientName?:  string;
  engineerCount: number;
}): Promise<EmailResult> {
  const { to, adminName, projectName, projectCode, clientName, engineerCount } = opts;
  const projectUrl = `${getAppUrl()}/projects`;

  const body = `
    <p>Hello <strong>${esc(adminName)}</strong>,</p>
    <p>A new project has been created on the Stallion SI platform.</p>
    <div class="box">
      <table>
        <tr><td>Project</td><td>${esc(projectName)}</td></tr>
        <tr><td>Code</td><td><code style="font-family:monospace;">${esc(projectCode)}</code></td></tr>
        ${clientName ? `<tr><td>Client</td><td>${esc(clientName)}</td></tr>` : ''}
        <tr><td>Engineers</td><td>${engineerCount} assigned</td></tr>
      </table>
    </div>
    <div class="cta"><a class="btn" href="${esc(projectUrl)}">View Projects</a></div>`;

  return send({ to, subject: `New project created: ${projectName}`, html: emailShell('Project Created', body) });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PROJECT STATUS CHANGE (timeline notification)
// ═══════════════════════════════════════════════════════════════════════════════

export async function sendProjectStatusEmail(opts: {
  to:          string;
  name:        string;
  projectName: string;
  oldStatus:   string;
  newStatus:   string;
  projectId:   string;
}): Promise<EmailResult> {
  const { to, name, projectName, oldStatus, newStatus, projectId } = opts;
  const projectUrl = `${getAppUrl()}/projects/${projectId}`;

  const body = `
    <p>Hello <strong>${esc(name)}</strong>,</p>
    <p>The status of project <strong>${esc(projectName)}</strong> has been updated.</p>
    <div class="box">
      <table>
        <tr><td>Previous Status</td><td>${esc(oldStatus.replace(/_/g, ' '))}</td></tr>
        <tr><td>New Status</td><td><strong>${esc(newStatus.replace(/_/g, ' '))}</strong></td></tr>
      </table>
    </div>
    <div class="cta"><a class="btn" href="${esc(projectUrl)}">View Project</a></div>`;

  return send({ to, subject: `Project status updated: ${projectName}`, html: emailShell('Project Status Updated', body) });
}
