import dotenv from 'dotenv';
dotenv.config();

// ── Production guard ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error('[Seed] REFUSED: seed script cannot run in production (NODE_ENV=production)');
  process.exit(1);
}

import mongoose from 'mongoose';
import User from './models/User';
import Project from './models/Project';

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/admin_project_setup');
  console.log('Connected to MongoDB');

  // Clear existing data
  await User.deleteMany({});
  await Project.deleteMany({});

  // Create users
  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'admin123',
    role: 'ADMIN',
    phone: '+1-555-0100',
  });

  const eng1 = await User.create({
    name: 'Alice Engineer',
    email: 'alice@example.com',
    password: 'alice123',
    role: 'ENGINEER',
    phone: '+1-555-0101',
  });

  const eng2 = await User.create({
    name: 'Bob Engineer',
    email: 'bob@example.com',
    password: 'bob123',
    role: 'ENGINEER',
    phone: '+1-555-0102',
  });

  await User.create({
    name: 'Client User',
    email: 'client@example.com',
    password: 'client123',
    role: 'CUSTOMER',
  });

  // Create sample project
  await Project.create({
    name: 'E-Commerce Platform',
    code: 'SOW-2024-001',
    type: 'CLIENT_PROJECT',
    category: 'Web Development',
    status: 'ACTIVE',
    description: 'Full-stack e-commerce platform with React and Node.js',
    clientName: 'Acme Corp',
    clientCompany: 'Acme Corporation Ltd.',
    clientEmail: 'contact@acme.com',
    clientPhone: '+1-555-9000',
    startDate: new Date('2024-01-01'),
    endDate: new Date('2024-12-31'),
    estimatedCompletionDate: new Date('2024-11-30'),
    phase: 'EXECUTION',
    contractedHours: 1000,
    additionalApprovedHours: 200,
    hourlyRate: 150,
    currency: 'USD',
    billingType: 'TIME_AND_MATERIAL',
    billingCycle: 'MONTHLY',
    maxAllowedHours: 1200,
    alertThreshold: 80,
    paymentTerms: 'NET_30',
    tdsPercentage: 10,
    paymentMode: 'BANK_TRANSFER',
    billingContactEmail: 'billing@acme.com',
    clientAccessEnabled: true,
    canViewSummary: true,
    canViewTimesheets: true,
    canViewPayments: false,
    canViewStatus: true,
    engineersCanEditTimesheets: true,
    timesheetApprovalRequired: true,
    timesheetLockPeriod: 14,
    engineers: [
      { engineer: eng1._id, role: 'LEAD_ENGINEER', allocationPercentage: 100 },
      { engineer: eng2._id, role: 'ENGINEER', allocationPercentage: 50 },
    ],
    hoursUsed: 750,
    notes: 'Phase 1 delivery expected by Q3. Client is very responsive.',
    customFields: [
      { name: 'Cost Center', type: 'TEXT', value: 'CC-2024-WEB' },
      { name: 'Department', type: 'DROPDOWN', value: 'Engineering', options: ['Engineering', 'Design', 'QA'] },
    ],
    createdBy: admin._id,
  });

  await Project.create({
    name: 'Internal CRM Tool',
    code: 'INT-2024-002',
    type: 'INTERNAL',
    category: 'Internal Tools',
    status: 'ACTIVE',
    description: 'Customer relationship management tool for internal use',
    phase: 'PLANNING',
    contractedHours: 500,
    additionalApprovedHours: 0,
    hourlyRate: 0,
    currency: 'USD',
    billingType: 'FIXED_PRICE',
    billingCycle: 'MILESTONE_BASED',
    maxAllowedHours: 500,
    alertThreshold: 90,
    paymentTerms: 'NET_30',
    engineers: [{ engineer: eng1._id, role: 'LEAD_ENGINEER', allocationPercentage: 50 }],
    hoursUsed: 0,
    createdBy: admin._id,
  });

  console.log('\n✅ Seed complete!\n');
  console.log('Accounts:');
  console.log('  ADMIN    → admin@example.com  / admin123');
  console.log('  ENGINEER → alice@example.com  / alice123');
  console.log('  ENGINEER → bob@example.com    / bob123');
  console.log('  CUSTOMER → client@example.com / client123');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
