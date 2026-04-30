import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Trash2, Loader2,
  FolderKanban, Building2, CalendarRange, Users2,
  CreditCard, Activity, Banknote, ShieldCheck, Settings2, StickyNote, Share2,
} from 'lucide-react';
import api from '../../api/axios';
import { User, ProjectFormData } from '../../types';

// ─── Validation schema ────────────────────────────────────────────────────────
const schema = z.object({
  name: z.string().min(1, 'Project name is required'),
  code: z.string().min(1, 'Project code is required'),
  type: z.enum(['INTERNAL', 'CLIENT_PROJECT', 'SUPPORT']),
  category: z.string().optional(),
  status: z.enum(['ACTIVE', 'CLOSED', 'ON_HOLD']),
  description: z.string().optional(),
  clientName: z.string().optional(),
  clientCompany: z.string().optional(),
  clientEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  clientPhone: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  estimatedCompletionDate: z.string().optional(),
  phase: z.enum(['PLANNING', 'EXECUTION', 'DELIVERY', 'MAINTENANCE']),
  contractedHours: z.coerce.number().min(0),
  additionalApprovedHours: z.coerce.number().min(0),
  hourlyRate: z.coerce.number().min(0),
  currency: z.enum(['USD', 'INR', 'EUR']),
  billingType: z.enum(['TIME_AND_MATERIAL', 'FIXED_PRICE', 'MILESTONE']),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'MILESTONE_BASED']),
  maxAllowedHours: z.coerce.number().min(0),
  alertThreshold: z.coerce.number().min(0).max(100),
  paymentTerms: z.enum(['NET_30', 'NET_45', 'NET_60']),
  tdsPercentage: z.coerce.number().min(0).max(100),
  paymentMode: z.enum(['BANK_TRANSFER', 'WIRE_TRANSFER', 'UPI']),
  billingContactEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  clientAccessEnabled: z.boolean(),
  canViewSummary: z.boolean(),
  canViewTimesheets: z.boolean(),
  canViewPayments: z.boolean(),
  canViewStatus: z.boolean(),
  engineersCanEditTimesheets: z.boolean(),
  timesheetApprovalRequired: z.boolean(),
  timesheetLockPeriod: z.coerce.number(),
  engineers: z.array(
    z.object({
      engineer: z.string().min(1, 'Select an engineer'),
      role: z.enum(['LEAD_ENGINEER', 'ENGINEER', 'REVIEWER']),
      allocationPercentage: z.coerce.number().min(0).max(100),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
  ),
  customFields: z.array(
    z.object({
      name: z.string().min(1, 'Field name required'),
      type: z.enum(['TEXT', 'NUMBER', 'DROPDOWN', 'DATE']),
      value: z.string().optional(),
    })
  ),
  sourceType: z.enum(['DIRECT', 'PARTNER', 'REFERRAL', 'OTHER']).optional(),
  sourceName: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  name: '', code: '', type: 'CLIENT_PROJECT', category: '', status: 'ACTIVE', description: '',
  sourceType: undefined, sourceName: '',
  clientName: '', clientCompany: '', clientEmail: '', clientPhone: '',
  startDate: '', endDate: '', estimatedCompletionDate: '', phase: 'PLANNING',
  contractedHours: 0, additionalApprovedHours: 0, hourlyRate: 0,
  currency: 'USD', billingType: 'TIME_AND_MATERIAL', billingCycle: 'MONTHLY',
  maxAllowedHours: 0, alertThreshold: 80,
  paymentTerms: 'NET_30', tdsPercentage: 0, paymentMode: 'BANK_TRANSFER', billingContactEmail: '',
  clientAccessEnabled: false, canViewSummary: true, canViewTimesheets: false,
  canViewPayments: false, canViewStatus: true,
  engineersCanEditTimesheets: true, timesheetApprovalRequired: false, timesheetLockPeriod: 14,
  engineers: [], customFields: [], notes: '',
};

interface Props {
  initialData?: Partial<ProjectFormData>;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  submitLabel?: string;
  isLoading?: boolean;
}

// ─── Section card wrapper ─────────────────────────────────────────────────────
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15">
          <Icon className="h-4 w-4 text-brand-400" />
        </div>
        <h3 className="text-sm font-semibold text-ink-100">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

export default function ProjectForm({ initialData, onSubmit, submitLabel = 'Create Project', isLoading }: Props) {
  const [users, setUsers] = useState<User[]>([]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaultValues, ...initialData } as FormValues,
  });

  const { fields: engineerFields, append: appendEngineer, remove: removeEngineer } = useFieldArray({ control, name: 'engineers' });
  const { fields: customFieldFields, append: appendCustomField, remove: removeCustomField } = useFieldArray({ control, name: 'customFields' });

  const contractedHours = watch('contractedHours') || 0;
  const additionalHours = watch('additionalApprovedHours') || 0;
  const totalAuthorized = Number(contractedHours) + Number(additionalHours);

  useEffect(() => {
    api.get('/users/engineers').then((res) => setUsers(res.data.users || []));
  }, []);

  const handleFormSubmit = (data: FormValues) => {
    onSubmit(data as ProjectFormData);
  };

  // ─── Field helpers ──────────────────────────────────────────────────────────
  const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
    <div>
      <label className="form-label">{label}</label>
      {children}
      {error && <p className="form-error">{error}</p>}
    </div>
  );

  const Toggle = ({ name, label }: { name: keyof FormValues; label: string }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <button
            type="button"
            role="switch"
            aria-checked={!!field.value}
            onClick={() => field.onChange(!field.value)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${field.value ? 'bg-brand-600' : 'bg-white/10'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${field.value ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        )}
      />
      <span className="text-sm text-ink-200">{label}</span>
    </label>
  );

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      {/* ── Vertical card sections ─────────────────────────────────────────── */}
      <div className="space-y-6 pb-24">

        {/* 1. Basic Info */}
        <Section icon={FolderKanban} title="Basic Information">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Project Name *" error={errors.name?.message}>
                <input {...register('name')} className="form-input" placeholder="e.g. E-Commerce Platform" />
              </Field>
              <Field label="Project Code / SOW Number *" error={errors.code?.message}>
                <input {...register('code')} className="form-input" placeholder="e.g. SOW-2024-001" />
              </Field>
              <Field label="Project Category" error={errors.category?.message}>
                <input {...register('category')} className="form-input" placeholder="e.g. Web Development" />
              </Field>
              <Field label="Project Status *" error={errors.status?.message}>
                <select {...register('status')} className="form-select">
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="CLOSED">Closed</option>
                </select>
              </Field>
            </div>
            <Field label="Project Description" error={errors.description?.message}>
              <textarea {...register('description')} rows={4} className="form-textarea" placeholder="Describe the project scope and objectives…" />
            </Field>
          </div>
        </Section>

        {/* 2. Project Source */}
        <Section icon={Share2} title="Project Source">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Source Type" error={errors.sourceType?.message}>
                <select {...register('sourceType')} className="form-select">
                  <option value="">— Select source —</option>
                  <option value="DIRECT">Direct</option>
                  <option value="PARTNER">Partner</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="OTHER">Other</option>
                </select>
              </Field>
              {watch('sourceType') === 'PARTNER' && (
                <Field label="Partner Name *" error={errors.sourceName?.message}>
                  <input
                    {...register('sourceName')}
                    className="form-input"
                    placeholder="Enter partner organisation name"
                  />
                </Field>
              )}
            </div>
          </div>
        </Section>

        {/* 3. Client Info */}
        <Section icon={Building2} title="Client Information">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Client Name" error={errors.clientName?.message}>
                <input {...register('clientName')} className="form-input" placeholder="John Smith" />
              </Field>
              <Field label="Client Company" error={errors.clientCompany?.message}>
                <input {...register('clientCompany')} className="form-input" placeholder="Acme Corporation" />
              </Field>
              <Field label="Client Email" error={errors.clientEmail?.message}>
                <input {...register('clientEmail')} type="email" className="form-input" placeholder="client@company.com" />
              </Field>
              <Field label="Client Phone" error={errors.clientPhone?.message}>
                <input {...register('clientPhone')} className="form-input" placeholder="+1 555 000 0000" />
              </Field>
            </div>
          </div>
        </Section>

        {/* 3. Timeline */}
        <Section icon={CalendarRange} title="Project Timeline">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Field label="Start Date" error={errors.startDate?.message}>
                <input {...register('startDate')} type="date" className="form-input" />
              </Field>
              <Field label="End Date" error={errors.endDate?.message}>
                <input {...register('endDate')} type="date" className="form-input" />
              </Field>
              <Field label="Estimated Completion Date" error={errors.estimatedCompletionDate?.message}>
                <input {...register('estimatedCompletionDate')} type="date" className="form-input" />
              </Field>
            </div>
            <Field label="Project Phase *" error={errors.phase?.message}>
              <select {...register('phase')} className="form-select md:w-1/3">
                <option value="PLANNING">Planning</option>
                <option value="EXECUTION">Execution</option>
                <option value="DELIVERY">Delivery</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </Field>
          </div>
        </Section>

        {/* 4. Engineers */}
        <Section icon={Users2} title="Resource Assignment">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-400">Total allocation must not exceed 300%.</p>
              <button
                type="button"
                onClick={() => appendEngineer({ engineer: '', role: 'ENGINEER', allocationPercentage: 100, startDate: '', endDate: '' })}
                className="btn-secondary text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Add Engineer
              </button>
            </div>

            {engineerFields.length === 0 && (
              <div className="text-center py-10 text-ink-500 border-2 border-dashed rounded-xl text-sm" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
                No engineers assigned yet. Click "Add Engineer" to begin.
              </div>
            )}

            <div className="space-y-3">
              {engineerFields.map((field, i) => (
                <div key={field.id} className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="grid grid-cols-12 gap-3 items-start">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="form-label">Engineer *</label>
                      <select {...register(`engineers.${i}.engineer`)} className="form-select">
                        <option value="">— Select —</option>
                        {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                      </select>
                      {errors.engineers?.[i]?.engineer && <p className="form-error">{errors.engineers[i]?.engineer?.message}</p>}
                    </div>
                    <div className="col-span-6 sm:col-span-4">
                      <label className="form-label">Role</label>
                      <select {...register(`engineers.${i}.role`)} className="form-select">
                        <option value="LEAD_ENGINEER">Lead Engineer</option>
                        <option value="ENGINEER">Engineer</option>
                        <option value="REVIEWER">Reviewer</option>
                      </select>
                    </div>
                    <div className="col-span-5 sm:col-span-2">
                      <label className="form-label">Allocation %</label>
                      <input {...register(`engineers.${i}.allocationPercentage`)} type="number" min="0" max="100" className="form-input" />
                    </div>
                    <div className="col-span-1 flex justify-end pt-6">
                      <button type="button" onClick={() => removeEngineer(i)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label">Timesheet Start Date</label>
                      <input {...register(`engineers.${i}.startDate`)} type="date" className="form-input" />
                    </div>
                    <div>
                      <label className="form-label">Timesheet End Date</label>
                      <input {...register(`engineers.${i}.endDate`)} type="date" className="form-input" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* 5. Billing */}
        <Section icon={CreditCard} title="Contract & Billing">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Field label="Contracted Hours" error={errors.contractedHours?.message}>
                <input {...register('contractedHours')} type="number" min="0" className="form-input" />
              </Field>
              <Field label="Additional Approved Hours" error={errors.additionalApprovedHours?.message}>
                <input {...register('additionalApprovedHours')} type="number" min="0" className="form-input" />
              </Field>
              <div>
                <label className="form-label">Total Authorized Hours</label>
                <div className="form-input font-semibold cursor-not-allowed" style={{ background: 'rgba(99,102,241,0.10)', color: 'rgb(129,140,248)' }}>{totalAuthorized}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Field label="Hourly Rate" error={errors.hourlyRate?.message}>
                <input {...register('hourlyRate')} type="number" min="0" step="0.01" className="form-input" />
              </Field>
              <Field label="Currency" error={errors.currency?.message}>
                <select {...register('currency')} className="form-select">
                  <option value="USD">USD</option>
                  <option value="INR">INR</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Billing Type" error={errors.billingType?.message}>
                <select {...register('billingType')} className="form-select">
                  <option value="TIME_AND_MATERIAL">Time and Material</option>
                  <option value="FIXED_PRICE">Fixed Price</option>
                  <option value="MILESTONE">Milestone</option>
                </select>
              </Field>
              <Field label="Billing Cycle" error={errors.billingCycle?.message}>
                <select {...register('billingCycle')} className="form-select">
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="MILESTONE_BASED">Milestone Based</option>
                </select>
              </Field>
            </div>
          </div>
        </Section>

        {/* 6. Monitoring */}
        <Section icon={Activity} title="Hours Monitoring">
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label="Maximum Allowed Hours" error={errors.maxAllowedHours?.message}>
                <input {...register('maxAllowedHours')} type="number" min="0" className="form-input" />
              </Field>
              <Field label="Alert Threshold (%)" error={errors.alertThreshold?.message}>
                <input {...register('alertThreshold')} type="number" min="0" max="100" className="form-input" placeholder="e.g. 80" />
              </Field>
            </div>
            <div className="p-4 rounded-xl text-sm text-amber-300" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
              When hours used exceed <strong>{watch('alertThreshold') || 80}%</strong> of max allowed hours, the admin will be notified.
            </div>
          </div>
        </Section>

        {/* 7. Payment */}
        <Section icon={Banknote} title="Payment Configuration">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Payment Terms" error={errors.paymentTerms?.message}>
              <select {...register('paymentTerms')} className="form-select">
                <option value="NET_30">Net 30</option>
                <option value="NET_45">Net 45</option>
                <option value="NET_60">Net 60</option>
              </select>
            </Field>
            <Field label="TDS Percentage (%)" error={errors.tdsPercentage?.message}>
              <input {...register('tdsPercentage')} type="number" min="0" max="100" step="0.01" className="form-input" />
            </Field>
            <Field label="Payment Mode" error={errors.paymentMode?.message}>
              <select {...register('paymentMode')} className="form-select">
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="WIRE_TRANSFER">Wire Transfer</option>
                <option value="UPI">UPI</option>
              </select>
            </Field>
            <Field label="Billing Contact Email" error={errors.billingContactEmail?.message}>
              <input {...register('billingContactEmail')} type="email" className="form-input" placeholder="billing@client.com" />
            </Field>
          </div>
        </Section>

        {/* 8. Client Access */}
        <Section icon={ShieldCheck} title="Client Access">
          <div className="space-y-5">
            <Toggle name="clientAccessEnabled" label="Enable client portal access" />
            <div className="pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-4">Client View Permissions</p>
              <p className="text-xs text-ink-500 mb-3">Executive Ops users can view these sections but cannot edit any data.</p>
              <div className="space-y-3">
                <Toggle name="canViewSummary" label="Can view Project Summary" />
                <Toggle name="canViewTimesheets" label="Can view Timesheets" />
                <Toggle name="canViewPayments" label="Can view Payment History" />
                <Toggle name="canViewStatus" label="Can view Project Status" />
              </div>
            </div>
          </div>
        </Section>

        {/* 9. Permissions */}
        <Section icon={Settings2} title="Engineer Permissions">
          <div className="space-y-5">
            <div className="space-y-4">
              <Toggle name="engineersCanEditTimesheets" label="Engineers can edit timesheets" />
              <Toggle name="timesheetApprovalRequired" label="Timesheet approval required" />
            </div>
            <Field label="Timesheet Lock Period (days)" error={errors.timesheetLockPeriod?.message}>
              <select {...register('timesheetLockPeriod')} className="form-select md:w-48">
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </Field>
            <div className="p-4 rounded-xl text-sm text-brand-300" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
              After <strong>{watch('timesheetLockPeriod')} days</strong>, engineers will not be able to edit timesheet entries.
            </div>
          </div>
        </Section>

        {/* 10. Notes & Custom Fields */}
        <Section icon={StickyNote} title="Notes & Custom Fields">
          <div className="space-y-6">
            <Field label="Notes" error={errors.notes?.message}>
              <textarea {...register('notes')} rows={4} className="form-textarea" placeholder="Add project notes, documentation links, or any relevant information…" />
            </Field>

            <div className="pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Custom Fields</p>
                <button
                  type="button"
                  onClick={() => appendCustomField({ name: '', type: 'TEXT', value: '' })}
                  className="btn-secondary text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Field
                </button>
              </div>

              {customFieldFields.length === 0 && (
                <p className="text-sm text-ink-500 text-center py-6 border-2 border-dashed rounded-xl" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
                  No custom fields. Click "Add Field" to define dynamic fields.
                </p>
              )}

              <div className="space-y-3">
                {customFieldFields.map((field, i) => (
                  <div key={field.id} className="grid grid-cols-12 gap-3 items-start p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="col-span-12 sm:col-span-4">
                      <label className="form-label">Field Name *</label>
                      <input {...register(`customFields.${i}.name`)} className="form-input" placeholder="e.g. Cost Center" />
                      {errors.customFields?.[i]?.name && <p className="form-error">{errors.customFields[i]?.name?.message}</p>}
                    </div>
                    <div className="col-span-6 sm:col-span-3">
                      <label className="form-label">Type</label>
                      <select {...register(`customFields.${i}.type`)} className="form-select">
                        <option value="TEXT">Text</option>
                        <option value="NUMBER">Number</option>
                        <option value="DROPDOWN">Dropdown</option>
                        <option value="DATE">Date</option>
                      </select>
                    </div>
                    <div className="col-span-5 sm:col-span-4">
                      <label className="form-label">Default Value</label>
                      <input {...register(`customFields.${i}.value`)} className="form-input" placeholder="Optional default" />
                    </div>
                    <div className="col-span-1 flex justify-end pt-6">
                      <button type="button" onClick={() => removeCustomField(i)} className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* ── Sticky submit bar ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-64 right-0 px-8 py-4 flex items-center justify-end gap-3 z-20" style={{ background: 'rgba(5,8,22,0.88)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 -8px 32px rgba(0,0,0,0.40)' }}>
        <span className="text-xs text-ink-400 mr-auto">All sections are visible — scroll up to review before submitting.</span>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}