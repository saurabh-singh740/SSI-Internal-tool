import { Request, Response } from 'express';
import Project from '../models/Project';
import User from '../models/User';
import EngineerInvite from '../models/EngineerInvite';
import { AuthRequest } from '../middleware/auth.middleware';
import { appEmitter } from '../events/emitter';
import { sendEngineerAssignmentEmail } from '../services/emailService';
import { safeError } from '../utils/apiError';

// ── POST /api/projects/assign-engineer ───────────────────────────────────────
//
// Body: { projectId, engineerEmail, role?, allocationPercentage? }
//
// PERFORMANCE: Only validates and mutates the project document synchronously.
// Timesheet generation, invite token, and email all run in background via
// the project:engineer:assign event — response is < 50ms.
// ─────────────────────────────────────────────────────────────────────────────
export const assignEngineer = async (req: AuthRequest, res: Response): Promise<void> => {
  const { projectId, engineerEmail, role = 'ENGINEER', allocationPercentage = 100 } = req.body;

  if (!projectId || !engineerEmail) {
    res.status(400).json({ message: 'projectId and engineerEmail are required' });
    return;
  }

  try {
    // ── 1. Load project ──────────────────────────────────────────────────────
    const project = await Project.findById(projectId).select(
      'name code status engineers startDate contractedHours additionalApprovedHours clientName'
    );
    if (!project) { res.status(404).json({ message: `Project ${projectId} not found` }); return; }
    if (project.status === 'CLOSED') {
      res.status(400).json({ message: 'Cannot assign engineers to a closed project' }); return;
    }

    // ── 2. Load engineer ─────────────────────────────────────────────────────
    const engineer = await User.findOne({ email: engineerEmail.toLowerCase() })
      .select('_id name email').lean();
    if (!engineer) { res.status(404).json({ message: `No user found with email ${engineerEmail}` }); return; }

    // ── 3. Assign to project (idempotent) ────────────────────────────────────
    const alreadyAssigned = project.engineers.some(
      (e) => String(e.engineer) === String(engineer._id)
    );

    if (!alreadyAssigned) {
      const currentTotal = project.engineers.reduce((s, e) => s + e.allocationPercentage, 0);
      if (currentTotal + Number(allocationPercentage) > 300) {
        res.status(400).json({ message: 'Total engineer allocation would exceed 300%' }); return;
      }
      project.engineers.push({
        engineer: engineer._id as any,
        role,
        allocationPercentage: Number(allocationPercentage),
      });
      await project.save();
    }

    const year = project.startDate
      ? new Date(project.startDate).getFullYear()
      : new Date().getFullYear();

    // ── Respond immediately ──────────────────────────────────────────────────
    res.status(201).json({
      message: alreadyAssigned
        ? 'Engineer already assigned — invite email queued for re-send'
        : 'Engineer assigned — timesheet and invite email queued',
      engineerId:   String(engineer._id),
      engineerEmail: engineer.email,
    });

    // ── Background: timesheet + invite + email ───────────────────────────────
    setImmediate(() => {
      appEmitter.emit('project:engineer:assign', {
        projectId:            String(project._id),
        projectName:          project.name,
        clientName:           project.clientName || '',
        engineerId:           String(engineer._id),
        year,
        totalAuthorizedHours: project.contractedHours + project.additionalApprovedHours,
        resend:               alreadyAssigned,
      });
    });
  } catch (err: any) {
    console.error('[assignEngineer] Error:', err);
    res.status(500).json({ message: err.message || 'Server error', ...safeError(err) });
  }
};

// ── POST /api/projects/:id/engineers — add by userId ─────────────────────────
export const addEngineerToProject = async (req: AuthRequest, res: Response): Promise<void> => {
  const { engineerId, role = 'ENGINEER', allocationPercentage = 100, startDate, endDate } = req.body;

  if (!engineerId) {
    res.status(400).json({ message: 'engineerId is required' });
    return;
  }

  try {
    const project = await Project.findById(req.params.id)
      .select('name code status engineers startDate contractedHours additionalApprovedHours clientName');
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }
    if (project.status === 'CLOSED') {
      res.status(400).json({ message: 'Cannot assign engineers to a closed project' }); return;
    }

    const engineer = await User.findById(engineerId).select('_id name email').lean();
    if (!engineer) { res.status(404).json({ message: 'User not found' }); return; }

    const alreadyAssigned = project.engineers.some(e => String(e.engineer) === String(engineer._id));

    if (!alreadyAssigned) {
      project.engineers.push({
        engineer:             engineer._id as any,
        role,
        allocationPercentage: Number(allocationPercentage),
        startDate:            startDate ? new Date(startDate) : undefined,
        endDate:              endDate   ? new Date(endDate)   : undefined,
      } as any);
      await project.save();
    }

    const year = project.startDate ? new Date(project.startDate).getFullYear() : new Date().getFullYear();

    res.status(201).json({ message: alreadyAssigned ? 'Already assigned' : 'Engineer added' });

    if (!alreadyAssigned) {
      setImmediate(() => {
        appEmitter.emit('project:engineer:assign', {
          projectId:            String(project._id),
          projectName:          project.name,
          clientName:           project.clientName || '',
          engineerId:           String(engineer._id),
          year,
          totalAuthorizedHours: project.contractedHours + project.additionalApprovedHours,
          resend:               false,
        });
      });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Server error', ...safeError(err) });
  }
};

// ── DELETE /api/projects/:id/engineers/:engineerId ───────────────────────────
export const removeEngineerFromProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await Project.findById(req.params.id).select('engineers');
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }

    const before = project.engineers.length;
    project.engineers = project.engineers.filter(
      e => String(e.engineer) !== req.params.engineerId
    ) as any;

    if (project.engineers.length === before) {
      res.status(404).json({ message: 'Engineer not found on this project' });
      return;
    }

    await project.save();
    res.json({ message: 'Engineer removed' });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Server error', ...safeError(err) });
  }
};

// ── GET /api/projects/invite/:token ─────────────────────────────────────────
export const confirmInvite = async (req: Request, res: Response): Promise<void> => {
  try {
    const invite = await EngineerInvite.findOne({ token: req.params.token }).populate('project', 'name code');
    if (!invite) { res.status(404).json({ message: 'Invitation not found or already used' }); return; }
    if (invite.accepted) { res.status(400).json({ message: 'Invitation already accepted' }); return; }
    if (invite.expiresAt < new Date()) {
      res.status(410).json({ message: 'Invitation has expired. Ask your admin to re-send.' }); return;
    }
    invite.accepted = true;
    await invite.save();
    console.log(`[confirmInvite] Accepted — engineer ${invite.engineerEmail}`);
    res.json({
      message: 'Assignment confirmed. The project will now appear in your dashboard.',
      project: invite.project,
      engineerId: String(invite.engineer),
    });
  } catch (err: any) {
    console.error('[confirmInvite] Error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── POST /api/test-email (dev only) ─────────────────────────────────────────
export const testEmail = async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production') { res.status(404).json({ message: 'Not found' }); return; }
  const to: string = req.body?.to || req.query?.to as string;
  if (!to) { res.status(400).json({ message: 'Provide "to" in request body or query string' }); return; }
  console.log(`[testEmail] Firing test email to ${to}`);
  const result = await sendEngineerAssignmentEmail({
    to,
    engineerName: 'Test Engineer',
    projectName: 'Test Project Alpha',
    clientName: 'Test Client Corp',
    inviteToken: 'test-token-' + Date.now(),
    timesheetUrl: 'http://localhost:5173/timesheet/test-project/test-engineer',
  });
  if (result.success) res.json({ message: 'Test email sent', messageId: result.messageId });
  else res.status(502).json({ message: 'Test email failed', error: result.error });
};
