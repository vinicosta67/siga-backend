import express from 'express';
import { register, login, updateUser, updatePfDetails, updatePjDetails, getUserByIdentifier } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/:identifier', protect, getUserByIdentifier);
router.put('/:id', protect, updateUser);
router.put('/:id/pf', protect, updatePfDetails);
router.put('/:id/pj', protect, updatePjDetails);

export default router;
