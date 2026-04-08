import express from 'express';
import { getUsers, getUserById } from '../controllers/userController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getUsers);
router.get('/:id', getUserById);

export default router;
