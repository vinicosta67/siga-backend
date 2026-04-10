import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getUsers = async (req, res) => {
    try {
        const search = req.query.search;
        let whereClause = {};

        if (search) {
            whereClause = {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } }
                ]
            };
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                email: true,
                pfType: true,
                createdAt: true,
                permissions: { select: { id: true } },
                pessoaFisica: { select: { cpf: true } },
                pessoaJuridica: { select: { cnpj: true } }
            }
        });

        const formattedUsers = users.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            pfType: user.pfType,
            permissionId: user.permissions.length > 0 ? user.permissions[0].id : null,
            createdAt: user.createdAt,
            pfDetails: user.pfType === 'FISICA' && user.pessoaFisica ? { cpf: user.pessoaFisica.cpf } : null,
            pjDetails: user.pfType === 'JURIDICA' && user.pessoaJuridica ? { cnpj: user.pessoaJuridica.cnpj } : null
        }));

        res.json(formattedUsers);
    } catch (error) {
        console.error('Erro ao buscar clientes: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                pessoaFisica: true,
                pessoaJuridica: true,
                visits: true,
                proposals: {
                    include: {
                        documents: true,
                        timelineEvents: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'Cliente não encontrado.' });
        }

        const interactions = [];

        user.visits.forEach(visit => {
            interactions.push({
                id: visit.id,
                date: visit.scheduledAt,
                type: "Visita",
                subject: `Visita ${visit.status}`,
                summary: visit.opportunities && visit.opportunities.length > 0 
                         ? `Oportunidades identificadas: ${visit.opportunities.join(', ')}` 
                         : `Visita agendada para ${visit.clientName} no endereço: ${visit.address}`,
                nextStep: visit.status === 'CONCLUIDA' ? 'Acompanhar' : 'Aguardar Visita'
            });
        });

        user.proposals.forEach(proposal => {
            proposal.timelineEvents.forEach(evt => {
                interactions.push({
                    id: evt.id,
                    date: evt.createdAt,
                    type: "Sistema",
                    subject: `Log de Proposta - ${proposal.title}`,
                    summary: evt.content && evt.content.summary ? evt.content.summary : `Evento registrado: ${evt.eventType}`,
                    nextStep: evt.content && evt.content.nextStep ? evt.content.nextStep : "N/A"
                });
            });

            proposal.documents.forEach(doc => {
                interactions.push({
                    id: doc.id,
                    date: doc.createdAt,
                    type: "Sistema",
                    subject: "Inclusão de Documento",
                    summary: `Documento "${doc.originalName}" adicionado à proposta de ${proposal.type}.`,
                    nextStep: "N/A"
                });
            });
        });

        interactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            pfType: user.pfType,
            pfDetails: user.pfType === 'FISICA' ? (user.pessoaFisica || null) : null,
            pjDetails: user.pfType === 'JURIDICA' ? (user.pessoaJuridica || null) : null,
            interactions
        });
    } catch (error) {
        console.error('Erro ao buscar detalhes do cliente: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { permissionId } = req.body;

        if (!permissionId) {
            return res.status(400).json({ success: false, message: "permissionId é obrigatório" });
        }

        const user = await prisma.user.findUnique({ where: { id }, include: { permissions: true } });
        if (!user) {
            return res.status(404).json({ success: false, message: "Usuário não encontrado" });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                permissions: {
                    set: [], 
                    connect: { id: Number(permissionId) } 
                }
            },
            select: {
                id: true,
                name: true,
                email: true,
                permissions: true
            }
        });

        res.json({
            success: true,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                permissionId: updatedUser.permissions.length > 0 ? updatedUser.permissions[0].id : null
            }
        });

    } catch (error) {
        console.error("Erro ao alterar papel do usuário: ", error);
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
};

export const updateUserBasicInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, zip, state, city, neighborhood, address, pfType } = req.body;

        const isEmployee = req.user.permissions?.some(p => [1001, 1002, 1005].includes(p.id));
        if (req.user.id !== id && !isEmployee) {
            return res.status(403).json({ success: false, message: "Sem autorização para alterar os dados deste usuário." });
        }

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) return res.status(404).json({ success: false, message: "Usuário não encontrado." });

        const updatedUser = await prisma.user.update({
             where: { id },
             data: {
                  ...(name && { name }),
                  ...(email && { email }),
                  ...(pfType && { pfType })
             },
             select: {
                  id: true,
                  name: true,
                  email: true,
                  pfType: true
             }
        });

        res.json({ success: true, message: "Dados básicos atualizados com sucesso", user: updatedUser });
    } catch(err) {
        console.error("Erro atualizando dados básicos", err);
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
};
