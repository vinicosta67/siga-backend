import prisma from '../config/db.js';
import { z } from 'zod';
import { BlobServiceClient } from '@azure/storage-blob';
import multer from 'multer';

export const uploadBuffer = multer({ storage: multer.memoryStorage() });

export const FNO_RATES = {
    CUSTEIO: {
        fixedAnnualRate: 0.08 + 0.010 + 0.004,  // 9,4%
        cdiSpread: 0.015,
        ipcaSpread: 0.020,
    },
    INVESTIMENTO: {
        fixedAnnualRate: 0.10 + 0.015 + 0.006,   // 12,1%
        cdiSpread: 0.022,
        ipcaSpread: 0.030,
    },
    COMERCIALIZACAO: {
        fixedAnnualRate: 0.10 + 0.015 + 0.006,   // 12,1%
        cdiSpread: 0.022,
        ipcaSpread: 0.030,
    },
};

export const FNO_LIMITS = {
    CUSTEIO: { maxPct: 80, maxTerm: 18, maxGrace: 0 },
    INVESTIMENTO: { maxPct: 80, maxTerm: 120, maxGrace: 24 },
    COMERCIALIZACAO: { maxPct: 90, maxTerm: 12, maxGrace: 2 },
};

function roundBR(value) {
    return Math.round(value * 100) / 100;
}

const CORRECTION_LABELS = {
    PRE_FIXADO: 'Taxa de juros: {rate}% a.a. (PRÉ-FIXADA)',
    IPCA: 'Taxa de juros: {rate}% a.a. + IPCA (PÓS-FIXADA)',
    CDI: 'Taxa de juros: {rate}% a.a. + CDI (PÓS-FIXADA)',
    IGPM: 'Taxa de juros: {rate}% a.a. + IGPM (PÓS-FIXADA)',
    SELIC: 'Taxa de juros: {rate}% a.a. + SELIC (PÓS-FIXADA)',
};

function getAnnualRateAndLabel(purpose, correctionIndex, customRate) {
    const baseRate = customRate != null ? customRate : FNO_RATES[purpose]?.fixedAnnualRate;
    const label = CORRECTION_LABELS[correctionIndex] || CORRECTION_LABELS.PRE_FIXADO;
    return {
        annualRate: baseRate,
        rateLabel: label.replace('{rate}', (baseRate * 100).toFixed(2)),
    };
}

function calcSimulation(purpose, financedValue, requestedValue, term, gracePeriod, amortizationSystem = 'PRICE', correctionIndex = 'PRE_FIXADO', customInterestRate = null) {
    const { annualRate, rateLabel } = getAnnualRateAndLabel(purpose, correctionIndex, customInterestRate);
    const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
    const graceMonths = Math.floor(gracePeriod);
    const payMonths = term - graceMonths;

    // Durante carência: juros capitalizam sobre saldo devedor
    let balanceAfterGrace = financedValue * Math.pow(1 + monthlyRate, graceMonths);

    // Monta a tabela de amortização
    let currentBalance = balanceAfterGrace;
    const paymentSchedule = [];
    let totalInterestPaid = 0;

    // Período de carência
    let balanceAtGraceStart = financedValue;
    for (let m = 1; m <= graceMonths; m++) {
        const interest = balanceAtGraceStart * monthlyRate;
        balanceAtGraceStart += interest;
        totalInterestPaid += interest;
        paymentSchedule.push({
            mes: m,
            parcela: 0,
            juros: roundBR(interest),
            amortizacao: 0,
            saldoDevedor: roundBR(balanceAtGraceStart)
        });
    }

    if (amortizationSystem === 'SAC') {
        // SAC: amortização fixa, parcelas decrescentes
        const fixedAmortization = balanceAfterGrace / payMonths;

        for (let m = 1; m <= payMonths; m++) {
            const interest = currentBalance * monthlyRate;
            const installment = fixedAmortization + interest;
            currentBalance -= fixedAmortization;
            totalInterestPaid += interest;

            const isLast = m === payMonths;
            const finalBalance = isLast ? 0 : roundBR(currentBalance);

            paymentSchedule.push({
                mes: graceMonths + m,
                parcela: roundBR(installment),
                juros: roundBR(interest),
                amortizacao: roundBR(fixedAmortization),
                saldoDevedor: finalBalance
            });
        }

        const amortTotal = roundBR(fixedAmortization * payMonths);
        const firstInstallment = roundBR(fixedAmortization + balanceAfterGrace * monthlyRate);

        return {
            valorFinanciado: roundBR(financedValue),
            percentualFinanciado: ((financedValue / requestedValue) * 100).toFixed(2) + '%',
            valorTotalPago: roundBR(amortTotal + totalInterestPaid),
            valorPrimeiraParcela: firstInstallment,
            totalJuros: roundBR(totalInterestPaid),
            taxaJuros: rateLabel,
            sistemaAmortizacao: 'SAC',
            sistema: 'FNO - Fundo Constitucional do Norte',
            modalidade: purpose,
            prazoTotal: term,
            carencia: graceMonths,
            taxaMensal: Number((monthlyRate * 100).toFixed(6)),
            taxaAnual: Number((annualRate * 100).toFixed(2)),
            indiceCorrecao: correctionIndex,
            tabelaAmortizacao: paymentSchedule
        };
    } else {
        // PRICE: parcelas fixas (Tabela Price)
        const monthlyPayment = balanceAfterGrace * (monthlyRate * Math.pow(1 + monthlyRate, payMonths)) / (Math.pow(1 + monthlyRate, payMonths) - 1);

        for (let m = 1; m <= payMonths; m++) {
            const interest = currentBalance * monthlyRate;
            const amortization = monthlyPayment - interest;
            currentBalance -= amortization;
            totalInterestPaid += interest;

            const isLast = m === payMonths;
            const finalBalance = isLast ? 0 : roundBR(currentBalance);

            paymentSchedule.push({
                mes: graceMonths + m,
                parcela: roundBR(monthlyPayment),
                juros: roundBR(interest),
                amortizacao: roundBR(amortization),
                saldoDevedor: finalBalance
            });
        }

        const totalPaid = roundBR(monthlyPayment * payMonths);

        return {
            valorFinanciado: roundBR(financedValue),
            percentualFinanciado: ((financedValue / requestedValue) * 100).toFixed(2) + '%',
            valorTotalPago: totalPaid,
            valorPrimeiraParcela: roundBR(monthlyPayment),
            totalJuros: roundBR(totalInterestPaid),
            taxaJuros: rateLabel,
            sistemaAmortizacao: 'PRICE',
            sistema: 'FNO - Fundo Constitucional do Norte',
            modalidade: purpose,
            prazoTotal: term,
            carencia: graceMonths,
            taxaMensal: (monthlyRate * 100).toFixed(6) + '% a.m.',
            taxaAnual: (annualRate * 100).toFixed(2) + '% a.a.',
            indiceCorrecao: correctionIndex,
            tabelaAmortizacao: paymentSchedule
        };
    }
}

const baseProposalSchema = z.object({
    title: z.string().min(3, 'O título é obrigatório.'),
    type: z.string().min(2, 'O tipo é obrigatório.'),
    requestedValue: z.number().positive('O valor deve ser positivo.'),
    term: z.number().int().positive('O prazo deve ser positivo.'),
    purpose: z.enum(['CUSTEIO', 'INVESTIMENTO', 'COMERCIALIZACAO']),

    // Detalhes do Projeto de Crédito
    financedValue: z.number().positive(),
    gracePeriod: z.coerce.number().nonnegative(),
    sector: z.string().optional(),
    creditType: z.string().optional(),
    monthlyIncome: z.coerce.number().optional(),
    interestRate: z.coerce.string().optional(),
    amortization: z.coerce.string().optional(),
    amortizationSystem: z.enum(['PRICE', 'SAC']).optional(),
    correctionIndex: z.enum(['PRE_FIXADO', 'IPCA', 'CDI', 'IGPM', 'SELIC']).optional(),
    totalArea: z.coerce.number().optional(),
    productiveArea: z.coerce.number().optional(),

    // Detalhes da Empresa
    companyName: z.string().optional(),
    industry: z.string().optional(),
    size: z.string().optional(),
    machinery: z.coerce.string().optional(),
    revenue: z.coerce.string().optional(),
    email: z.string().optional(),
    clientDocumentNumber: z.string().optional(),
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

const createProposalSchema = baseProposalSchema.superRefine((data, ctx) => {
    const rule = FNO_LIMITS[data.purpose];
    if (!rule) return;

    const financedPct = (data.financedValue / data.requestedValue) * 100;

    if (financedPct > rule.maxPct) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['financedValue'],
            message: `Para ${data.purpose}, o valor financiado pode ser no máximo ${rule.maxPct}% do valor do projeto (${((data.requestedValue * rule.maxPct) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
        });
    }

    if (data.term > rule.maxTerm) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['term'],
            message: `Prazo máximo para ${data.purpose} é ${rule.maxTerm} meses`
        });
    }

    if (data.gracePeriod > rule.maxGrace) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['gracePeriod'],
            message: `Carência máxima para ${data.purpose} é ${rule.maxGrace} meses`
        });
    }

    if (data.gracePeriod >= data.term) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['gracePeriod'],
            message: 'Carência deve ser menor que o prazo total'
        });
    }
});

export const createProposal = async (req, res) => {
    try {
        const userId = req.user.id;

        const fullUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, pfType: true, permissions: { select: { id: true } } }
        });

        const {
            title, type, requestedValue, term, purpose, guarantees,
            financedValue, gracePeriod, sector, creditType,
            monthlyIncome, interestRate, amortization, amortizationSystem, correctionIndex, totalArea, productiveArea,
            companyName, industry, size, machinery, revenue, email, clientDocumentNumber, phone, zip, state, city, neighborhood,
            address, addressInfo, display_name,
            lat, lon, latitude, longitude,
            addresstype, addressType,
            boundingbox, boundingBox
        } = createProposalSchema.parse(req.body);

        // DocumentNumber = CPF/CNPJ do cliente (dono da proposta), nunca do funcionário
        let documentNumber = clientDocumentNumber || null;

        if (!documentNumber) {
            if (fullUser?.permissions?.some(p => p.id === 1004)) {
                // Cliente logando e criando sua própria proposta: busca CPF/CNPJ dele
                const userDoc = await prisma.user.findUnique({
                    where: { id: userId },
                    include: {
                        pessoaFisica: { select: { cpf: true } },
                        pessoaJuridica: { select: { cnpj: true } }
                    }
                });
                documentNumber = userDoc?.pfType === 'FISICA'
                    ? userDoc?.pessoaFisica?.cpf
                    : userDoc?.pessoaJuridica?.cnpj;
            } else if (email) {
                // Funcionário criando proposta: busca CPF/CNPJ do cliente pelo email
                const clientUser = await prisma.user.findFirst({
                    where: { email },
                    include: {
                        pessoaFisica: { select: { cpf: true } },
                        pessoaJuridica: { select: { cnpj: true } }
                    }
                });
                documentNumber = clientUser?.pfType === 'FISICA'
                    ? clientUser?.pessoaFisica?.cpf
                    : clientUser?.pessoaJuridica?.cnpj;
            }
        }

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

        const rates = FNO_RATES[purpose] || FNO_RATES.INVESTIMENTO;
        const finalInterestRate = interestRate || rates.fixedAnnualRate.toString();
        const finalAmortSystem = amortizationSystem || 'PRICE';
        const finalCorrectionIndex = correctionIndex || 'PRE_FIXADO';

        // Calcular simulação e salvar resultados no banco
        const simData = calcSimulation(purpose, financedValue, requestedValue, term, gracePeriod, finalAmortSystem, finalCorrectionIndex, interestRate ? parseFloat(interestRate) : null);

        const newProposal = await prisma.proposal.create({
            data: {
                title,
                type,
                requestedValue,
                term,
                purpose,
                financedValue,
                gracePeriod: gracePeriod.toString(),
                sector,
                creditType,
                monthlyIncome,
                interestRate: finalInterestRate.toString(),
                amortization,
                amortizationSystem: finalAmortSystem,
                correctionIndex: finalCorrectionIndex,
                totalPaid: simData.valorTotalPago,
                valueOfFirstInstallment: simData.valorPrimeiraParcela,
                totalInterest: simData.totalJuros,
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
                documentNumber,
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
            proposal: newProposal,
            simulationData: {
                valorFinanciado: simData.valorFinanciado,
                percentualFinanciado: simData.percentualFinanciado,
                valorTotalPago: simData.valorTotalPago,
                valorPrimeiraParcela: simData.valorPrimeiraParcela,
                totalJuros: simData.totalJuros,
                taxaJuros: simData.taxaJuros,
                sistemaAmortizacao: simData.sistemaAmortizacao,
                indiceCorrecao: simData.indiceCorrecao,
                sistema: simData.sistema,
                modalidade: simData.modalidade,
                prazoTotal: simData.prazoTotal,
                carencia: simData.carencia,
                taxaMensal: simData.taxaMensal,
                taxaAnual: simData.taxaAnual,
                tabelaAmortizacao: simData.tabelaAmortizacao
            }
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

const updateProposalSchema = baseProposalSchema.partial().extend({
    department: z.string().optional(),
    status: z.string().optional()
});

export const updateProposal = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const parsedData = updateProposalSchema.parse(req.body);

        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposal) return res.status(404).json({ error: 'Proposta não encontrada.' });

        // Verifica permissão de atualização
        const requestingUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: { permissions: true }
        });
        const isManager = requestingUser?.permissions?.some(p => [1001, 1005].includes(p.id));
        const isAnalyst = requestingUser?.permissions?.some(p => p.id === 1002);

        if (!isManager && !isAnalyst && proposal.userId !== req.user.id) {
            return res.status(403).json({ error: 'Sem acesso a esta proposta.' });
        }

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

            const pendingSignatures = [
                { proposalId, userId: proposalExists.analystId || null, role: 'analista', order: 1 },
                { proposalId, userId: null, role: 'gerente', order: 2 },
                { proposalId, userId: proposalExists.userId, role: 'cliente', order: 3 }
            ];

            const mockDoc = await prisma.document.create({
                data: {
                    type: type || 'OUTROS',
                    description,
                    originalName: arquivoBase.originalname,
                    url: `https://trademachine.blob.core.windows.net/siga/propostas/${proposalId}/${arquivoBase.originalname}`,
                    proposalId,
                    signatures: { create: pendingSignatures }
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

        const pendingSignatures = [
            { proposalId, userId: proposalExists.analystId || null, role: 'analista', order: 1 },
            { proposalId, userId: null, role: 'gerente', order: 2 },
            { proposalId, userId: proposalExists.userId, role: 'cliente', order: 3 }
        ];

        const newDoc = await prisma.document.create({
            data: {
                type: type || 'OUTROS',
                description,
                originalName: arquivoBase.originalname,
                url: urlFinalDoAzure,
                proposalId,
                signatures: { create: pendingSignatures }
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
            include: {
                permissions: true,
                pessoaFisica: { select: { cpf: true } },
                pessoaJuridica: { select: { cnpj: true } }
            }
        });
        const isClient = fullUser.permissions.some(p => p.id === 1004);
        const isAnalyst = fullUser.permissions.some(p => p.id === 1002);
        const isManager = fullUser.permissions.some(p => p.id === 1001); // Gerente ou superiores veem tudo

        // Busca o CPF/CNPJ do usuário logado
        const userDocument = fullUser?.pfType === 'FISICA'
            ? fullUser?.pessoaFisica?.cpf
            : fullUser?.pessoaJuridica?.cnpj;

        // Lógica de Visibilidade:
        let whereClause = {};
        if (isClient) {
            // Cliente vê propostas criadas por ele OU vinculadas ao CPF/CNPJ dele
            const conditions = [{ userId }];
            if (userDocument) {
                conditions.push({ documentNumber: userDocument });
            }
            whereClause = { OR: conditions };
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
                documents: { orderBy: { createdAt: 'asc' } },
                guarantees: { orderBy: { id: 'asc' } },
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

        // Verifica permissão de acesso
        const requestingUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                permissions: true,
                pessoaFisica: { select: { cpf: true } },
                pessoaJuridica: { select: { cnpj: true } }
            }
        });

        const isManager = requestingUser?.permissions?.some(p => [1001, 1005].includes(p.id));
        const isAnalyst = requestingUser?.permissions?.some(p => p.id === 1002);

        if (isManager || isAnalyst) {
            return res.json(proposal);
        }

        // Cliente só vê se criou (userId) ou se o documentNumber bate com seu CPF/CNPJ
        const userDoc = requestingUser?.pfType === 'FISICA'
            ? requestingUser?.pessoaFisica?.cpf
            : requestingUser?.pessoaJuridica?.cnpj;

        if (proposal.userId !== req.user.id && proposal.documentNumber !== userDoc) {
            return res.status(403).json({ error: 'Sem acesso a esta proposta.' });
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
            byDepartment: Object.entries(byDepartmentMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
            bySegment: Object.entries(bySegmentMap).map(([name, count]) => ({ name, count, percent: Number(((count / totalActive) * 100).toFixed(1)) })).sort((a, b) => b.count - a.count),
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

        // Sincroniza todas as assinaturas pendentes para o novo Analista
        await prisma.signature.updateMany({
            where: { proposalId, role: 'analista', status: 'pending' },
            data: { userId }
        });

        res.json({ success: true, proposal: updatedProposal });
    } catch (error) {
        console.error("Erro em reassignProposalOwner: ", error);
        res.status(500).json({ success: false, message: "Erro interno no servidor." });
    }
};

export const getProposalSignatures = async (req, res) => {
    try {
        const { proposalId } = req.params;
        const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
        if (!proposal) return res.status(404).json({ success: false, message: "Proposta não encontrada." });

        const documents = await prisma.document.findMany({
            where: { proposalId },
            orderBy: { createdAt: 'asc' },
            include: {
                signatures: {
                    include: {
                        user: {
                            select: {
                                name: true,
                                pessoaFisica: { select: { cpf: true } },
                                pessoaJuridica: { select: { cnpj: true } }
                            }
                        }
                    },
                    orderBy: { order: 'asc' }
                }
            }
        });

        // 1. Auto-Healer e Sincronizador
        for (const doc of documents) {
            let needsRelookup = false;

            if (doc.signatures.length === 0) {
                const pendingSignatures = [
                    { proposalId: proposal.id, documentId: doc.id, userId: proposal.analystId || null, role: 'analista', order: 1 },
                    { proposalId: proposal.id, documentId: doc.id, userId: null, role: 'gerente', order: 2 },
                    { proposalId: proposal.id, documentId: doc.id, userId: proposal.userId, role: 'cliente', order: 3 }
                ];
                await prisma.signature.createMany({ data: pendingSignatures });
                needsRelookup = true;
            } else {
                // Sync se a proposta ganhou Analista depois que a assinatura foi gerada
                const analistaSig = doc.signatures.find(s => s.role === 'analista' && s.userId === null && s.status === 'pending');
                if (analistaSig && proposal.analystId) {
                    await prisma.signature.update({
                        where: { id: analistaSig.id },
                        data: { userId: proposal.analystId }
                    });
                    needsRelookup = true;
                }
            }

            if (needsRelookup) {
                const updatedSigs = await prisma.signature.findMany({
                    where: { documentId: doc.id },
                    include: {
                        user: {
                            select: {
                                name: true,
                                pessoaFisica: { select: { cpf: true } },
                                pessoaJuridica: { select: { cnpj: true } }
                            }
                        }
                    },
                    orderBy: { order: 'asc' }
                });
                doc.signatures = updatedSigs;
            }
        }

        // 2. Format Payload pro Front
        const formattedList = documents.map(doc => ({
            documentId: doc.id,
            documentName: doc.originalName,
            documentStatus: doc.signatureStatus,
            signatures: doc.signatures.map(s => {
                let userDoc = null;
                if (s.user) {
                    userDoc = (s.user.pessoaFisica?.cpf) || (s.user.pessoaJuridica?.cnpj) || null;
                }
                return {
                    id: s.id,
                    userId: s.userId,
                    userName: s.user ? s.user.name : (s.role === 'gerente' ? 'A definir (Gerência)' : 'A definir'),
                    userRole: s.role,
                    userDocument: userDoc,
                    status: s.status,
                    signedAt: s.signedAt,
                    ipAddress: s.ipAddress,
                    order: s.order
                };
            })
        }));

        res.json({ success: true, documents: formattedList });
    } catch (e) {
        console.error("Erro pegando árvore das signatures por proposal: ", e);
        res.status(500).json({ success: false, message: "Erro interno." });
    }
};

export const simulateProposal = async (req, res) => {
    try {
        const { purpose, financedValue, requestedValue, term, gracePeriod, amortizationSystem, correctionIndex, interestRate } = req.body;

        try {
            const subsetSchema = z.object({
                purpose: z.enum(['CUSTEIO', 'INVESTIMENTO', 'COMERCIALIZACAO']),
                financedValue: z.coerce.number().positive(),
                requestedValue: z.coerce.number().positive(),
                term: z.coerce.number().int().positive(),
                gracePeriod: z.coerce.number().nonnegative(),
                amortizationSystem: z.enum(['PRICE', 'SAC']).optional(),
                correctionIndex: z.enum(['PRE_FIXADO', 'IPCA', 'CDI', 'IGPM', 'SELIC']).optional(),
                interestRate: z.coerce.number().optional(),
            }).superRefine((data, ctx) => {
                const rule = FNO_LIMITS[data.purpose];
                if (!rule) return;

                const financedPct = (data.financedValue / data.requestedValue) * 100;
                if (financedPct > rule.maxPct) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['financedValue'], message: `Para ${data.purpose}, o valor financiado pode ser no máximo ${rule.maxPct}% do valor do projeto (${((data.requestedValue * rule.maxPct) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})` });
                }
                if (data.term > rule.maxTerm) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['term'], message: `Prazo máximo para ${data.purpose} é ${rule.maxTerm} meses` });
                }
                if (data.gracePeriod > rule.maxGrace) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gracePeriod'], message: `Carência máxima para ${data.purpose} é ${rule.maxGrace} meses` });
                }
                if (data.gracePeriod >= data.term) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gracePeriod'], message: 'Carência deve ser menor que o prazo total' });
                }
            });

            subsetSchema.parse({ purpose, financedValue, requestedValue, term, gracePeriod, amortizationSystem, correctionIndex, interestRate });

            const finalAmort = amortizationSystem || 'PRICE';
            const finalCorrection = correctionIndex || 'PRE_FIXADO';
            const simData = calcSimulation(purpose, financedValue, requestedValue, term, gracePeriod, finalAmort, finalCorrection, interestRate);

            return res.json({
                success: true,
                message: "Simulação calculada com sucesso.",
                data: {
                    valorFinanciado: simData.valorFinanciado,
                    percentualFinanciado: simData.percentualFinanciado,
                    valorTotalPago: simData.valorTotalPago,
                    valorPrimeiraParcela: simData.valorPrimeiraParcela,
                    totalJuros: simData.totalJuros,
                    taxaJuros: simData.taxaJuros,
                    sistemaAmortizacao: simData.sistemaAmortizacao,
                    indiceCorrecao: simData.indiceCorrecao,
                    sistema: simData.sistema,
                    modalidade: simData.modalidade,
                    prazoTotal: simData.prazoTotal,
                    carencia: simData.carencia,
                    taxaMensal: simData.taxaMensal,
                    taxaAnual: simData.taxaAnual,
                    tabelaAmortizacao: simData.tabelaAmortizacao
                }
            });

        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                const issues = zodErr.issues.map(i => ({ path: i.path, message: i.message }));
                return res.status(400).json({ success: false, error: 'Regras do FNO não atingidas.', issues });
            }
            throw zodErr;
        }

    } catch (error) {
        console.error("Erro no Simulador:", error);
        res.status(500).json({ success: false, error: "Erro interno no simulador." });
    }
};