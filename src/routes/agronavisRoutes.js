import express from 'express';
import { analyzeAgronavis } from '../controllers/agronavisController.js';

const router = express.Router();

router.post('/analyze', analyzeAgronavis);

export default router;
