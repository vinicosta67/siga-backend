import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { signDocument, rejectDocument, getDocumentSignatures } from '../controllers/documentController.js';

const router = express.Router();

router.use(protect);

router.post('/:id/sign', signDocument);
router.post('/:id/reject', rejectDocument);
router.get('/:id/signatures', getDocumentSignatures);

export default router;
