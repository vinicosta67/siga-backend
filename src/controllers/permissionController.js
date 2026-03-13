import prisma from '../config/db.js';

export const getPermissions = async (req, res) => {
    try {
        const permissions = await prisma.permission.findMany();
        res.json(permissions);
    } catch (error) {
        console.error('Erro ao buscar permissões: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};
