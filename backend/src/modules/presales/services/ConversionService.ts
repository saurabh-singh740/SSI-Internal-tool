/**
 * ConversionService — the Deal → Project bridge.
 *
 * This is the only service that imports from both the Pre-Sales module
 * and the existing Project model. Everything runs inside a MongoDB
 * transaction so the operation is atomic: no orphaned project or
 * unconverted deal can survive a mid-flight failure.
 *
 * Called exclusively from the /deals/:id/convert endpoint (ADMIN only).
 */
import mongoose from 'mongoose';
import Deal, { IDeal } from '../../../models/Deal';
import Project, { IProject } from '../../../models/Project';
import DealActivity from '../../../models/DealActivity';
import { appEmitter } from '../../../events/emitter';

// Fields an admin can override at conversion time
export interface ConversionOverrides {
  name?:            string;
  code?:            string;
  type?:            IProject['type'];
  clientName?:      string;
  clientCompany?:   string;
  clientEmail?:     string;
  clientPhone?:     string;
  startDate?:       Date;
  endDate?:         Date;
  billingType?:     IProject['billingType'];
  hourlyRate?:      number;
  currency?:        IProject['currency'];
  contractedHours?: number;
  engineers?:       IProject['engineers'];
}

export interface ConversionResult {
  project: IProject;
  deal:    IDeal;
}

export class ConversionService {

  async convertToProject(
    dealId: string,
    actorId: string,
    overrides: ConversionOverrides = {}
  ): Promise<ConversionResult> {

    // ── Pre-flight checks (outside transaction — fast fails) ────────────────
    const deal = await Deal.findById(dealId).lean() as IDeal | null;
    if (!deal) {
      throw Object.assign(new Error('Deal not found'), { statusCode: 404 });
    }
    if (deal.stage !== 'WON') {
      throw Object.assign(
        new Error('Only deals in WON stage can be converted to a project'),
        { statusCode: 400 }
      );
    }
    if (deal.convertedProjectId) {
      throw Object.assign(
        new Error('This deal has already been converted to a project'),
        { statusCode: 409, projectId: deal.convertedProjectId }
      );
    }

    // ── Build project data from deal ────────────────────────────────────────
    const projectData = this.mapDealToProject(deal, overrides);

    // ── Ensure unique project code ──────────────────────────────────────────
    const codeExists = await Project.exists({ code: projectData.code });
    if (codeExists) {
      projectData.code = `${projectData.code}-${Date.now().toString(36).toUpperCase()}`;
    }

    // ── Atomic transaction ──────────────────────────────────────────────────
    const session = await mongoose.startSession();
    session.startTransaction();

    let project: IProject;

    try {
      // 1. Create the Project
      const [created] = await Project.create(
        [{ ...projectData, originDealId: deal._id, createdBy: actorId }],
        { session }
      );
      project = created;

      // 2. Stamp the Deal as converted
      await Deal.updateOne(
        { _id: dealId },
        { convertedProjectId: project._id, convertedAt: new Date(), convertedBy: actorId },
        { session }
      );

      // 3. Append activity log entry
      await DealActivity.create(
        [{ dealId: deal._id, type: 'CONVERTED', actor: actorId, meta: { projectId: project._id } }],
        { session }
      );

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    // ── Post-commit side-effects ─────────────────────────────────────────────
    // These run outside the transaction; a failure here does NOT roll back.

    appEmitter.emit('deal:converted', {
      dealId:    deal._id.toString(),
      dealTitle: deal.title,
      projectId: project._id.toString(),
      actorId,
      ownerId:   deal.owner.toString(),
    });

    // Trigger the existing engineer onboarding flow if engineers were assigned
    if (project.engineers?.length) {
      const timesheetYear = deal.proposedStartDate
        ? new Date(deal.proposedStartDate).getFullYear()
        : new Date().getFullYear();

      appEmitter.emit('project:engineers:process', {
        projectId:            project._id.toString(),
        projectName:          project.name,
        clientName:           project.clientName || deal.clientCompany,
        engineerIds:          project.engineers.map(e => e.engineer.toString()),
        year:                 timesheetYear,
        totalAuthorizedHours: project.totalAuthorizedHours,
      });
    }

    const updatedDeal = await Deal.findById(dealId)
      .populate('owner',              'name email')
      .populate('convertedProjectId', 'name code')
      .lean() as unknown as IDeal;

    return { project, deal: updatedDeal };
  }

  // ── Field mapping ─────────────────────────────────────────────────────────

  private mapDealToProject(deal: IDeal, ov: ConversionOverrides): Partial<IProject> {
    const primaryContact = deal.contacts?.[0];

    // Build description from SOW sections if present
    const description = deal.sowSections?.length
      ? deal.sowSections
          .sort((a, b) => a.order - b.order)
          .map(s => `## ${s.title}\n\n${s.content}`)
          .join('\n\n')
      : undefined;

    return {
      name:          ov.name          ?? `${deal.clientCompany} — ${deal.title}`,
      code:          ov.code          ?? `PRJ-${deal.dealNumber.replace('DEAL-', '')}`,
      type:          ov.type          ?? 'CLIENT_PROJECT',
      status:        'ACTIVE',
      phase:         'PLANNING',
      description,

      clientName:    ov.clientName    ?? primaryContact?.name    ?? deal.clientCompany,
      clientCompany: ov.clientCompany ?? deal.clientCompany,
      clientEmail:   ov.clientEmail   ?? primaryContact?.email,
      clientPhone:   ov.clientPhone   ?? primaryContact?.phone,

      startDate: ov.startDate ?? deal.proposedStartDate,
      endDate:   ov.endDate   ?? deal.proposedEndDate,

      billingType:     ov.billingType     ?? (deal.billingType as any) ?? 'TIME_AND_MATERIAL',
      hourlyRate:      ov.hourlyRate      ?? deal.proposedRate          ?? 0,
      currency:        ov.currency        ?? (deal.currency as any)     ?? 'USD',
      contractedHours: ov.contractedHours ?? deal.estimatedHours        ?? 0,

      billingCycle: 'MONTHLY',
      paymentTerms: 'NET_30',
      paymentMode:  'BANK_TRANSFER',

      sourceType: 'DIRECT',
      sourceName: deal.source ?? undefined,

      maxAllowedHours: ov.contractedHours ?? deal.estimatedHours ?? 0,
      alertThreshold:  80,

      // resourcePlan (tentative) becomes engineers (final) — same shape, direct copy
      engineers:    ov.engineers    ?? deal.resourcePlan ?? [],
      customFields: deal.customFields?.map(cf => ({ ...cf })) ?? [],
    };
  }
}

export const conversionService = new ConversionService();
