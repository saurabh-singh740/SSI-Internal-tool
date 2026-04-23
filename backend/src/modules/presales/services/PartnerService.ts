import Partner, { IPartner } from '../../../models/Partner';
import mongoose from 'mongoose';

export interface PartnerFilter {
  isActive?: boolean;
  type?:     string;
}

export interface PartnerCreateData {
  name:          string;
  type?:         string;
  contactName?:  string;
  contactEmail?: string;
  contactPhone?: string;
  website?:      string;
  country?:      string;
  notes?:        string;
}

export async function listPartners(filter: PartnerFilter = {}): Promise<IPartner[]> {
  const query: Record<string, unknown> = {};
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  if (filter.type)                   query.type     = filter.type;
  return Partner.find(query).sort({ isDefault: -1, name: 1 }).lean() as unknown as IPartner[];
}

export async function getPartnerById(id: string): Promise<IPartner | null> {
  return Partner.findById(id).lean() as unknown as IPartner | null;
}

export async function createPartner(
  data:    PartnerCreateData,
  actorId: string
): Promise<IPartner> {
  const partner = new Partner({
    ...data,
    isDefault: false,
    createdBy: new mongoose.Types.ObjectId(actorId),
  });
  await partner.save();
  return partner;
}

export async function updatePartner(
  id:   string,
  data: Partial<PartnerCreateData> & { isActive?: boolean }
): Promise<IPartner | null> {
  const updated = await Partner.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  ).lean();
  return updated as unknown as IPartner | null;
}

export async function deactivatePartner(id: string): Promise<IPartner | null> {
  const partner = await Partner.findById(id);
  if (!partner) return null;
  if (partner.isDefault) {
    const err = new Error('Cannot deactivate the default SSI partner');
    (err as any).statusCode = 400;
    throw err;
  }
  partner.isActive = false;
  await partner.save();
  return partner;
}

export async function deletePartner(id: string): Promise<void> {
  const partner = await Partner.findById(id);
  if (!partner) return;
  if (partner.isDefault) {
    const err = new Error('Cannot delete the default SSI partner');
    (err as any).statusCode = 400;
    throw err;
  }
  await Partner.deleteOne({ _id: id });
}

export async function getDefaultPartner(): Promise<IPartner | null> {
  return Partner.findOne({ isDefault: true }).lean() as unknown as IPartner | null;
}

export async function seedDefaultPartner(actorId: mongoose.Types.ObjectId): Promise<void> {
  const existing = await Partner.findOne({ isDefault: true });
  if (existing) return;
  await Partner.create({
    name:      'Stallion SI (Internal)',
    type:      'INTERNAL',
    isDefault: true,
    isActive:  true,
    createdBy: actorId,
  });
  console.log('[PartnerService] Default SSI partner seeded.');
}
