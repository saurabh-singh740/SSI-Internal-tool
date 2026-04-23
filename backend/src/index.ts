// ⚠ THIS MUST BE THE FIRST IMPORT — loads .env before any module reads process.env
import './config/env';

import mongoose from 'mongoose';
import connectDB from './config/db';
import app from './app';
import { startPaymentScheduler } from './utils/paymentScheduler';
import { registerProjectHandlers } from './events/handlers/projectHandler';
import { registerDealHandlers }    from './events/handlers/dealHandler';
import { seedDefaultPartner }      from './modules/presales/services/PartnerService';
import User                        from './models/User';

const PORT = process.env.PORT || 5001;

// ── Database ──────────────────────────────────────────────────────────────────
connectDB();

// ── Background event handlers — must register BEFORE server listens ──────────
// Ensures no events are emitted before handlers exist.
registerProjectHandlers();
registerDealHandlers();

// ── Start server ──────────────────────────────────────────────────────────────
let schedulerHandle: ReturnType<typeof setInterval> | undefined;

const server = app.listen(PORT, async () => {
  console.log(`[Server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  schedulerHandle = startPaymentScheduler();

  // Seed the default SSI internal partner (no-op if already exists)
  try {
    const adminUser = await User.findOne({ role: 'ADMIN' }).lean();
    if (adminUser) {
      await seedDefaultPartner(adminUser._id as any);
    }
  } catch (err) {
    console.error('[Server] Failed to seed default partner:', err);
  }
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
function gracefulShutdown(signal: string): void {
  console.log(`[Server] ${signal} received — shutting down gracefully…`);
  if (schedulerHandle) clearInterval(schedulerHandle);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('[Server] MongoDB connection closed');
    } catch (err) {
      console.error('[Server] Error closing MongoDB:', err);
    }
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

export default app;
