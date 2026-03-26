import express from 'express';
import { createVisit, getVisits, updateVisit, getVisitsDashboard } from '../controllers/visitController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/', protect, createVisit);
// É importante que /dashboard venha antes de /:id para não ser interpretado como um ID
router.get('/dashboard', protect, getVisitsDashboard);
router.get('/', protect, getVisits);
router.put('/:id', protect, updateVisit);

export default router;
