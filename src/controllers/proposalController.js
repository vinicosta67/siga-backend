import prisma from '../config/db.js';
import { z } from 'zod';
import { BlobServiceClient } from '@azure/storage-blob';
import multer from 'multer';

export const uploadBuffer = multer({ storage: multer.memoryStorage() });

const createProposalSchema = z.object({
    title: z.string().min(3, 'O título é obrigatório.'),
    type: z.string().min(2, 'O tipo é obrigatório.'),
    requestedValue: z.number().positive('O valor deve ser positivo.'),
    term: z.number().int().positive('O prazo deve ser positivo.'),
    purpose: z.string().optional(),
    
    // Detalhes do Projeto de Crédito
    financedValue: z.number().positive().optional(),
    gracePeriod: z.coerce.string().optional(),
    sector: z.string().optional(),
    creditType: z.string().optional(),
    monthlyIncome: z.coerce.number().optional(),
    interestRate: z.coerce.string().optional(),
    amortization: z.coerce.string().optional(),
    totalArea: z.coerce.number().optional(),
    productiveArea: z.coerce.number().optional(),

    // Detalhes da Empresa
    companyName: z.string().optional(),
    industry: z.string().optional(),
    size: z.string().optional(),
    machinery: z.coerce.string().optional(),
    revenue: z.coerce.string().optional(),
    email: z.string().optional(),
    phone: z.coerce.string().optional(),
    zip: z.coerce.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    neighborhood: z.string().optional(),

    // Suporte ao formato nativo do Nominatim ou enviado pelo frontend
    address: z.any().optional(), // Pode ser o objeto detalhado
    addressInfo: z.any().optional(),
    display_name: z.string().optional(),
    lat: z.coerce.number().optional(),
    lon: z.coerce.number().optional(),
    latitude: z.coerce.number().optional(),
    longitude: z.coerce.number().optional(),
    addresstype: z.string().optional(),
    addressType: z.string().optional(),
    boundingbox: z.any().optional(),
    boundingBox: z.any().optional(),

    guarantees: z.array(z.object({
        type: z.string().optional(),
        description: z.string().optional(),
        estimatedValue: z.number().positive().optional(),
        assetType: z.string().optional(),
        assetName: z.string().optional(),
        assetValue: z.number().positive().optional()
    })).optional()
});

export const createProposal = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            title, type, requestedValue, term, purpose, guarantees,
            financedValue, gracePeriod, sector, creditType,
            monthlyIncome, interestRate, amortization, totalArea, productiveArea,
            companyName, industry, size, machinery, revenue, email, phone, zip, state, city, neighborhood,
            address, addressInfo, display_name,
            lat, lon, latitude, longitude,
            addresstype, addressType,
            boundingbox, boundingBox
        } = createProposalSchema.parse(req.body);

        // Verifica se 'address' é um array ou object (no Nominatim é um object)
        const isAddressObject = typeof address === 'object' && address !== null;

        // Se 'address' for objeto, armazenamos no addressInfo. O endereço principal em string fica com o display_name (ou string do address)
        const finalAddressString = isAddressObject ? (display_name || JSON.stringify(address)) : (address || display_name);
        const finalAddressInfo = isAddressObject ? address : addressInfo;

        // Balanceamento de carga Round-Robin para o próximo analista
        const nextAnalyst = await prisma.user.findFirst({
            where: {
                permissions: { some: { id: 1002 } } // Permissão de Analista
            },
            orderBy: {
                lastAssignedAt: 'asc' // Pega o que recebeu proposta há mais tempo (ou nulo primeiro)
            }
        });

        let assignedAnalystId = null;
        if (nextAnalyst) {
            assignedAnalystId = nextAnalyst.id;
            // Atualiza a data pro final da fila
            await prisma.user.update({
                where: { id: nextAnalyst.id },
                data: { lastAssignedAt: new Date() }
            });
        }

        const newProposal = await prisma.proposal.create({
            data: {
                title,
                type,
                requestedValue,
                term,
                purpose,
                financedValue,
                gracePeriod,
                sector,
                creditType,
                monthlyIncome,
                interestRate,
                amortization,
                totalArea,
                productiveArea,
                companyName,
                industry,
                size,
                machinery,
                revenue,
                email,
                phone,
                zip,
                state,
                city,
                neighborhood,
                address: finalAddressString,
                addressInfo: finalAddressInfo,
                latitude: latitude !== undefined ? latitude : lat,
                longitude: longitude !== undefined ? longitude : lon,
                addressType: addressType || addresstype,
                boundingBox: boundingBox || boundingbox,
                userId,
                analystId: assignedAnalystId,
                ...(guarantees && guarantees.length > 0 && {
                    guarantees: {
                        create: guarantees.map(g => ({
                            type: g.type || g.assetType || 'Não especificado',
                            description: g.description || g.assetName || 'Não especificada',
                            estimatedValue: g.estimatedValue || g.assetValue || 0
                        }))
                    }
                })
            },
            include: {
                guarantees: true
            }
        });

        res.status(201).json({
            message: 'Proposta criada com sucesso!',
            proposal: newProposal
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessage = error.issues ? `Campo '${error.issues[0].path.join('.')}': ${error.issues[0].message}` : (error.errors?.[0]?.message || 'Erro de validação.');
            return res.status(400).json({ error: errorMessage });
        }
        console.error('Erro na criação de proposta: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

const updateProposalSchema = createProposalSchema.partial().extend({
    department: z.string().optional(),
    status: z.string().optional()
});

export const updateProposal = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const parsedData = updateProposalSchema.parse(req.body);

        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada.' });

        const { address, addressInfo, display_name, lat, lon, latitude, longitude, addresstype, addressType, boundingbox, boundingBox, guarantees, ...restData } = parsedData;

        let finalAddressString = undefined;
        let finalAddressInfo = undefined;

        if (address !== undefined || display_name !== undefined) {
            const isAddressObject = typeof address === 'object' && address !== null;
            finalAddressString = isAddressObject ? (display_name || JSON.stringify(address)) : (address || display_name);
            finalAddressInfo = isAddressObject ? address : addressInfo;
        }

        const updateData = {
            ...restData,
            ...(finalAddressString !== undefined && { address: finalAddressString }),
            ...(finalAddressInfo !== undefined && { addressInfo: finalAddressInfo }),
            ...(latitude !== undefined ? { latitude } : (lat !== undefined ? { latitude: lat } : {})),
            ...(longitude !== undefined ? { longitude } : (lon !== undefined ? { longitude: lon } : {})),
            ...(addressType !== undefined ? { addressType } : (addresstype !== undefined ? { addressType: addresstype } : {})),
            ...(boundingBox !== undefined ? { boundingBox } : (boundingbox !== undefined ? { boundingBox: boundingbox } : {}))
        };

        const updatedProposal = await prisma.proposal.update({
            where: { id: proposalId },
            data: updateData
        });

        res.json({ message: 'Proposta atualizada com sucesso!', proposal: updatedProposal });
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessage = error.issues ? `Campo '${error.issues[0].path.join('.')}': ${error.issues[0].message}` : 'Erro de validação.';
            return res.status(400).json({ error: errorMessage });
        }
        console.error('Erro ao atualizar proposta: ', error);
        res.status(500).json({ error: 'Erro interno ao atualizar proposta.' });
    }
};

export const uploadDocument = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const { type, description } = req.body;
        const arquivoBase = req.file;

        if (!arquivoBase) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
        }

        const proposalExists = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposalExists) {
            return res.status(404).json({ error: 'Proposta não encontrada.' });
        }

        if (!process.env.AZURE_STORAGE_CONNECTION_STRING) {
            console.warn('⚠️ AZURE_STORAGE_CONNECTION_STRING não foi configurada. Simulando upload para testes locais.');
            const mockDoc = await prisma.document.create({
                data: {
                    type: type || 'OUTROS',
                    description,
                    originalName: arquivoBase.originalname,
                    url: `https://trademachine.blob.core.windows.net/siga/propostas/${proposalId}/${arquivoBase.originalname}`,
                    proposalId
                }
            });
            return res.json({ message: 'Upload simulado com sucesso (Azure não configurada).', document: mockDoc });
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient('siga');

        const blobName = `propostas/${proposalId}/${arquivoBase.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(arquivoBase.buffer);
        const urlFinalDoAzure = blockBlobClient.url;

        const newDoc = await prisma.document.create({
            data: {
                type: type || 'OUTROS',
                description,
                originalName: arquivoBase.originalname,
                url: urlFinalDoAzure,
                proposalId
            }
        });

        res.json({ message: 'Upload concluído!', document: newDoc });
    } catch (error) {
        console.error('Erro no upload de documento: ', error);
        res.status(500).json({ error: 'Erro interno no servidor de upload.' });
    }
};

export const getProposals = async (req, res) => {
    try {
        const userId = req.user.id;

        const fullUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { permissions: true }
        });
        const isClient = fullUser.permissions.some(p => p.id === 1004);
        const isAnalyst = fullUser.permissions.some(p => p.id === 1002);
        const isManager = fullUser.permissions.some(p => p.id === 1001); // Gerente ou superiores veem tudo

        // Lógica de Visibilidade:
        let whereClause = {};
        if (isClient) {
            whereClause = { userId }; // Cliente só vê a dele
        } else if (isAnalyst && !isManager) {
            // Se for analista e não for gerente, vê SOMENTE as repassadas a ele e as sem analista por precaução
            whereClause = { 
                OR: [
                    { analystId: userId },
                    { analystId: null }
                ]
            };
        }

        const proposals = await prisma.proposal.findMany({
            where: whereClause,
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        pfType: true
                    }
                },
                analyst: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(proposals);
    } catch (error) {
        console.error('Erro ao listar propostas: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const getProposalById = async (req, res) => {
    try {
        const { proposalId } = req.params;

        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId },
            include: {
                documents: true,
                guarantees: true,
                analyst: { select: { id: true, name: true, email: true } },
                user: {
                    include: {
                        pessoaFisica: true,
                        pessoaJuridica: true
                    }
                }
            }
        });

        if (!proposal) {
            return res.status(404).json({ error: 'Proposta não encontrada.' });
        }

        res.json(proposal);
    } catch (error) {
        console.error('Erro ao buscar detalhes da proposta: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

const createTimelineEventSchema = z.object({
    eventType: z.enum(['STATUS_CHANGE', 'COMMENT', 'PENDENCY_CREATED', 'DOCUMENT_ATTACHED', 'SYSTEM_LOG']),
    content: z.any().optional()
});

export const getTimelineEvents = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const events = await prisma.timelineEvent.findMany({
            where: { proposalId },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        res.json(events);
    } catch (error) {
        console.error('Erro ao buscar timeline da proposta: ', error);
        res.status(500).json({ error: 'Erro interno ao buscar eventos da timeline.' });
    }
};

export const createTimelineEvent = async (req, res) => {
    try {
        const userId = req.user.id;
        const { proposalId } = req.params;
        const { eventType, content } = createTimelineEventSchema.parse(req.body);

        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada.' });

        const newEvent = await prisma.timelineEvent.create({
            data: {
                proposalId,
                userId,
                eventType,
                content: content || {}
            },
            include: {
                user: { select: { name: true } }
            }
        });

        res.status(201).json(newEvent);
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessage = error.issues ? `Campo '${error.issues[0].path.join('.')}': ${error.issues[0].message}` : 'Erro de validação.';
            return res.status(400).json({ error: errorMessage });
        }
        console.error('Erro ao criar evento na timeline: ', error);
        res.status(500).json({ error: 'Erro interno ao adicionar evento na timeline.' });
    }
};

const SLA_CONFIG = {
    'CECAD': 5,
    'GECRE': 15,
    'GEOPE': 10,
    'GERPF': 10,
    'GERIS': 5,
    'CCONS': 10,
    'GEJUR': 10,
    'COGEC': 10,
    'DIREX': 5
};

const getSlaInfo = (department, updatedAt) => {
    const slaMax = SLA_CONFIG[department] || 30;
    const diffTime = Math.abs(new Date() - new Date(updatedAt));
    const daysInStage = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return {
        daysInStage,
        slaMax,
        slaPercent: Math.min((daysInStage / slaMax) * 100, 100),
        isOverdue: daysInStage >= slaMax,
        isFrozen: daysInStage > (slaMax * 2)
    };
};

export const getProposalsStats = async (req, res) => {
    try {
        const { department, segment, dateFrom, dateTo } = req.query;

        const excludedStatuses = ['FINALIZADA', 'CANCELADA', 'REJEITADA', 'RECUSADA', 'EXPIRADA'];
        const activeWhere = { status: { notIn: excludedStatuses } };
        
        if (department) activeWhere.department = department;
        if (dateFrom || dateTo) {
            activeWhere.createdAt = {};
            if (dateFrom) activeWhere.createdAt.gte = new Date(dateFrom);
            if (dateTo) activeWhere.createdAt.lte = new Date(dateTo);
        }

        const activeProposals = await prisma.proposal.findMany({
            where: activeWhere,
            include: { user: { select: { name: true, pfType: true } } }
        });

        const totalActive = activeProposals.length;
        let onTimeCount = 0;
        let frozenCount = 0;
        const byDepartmentMap = {};
        const bySegmentMap = {};

        const alertsList = [];

        activeProposals.forEach(p => {
            const depto = p.department || 'CECAD';
            const slaInfo = getSlaInfo(depto, p.updatedAt);
            
            if (!slaInfo.isOverdue) onTimeCount++;
            if (slaInfo.isFrozen) frozenCount++;

            byDepartmentMap[depto] = (byDepartmentMap[depto] || 0) + 1;

            let seg = 'Outro';
            if (p.sector) {
                seg = p.sector;
            } else if (p.user.pfType === 'JURIDICA') {
                seg = 'Corporate';
            } else if (p.user.pfType === 'FISICA') {
                seg = 'Varejo';
            }
            if (!segment || segment === seg) {
               bySegmentMap[seg] = (bySegmentMap[seg] || 0) + 1;
            }

            alertsList.push({
                proposalId: p.id,
                proponent: p.companyName || p.user.name || 'Desconhecido',
                stage: depto,
                department: depto,
                daysInStage: slaInfo.daysInStage,
                slaPercent: slaInfo.slaPercent,
                isOverdue: slaInfo.isOverdue,
                updatedAt: p.updatedAt
            });
        });

        const onTimePercent = totalActive > 0 ? Number(((onTimeCount / totalActive) * 100).toFixed(1)) : 0;
        const frozenPercent = totalActive > 0 ? Number(((frozenCount / totalActive) * 100).toFixed(1)) : 0;

        alertsList.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            if (b.daysInStage !== a.daysInStage) return b.daysInStage - a.daysInStage;
            return new Date(a.updatedAt) - new Date(b.updatedAt);
        });
        const criticalAlerts = alertsList.slice(0, 5).map(({ updatedAt, ...rest }) => rest);
        
        let sparklineWhere = {};
        if (department) sparklineWhere.department = department;
        
        const sparklineProposals = await prisma.proposal.findMany({
            where: sparklineWhere,
            select: { createdAt: true, requestedValue: true }
        });

        const sparklineMap = {};
        
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            sparklineMap[key] = { count: 0, value: 0 };
        }

        sparklineProposals.forEach(p => {
            const d = new Date(p.createdAt);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (sparklineMap[key] !== undefined) {
                sparklineMap[key].count++;
                sparklineMap[key].value += Number(p.requestedValue || 0);
            }
        });

        const sparkline = Object.keys(sparklineMap).sort().map(month => ({
            month,
            count: sparklineMap[month].count,
            value: sparklineMap[month].value
        }));

        res.json({
            onTime: { count: onTimeCount, percent: onTimePercent, total: totalActive },
            frozen: { count: frozenCount, percent: frozenPercent, total: totalActive },
            byDepartment: Object.entries(byDepartmentMap).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count),
            bySegment: Object.entries(bySegmentMap).map(([name, count]) => ({ name, count, percent: Number(((count / totalActive)*100).toFixed(1)) })).sort((a,b) => b.count - a.count),
            sparkline,
            criticalAlerts
        });

    } catch (error) {
        console.error("Erro em getProposalsStats:", error);
        res.status(500).json({ error: "Erro interno no servidor ao calcular stats." });
    }
};

export const reassignProposalOwner = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const { userId } = req.body; // analystId recebido do front

        if (!userId) {
            return res.status(400).json({ success: false, message: "userId (analista) é obrigatório." });
        }

        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposal) return res.status(404).json({ success: false, message: "Proposta não encontrada." });

        const updatedProposal = await prisma.proposal.update({
            where: { id: proposalId },
            data: { analystId: userId },
            select: { id: true, userId: true, analystId: true }
        });

        res.json({ success: true, proposal: updatedProposal });
    } catch (error) {
        console.error("Erro em reassignProposalOwner: ", error);
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
};

