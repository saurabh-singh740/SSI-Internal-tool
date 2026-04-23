/**
 * DealAttachment — standalone collection, NOT embedded in Deal.
 *
 * Keeping attachments separate from the Deal document avoids hitting
 * MongoDB's 16 MB per-document limit and lets attachments be paginated
 * independently. The cloud storage URL is the source of truth for the file;
 * this collection stores only metadata.
 */
import mongoose, { Document, Schema } from 'mongoose';

export type AttachmentCategory = 'SOW' | 'PROPOSAL' | 'CONTRACT' | 'CLIENT_DOCUMENT' | 'OTHER';

export interface IDealAttachment extends Document {
  dealId:      mongoose.Types.ObjectId;

  // Cloud storage
  url:          string;   // Cloudinary / S3 public or signed URL
  publicId?:    string;   // Cloudinary public_id (needed for deletion)
  storageKey?:  string;   // S3 key (needed for deletion / signed URLs)

  // File metadata
  originalName: string;
  filename:     string;   // sanitised unique name stored in cloud
  mimeType:     string;
  sizeBytes:    number;
  category:     AttachmentCategory;

  uploadedBy: mongoose.Types.ObjectId;
  createdAt:  Date;
  updatedAt:  Date;
}

const DealAttachmentSchema = new Schema<IDealAttachment>(
  {
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', required: true },

    url:       { type: String, required: true },
    publicId:  { type: String },
    storageKey:{ type: String },

    originalName: { type: String, required: true, trim: true },
    filename:     { type: String, required: true },
    mimeType:     { type: String, required: true },
    sizeBytes:    { type: Number, required: true, min: 0 },
    category: {
      type:    String,
      enum:    ['SOW', 'PROPOSAL', 'CONTRACT', 'CLIENT_DOCUMENT', 'OTHER'],
      default: 'OTHER',
    },

    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Primary access pattern: all attachments for a deal, newest first
DealAttachmentSchema.index({ dealId: 1, createdAt: -1 });

export default mongoose.model<IDealAttachment>('DealAttachment', DealAttachmentSchema);
