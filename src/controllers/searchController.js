import prisma from '../config/db.js';

export const globalSearch = async (req, res) => {
    try {
        const query = req.query.q || '';
        
        if (!query.trim()) {
            return res.json([]);
        }

        const [proposals, users, documents] = await Promise.all([
            prisma.proposal.findMany({
                where: {
                    OR: [
                        { title: { contains: query, mode: 'insensitive' } },
                        { companyName: { contains: query, mode: 'insensitive' } }
                    ]
                },
                take: 5
            }),
            prisma.user.findMany({
                where: {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } }
                    ]
                },
                take: 5
            }),
            prisma.document.findMany({
                where: {
                    originalName: { contains: query, mode: 'insensitive' }
                },
                include: { proposal: { select: { title: true } } },
                take: 5
            })
        ]);

        const results = [];

        proposals.forEach(p => {
            results.push({
                id: p.id,
                type: 'proposta',
                title: p.title || p.companyName || 'Proposta Sem Nome',
                subtitle: `Proposta (${p.status})`,
                url: `/propostas/${p.id}`
            });
        });

        users.forEach(u => {
            results.push({
                id: u.id,
                type: 'cliente',
                title: u.name,
                subtitle: `Usuário (${u.pfType})`,
                url: `/clientes/${u.id}`
            });
        });

        documents.forEach(d => {
            results.push({
                id: d.id,
                type: 'documento',
                title: d.originalName,
                subtitle: `Anexo de: ${d.proposal?.title || 'Desconhecida'}`,
                url: `/propostas/${d.proposalId}`
            });
        });

        res.json(results);
    } catch (error) {
        console.error("Erro no Global Search:", error);
        res.status(500).json({ error: "Erro interno no servidor ao realizar busca geral." });
    }
};
