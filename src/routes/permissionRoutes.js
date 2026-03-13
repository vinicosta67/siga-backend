import express from 'express';
import { getPermissions } from '../controllers/permissionController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Todas as rotas de permissões precisarão de token
router.get('/', protect, getPermissions);

export default router;
