import express from 'express';
import { getUsers, getUserById, updateUserRole } from '../controllers/userController.js';
import { protect, requireAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', requireAdmin, getUsers);
router.get('/:id', getUserById);
router.put('/:id/role', requireAdmin, updateUserRole);

export default router;
