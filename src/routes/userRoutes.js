import express from 'express';
import { getUsers, getUserById, updateUserRole, updateUserBasicInfo } from '../controllers/userController.js';
import { protect, requireAdmin, requireEmployee } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', requireEmployee, getUsers);
router.get('/:id', requireEmployee, getUserById);
router.put('/:id/role', requireAdmin, updateUserRole);
router.put('/:id', requireEmployee, updateUserBasicInfo);

export default router;
