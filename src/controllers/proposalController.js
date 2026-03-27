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
    
    // Outros dados do Projeto de Crédito
    financedValue: z.number().positive().optional(),
    gracePeriod: z.string().optional(),
    sector: z.string().optional(),
    creditType: z.string().optional(),

    // Detalhes da Empresa
    companyName: z.string().optional(),
    industry: z.string().optional(),
    size: z.string().optional(),
    machinery: z.string().optional(),
    revenue: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    zip: z.string().optional(),
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
        type: z.string(),
        description: z.string(),
        estimatedValue: z.number().positive().optional()
    })).optional()
});

export const createProposal = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            title, type, requestedValue, term, purpose, guarantees,
            financedValue, gracePeriod, sector, creditType,
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
                ...(guarantees && guarantees.length > 0 && {
                    guarantees: {
                        create: guarantees.map(g => ({
                            type: g.type,
                            description: g.description,
                            estimatedValue: g.estimatedValue
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
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Erro na criação de proposta: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
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

        const whereClause = isClient ? { userId } : {};

        const proposals = await prisma.proposal.findMany({
            where: whereClause,
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        pfType: true
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
