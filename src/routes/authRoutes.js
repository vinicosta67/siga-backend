import express from 'express';
import { register, login, updateUser } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.put('/:id', protect, updateUser);

export default router;
