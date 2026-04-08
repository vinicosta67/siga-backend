import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
    createProposal,
    updateProposal,
    getProposals,
    getProposalById,
    uploadDocument,
    uploadBuffer,
    getTimelineEvents,
    createTimelineEvent
} from '../controllers/proposalController.js';

const router = express.Router();

router.use(protect);

router.post('/', createProposal);
router.get('/', getProposals);
router.get('/:proposalId', getProposalById);
router.put('/:proposalId', updateProposal);

router.post('/:proposalId/documents', uploadBuffer.single('documentFile'), uploadDocument);

router.get('/:proposalId/timeline', getTimelineEvents);
router.post('/:proposalId/timeline', createTimelineEvent);

export default router;
