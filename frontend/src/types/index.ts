export type UserRole = 'ADMIN' | 'ENGINEER' | 'CUSTOMER';
export type ProjectType = 'INTERNAL' | 'CLIENT_PROJECT' | 'SUPPORT';
export type ProjectStatus = 'ACTIVE' | 'CLOSED' | 'ON_HOLD';
export type ProjectSourceType = 'DIRECT' | 'PARTNER' | 'REFERRAL' | 'OTHER';
export type ProjectPhase = 'PLANNING' | 'EXECUTION' | 'DELIVERY' | 'MAINTENANCE';
export type Currency = 'USD' | 'INR' | 'EUR';
export type BillingType = 'TIME_AND_MATERIAL' | 'FIXED_PRICE' | 'MILESTONE';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'MILESTONE_BASED';
export type PaymentTerms = 'NET_30' | 'NET_45' | 'NET_60';
export type PaymentMode = 'BANK_TRANSFER' | 'WIRE_TRANSFER' | 'UPI';
export type EngineerRole = 'LEAD_ENGINEER' | 'ENGINEER' | 'REVIEWER';
export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DROPDOWN' | 'DATE';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export interface ProjectEngineer {
  engineer: User | string;
  role: EngineerRole;
  allocationPercentage: number;
  startDate?: string;
  endDate?: string;
}

export interface CustomField {
  _id?: string;
  name: string;
  type: CustomFieldType;
  value?: string;
  options?: string[];
}

export interface Attachment {
  _id?: string;
  filename: string;
  originalName: string;
  fileType: string;
  url: string;
  uploadedAt: string;
}

export interface Project {
  _id: string;
  name: string;
  code: string;
  type: ProjectType;
  category?: string;
  status: ProjectStatus;
  description?: string;

  sourceType?: ProjectSourceType;
  sourceName?: string;

  clientName?: string;
  clientCompany?: string;
  clientEmail?: string;
  clientPhone?: string;

  startDate?: string;
  endDate?: string;
  estimatedCompletionDate?: string;
  phase: ProjectPhase;

  contractedHours: number;
  additionalApprovedHours: number;
  totalAuthorizedHours: number;
  hourlyRate: number;
  currency: Currency;
  billingType: BillingType;
  billingCycle: BillingCycle;

  maxAllowedHours: number;
  alertThreshold: number;
  isNearLimit: boolean;

  paymentTerms: PaymentTerms;
  tdsPercentage: number;
  paymentMode: PaymentMode;
  billingContactEmail?: string;

  clientAccessEnabled: boolean;
  canViewSummary: boolean;
  canViewTimesheets: boolean;
  canViewPayments: boolean;
  canViewStatus: boolean;

  engineersCanEditTimesheets: boolean;
  timesheetApprovalRequired: boolean;
  timesheetLockPeriod: 7 | 14 | 30;

  engineers: ProjectEngineer[];
  customFields: CustomField[];
  attachments: Attachment[];
  notes?: string;

  hoursUsed: number;
  remainingHours: number;
  utilizationPercentage: number;
  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFormData {
  name: string;
  code: string;
  type: ProjectType;
  category?: string;
  status: ProjectStatus;
  description?: string;
  sourceType?: ProjectSourceType;
  sourceName?: string;
  clientName?: string;
  clientCompany?: string;
  clientEmail?: string;
  clientPhone?: string;
  startDate?: string;
  endDate?: string;
  estimatedCompletionDate?: string;
  phase: ProjectPhase;
  contractedHours: number;
  additionalApprovedHours: number;
  hourlyRate: number;
  currency: Currency;
  billingType: BillingType;
  billingCycle: BillingCycle;
  maxAllowedHours: number;
  alertThreshold: number;
  paymentTerms: PaymentTerms;
  tdsPercentage: number;
  paymentMode: PaymentMode;
  billingContactEmail?: string;
  clientAccessEnabled: boolean;
  canViewSummary: boolean;
  canViewTimesheets: boolean;
  canViewPayments: boolean;
  canViewStatus: boolean;
  engineersCanEditTimesheets: boolean;
  timesheetApprovalRequired: boolean;
  timesheetLockPeriod: 7 | 14 | 30;
  engineers: { engineer: string; role: EngineerRole; allocationPercentage: number; startDate?: string; endDate?: string }[];
  customFields: CustomField[];
  notes?: string;
}

export interface ProjectStats {
  total: number;
  active: number;
  closed: number;
  onHold: number;
  nearLimit: number;
}

// ── Timesheet types ───────────────────────────────────────────────────────────

export interface TimesheetEntry {
  _id: string;
  sno: number;
  week: number;
  dayOfWeek: string;
  date: string;          // ISO string
  projectWork: string;
  hours: number;
  minutes: number;
  totalHours: number;
  remarks: string;
}

export interface WeeklyTotal {
  week: number;
  total: number;
}

export interface MonthSheet {
  _id: string;
  monthIndex: number;   // 0–11
  monthName: string;
  entries: TimesheetEntry[];
  weeklyTotals: WeeklyTotal[];
  monthlyTotal: number;
  authorizedHoursUsedUpToMonth: number;
  authorizedHoursRemainingAfterMonth: number;
  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;
}

// ── Payment types ─────────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'received' | 'overdue' | 'partial';

export interface Payment {
  _id:                string;
  projectId:          Project | string;
  invoiceNumber?:     string;
  invoiceMonth:       string;
  billingPeriodStart?: string;
  billingPeriodEnd?:   string;
  paymentDate:        string;
  grossAmount:        number;
  tdsAmount:          number;
  netAmount:          number;
  currency:           Currency;
  paidToAccount?:     string;
  referenceUTR?:      string;
  notes?:             string;
  status:             PaymentStatus;
  createdBy:          User | string;
  createdAt:          string;
  updatedAt:          string;
}

export interface PaymentSummary {
  totalRevenue:      number;
  last30DaysRevenue: number;
  last30DaysCount:   number;
  overdueCount:      number;
  pendingAmount:     number;
  pendingCount:      number;
}

export interface AuditChange {
  field:    string;
  oldValue: unknown;
  newValue: unknown;
}

export interface PaymentAuditLog {
  _id:       string;
  paymentId: string;
  projectId: string;
  action:    'created' | 'updated' | 'deleted';
  changedBy: User | string;
  changedAt: string;
  changes:   AuditChange[];
}

// ─────────────────────────────────────────────────────────────────────────────

export interface Timesheet {
  _id: string;
  project: string;
  engineer: string;
  year: number;
  months: MonthSheet[];
  createdAt: string;
  updatedAt: string;
}

// ── Pre-Sales / Deal types ────────────────────────────────────────────────────

export type DealStage      = 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type DealPriority   = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DealSource     = 'REFERRAL' | 'INBOUND' | 'OUTBOUND' | 'PARTNER' | 'EXISTING_CLIENT';
export type DealLostReason = 'PRICE' | 'COMPETITOR' | 'TIMELINE' | 'NO_BUDGET' | 'NO_RESPONSE' | 'OTHER';
export type DealBillingType = 'TIME_AND_MATERIAL' | 'FIXED_PRICE' | 'MILESTONE';

export interface DealContact {
  name:   string;
  email?: string;
  phone?: string;
  role?:  string;
}

export interface SOWSection {
  _id?:    string;
  title:   string;
  content: string;
  order:   number;
}

// ── Resource Plan / Timesheet preview types ────────────────────────────────────

export interface ResourcePlanEntry {
  engineer:             User | string;
  role:                 EngineerRole;
  allocationPercentage: number;
  startDate?:           string;
  endDate?:             string;
  totalAuthorizedHours?: number;
}

export interface MonthlyProjection {
  year:          number;
  month:         number;   // 1–12
  monthName:     string;
  workingDays:   number;
  expectedHours: number;
}

export interface EngineerProjection {
  engineerId:         string;
  months:             MonthlyProjection[];
  totalExpectedHours: number;
}

export interface TimesheetPreviewResult {
  projections:   EngineerProjection[];
  totalHours:    number;
  totalMonths:   number;
  engineerCount: number;
  resourcePlan:  ResourcePlanEntry[];
}

export interface Deal {
  _id:        string;
  title:      string;
  dealNumber: string;
  stage:      DealStage;
  priority:   DealPriority;

  clientCompany: string;
  clientDomain?: string;
  contacts:      DealContact[];

  source?:     DealSource;
  referredBy?: string;

  estimatedValue:  number;
  currency:        Currency;
  estimatedHours?: number;
  proposedRate?:   number;
  billingType?:    DealBillingType;

  expectedCloseDate?:  string;
  proposedStartDate?:  string;
  proposedEndDate?:    string;

  sowSections:  SOWSection[];
  sowFinalised: boolean;
  winProbability: number;

  lostReason?: DealLostReason;
  lostNote?:   string;

  owner: User | string;
  team:  (User | string)[];

  convertedProjectId?: { _id: string; name: string; code: string } | string;
  partnerId?:          { _id: string; name: string; type: PartnerType; isDefault: boolean } | string;
  convertedAt?:  string;
  convertedBy?:  User | string;

  resourcePlan?: ResourcePlanEntry[];
  customFields: CustomField[];
  tags:         string[];
  isArchived:   boolean;

  createdBy: User | string;
  createdAt: string;
  updatedAt: string;
}

export type PipelineData = Record<DealStage, Deal[]>;

export interface DealActivity {
  _id:    string;
  dealId: string;
  type:   'STAGE_CHANGED' | 'NOTE_ADDED' | 'SOW_UPDATED' | 'CONTACT_ADDED' | 'VALUE_CHANGED' | 'CONVERTED' | 'FIELD_CHANGED';
  actor:  User | string;
  meta: {
    fromStage?:  DealStage;
    toStage?:    DealStage;
    fieldName?:  string;
    oldValue?:   unknown;
    newValue?:   unknown;
    note?:       string;
    projectId?:  string;
  };
  createdAt: string;
}

export interface ConversionOverrides {
  name?:            string;
  code?:            string;
  type?:            ProjectType;
  clientName?:      string;
  clientCompany?:   string;
  clientEmail?:     string;
  clientPhone?:     string;
  startDate?:       string;
  endDate?:         string;
  billingType?:     BillingType;
  hourlyRate?:      number;
  currency?:        Currency;
  contractedHours?: number;
}

// ── Partner ───────────────────────────────────────────────────────────────────

export type PartnerType = 'INTERNAL' | 'RESELLER' | 'REFERRAL' | 'TECHNOLOGY' | 'IMPLEMENTATION';

export interface Partner {
  _id:           string;
  name:          string;
  type:          PartnerType;
  contactName?:  string;
  contactEmail?: string;
  contactPhone?: string;
  website?:      string;
  country?:      string;
  notes?:        string;
  isDefault:     boolean;
  isActive:      boolean;
  createdBy:     User | string;
  createdAt:     string;
  updatedAt:     string;
}

// ── Deal Attachment ───────────────────────────────────────────────────────────

export type AttachmentCategory = 'SOW' | 'PROPOSAL' | 'CONTRACT' | 'CLIENT_DOCUMENT' | 'OTHER';

export interface DealAttachment {
  _id:          string;
  dealId:       string;
  url:          string;
  publicId?:    string;
  storageKey?:  string;
  originalName: string;
  filename:     string;
  mimeType:     string;
  sizeBytes:    number;
  category:     AttachmentCategory;
  uploadedBy:   User | string;
  createdAt:    string;
  updatedAt:    string;
}