import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import {
    createProposal,
    getProposals,
    getProposalById,
    uploadDocument,
    uploadBuffer
} from '../controllers/proposalController.js';

const router = express.Router();

router.use(protect);

router.post('/', createProposal);
router.get('/', getProposals);
router.get('/:proposalId', getProposalById);

router.post('/:proposalId/documents', uploadBuffer.single('documentFile'), uploadDocument);

export default router;
