import express from 'express';
import { globalSearch } from '../controllers/searchController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.get('/', globalSearch);

export default router;
