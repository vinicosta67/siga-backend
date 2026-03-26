import jwt from 'jsonwebtoken';
import prisma from '../config/db.js';

export const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET || 'supersecretJWT'
            );

            req.user = await prisma.user.findUnique({
                where: { id: decoded.id },
                select: { id: true, name: true, email: true, permissions: true }
            });

            next();
        } catch (error) {
            console.error(error);
            res.status(401).json({ error: 'Não autorizado, token falhou.' });
        }
    }

    if (!token) {
        res.status(401).json({ error: 'Não autorizado, nenhum token fornecido.' });
    }
};
