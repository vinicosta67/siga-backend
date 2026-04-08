import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
    createProposal,
    updateProposal,
    uploadDocument,
    uploadBuffer,
    getProposals,
    getProposalById,
    getTimelineEvents,
    createTimelineEvent,
    getProposalsStats
} from '../controllers/proposalController.js';

const router = express.Router();

router.post('/', protect, createProposal);
router.get('/', protect, getProposals);
router.get('/stats', protect, getProposalsStats);
router.get('/:proposalId', protect, getProposalById);
router.put('/:proposalId', protect, updateProposal);
router.post('/:proposalId/documents', protect, uploadBuffer.single('documentFile'), uploadDocument);

// Rotas de Timeline
router.get('/:proposalId/timeline', protect, getTimelineEvents);
router.post('/:proposalId/timeline', protect, createTimelineEvent);

export default router;
