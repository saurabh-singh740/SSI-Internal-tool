// ⚠ THIS MUST BE THE FIRST IMPORT — loads .env before any module reads process.env
import './config/env';

import mongoose from 'mongoose';
import { ScheduledTask } from 'node-cron';
import connectDB from './config/db';
import app from './app';
import { closeRedis } from './config/redis';
import { closeQueues } from './queues/index';
import { startEngineerWorker, closeEngineerWorker } from './queues/workers/engineerWorker';
import { startAuditWorker,   closeAuditWorker }   from './queues/workers/auditWorker';
import { startPaymentScheduler }         from './utils/paymentScheduler';
import { startAuditRetentionScheduler }  from './utils/auditRetentionScheduler';
import { registerProjectHandlers } from './events/handlers/projectHandler';
import { registerDealHandlers }    from './events/handlers/dealHandler';
import { seedDefaultPartner }      from './modules/presales/services/PartnerService';
import User                        from './models/User';

const PORT = process.env.PORT || 5001;

// ── Database ──────────────────────────────────────────────────────────────────
connectDB();

// ── Background event handlers — must register BEFORE server listens ──────────
// When Redis is available, BullMQ workers handle the heavy jobs instead.
// When Redis is absent, these in-memory handlers remain active.
registerProjectHandlers();
registerDealHandlers();

// ── BullMQ workers (active only when REDIS_URL is set) ────────────────────────
startEngineerWorker();
startAuditWorker();



// ── Start server ──────────────────────────────────────────────────────────────
let schedulerTask:         ScheduledTask | undefined;
let auditRetentionTask:    ScheduledTask | undefined;

const server = app.listen(PORT, async () => {
  console.log(`[Server] Running on http://localhost:${PORT} (${process.env.NODE_ENV || 'development'})`);
  schedulerTask      = startPaymentScheduler();
  auditRetentionTask = startAuditRetentionScheduler();

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

  if (schedulerTask)      schedulerTask.stop();
  if (auditRetentionTask) auditRetentionTask.stop();

  server.close(async () => {
    try {
      await closeAuditWorker();
      await closeEngineerWorker();
      await closeQueues();
      await closeRedis();
      await mongoose.connection.close();
      console.log('[Server] All connections closed');
    } catch (err) {
      console.error('[Server] Error during shutdown:', err);
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
