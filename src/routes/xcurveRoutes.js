import express from 'express';
import { analyzeXCurve } from '../controllers/xcurveController.js';

const router = express.Router();

router.post('/analyze', analyzeXCurve);

export default router;
