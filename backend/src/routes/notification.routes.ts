import { Router } from 'express';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '../controllers/notification.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

router.use(protect); // all notification routes require auth

router.get('/',              getNotifications);
router.get('/unread-count',  getUnreadCount);
router.patch('/read-all',    markAllAsRead);
router.patch('/:id/read',    markAsRead);

export default router;
