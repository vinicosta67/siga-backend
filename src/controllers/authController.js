import prisma from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const registerSchema = z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres.'),
    email: z.string().email('E-mail inválido.'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
    permissionId: z.number().int().optional(),
    pfType: z.enum(['FISICA', 'JURIDICA']),
    pfDetails: z.object({
        cpf: z.string().length(11, 'O CPF deve ter 11 dígitos.'),
        rg: z.string().nullable().optional(),
        birthDate: z.string().nullable().optional(),
        maritalStatus: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']).nullable().optional(),
        motherName: z.string().nullable().optional(),
        monthlyIncome: z.string().nullable().optional(),
        occupation: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        neighborhood: z.string().nullable().optional(),
        city: z.string(),
        state: z.string().length(2, 'A sigla do estado deve ter 2 letras.'),
        zipCode: z.string()
    }).nullable().optional(),
    pjDetails: z.object({
        cnpj: z.string().length(14, 'O CNPJ deve ter 14 dígitos.'),
        companyName: z.string().nullable().optional(),
        tradeName: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        companySize: z.enum(['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE']).nullable().optional(),
        annualRevenue: z.string().nullable().optional(),
        foundedDate: z.string().nullable().optional(),
        machineryCount: z.string().nullable().optional(),
        employeeCount: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        neighborhood: z.string().nullable().optional(),
        city: z.string(),
        state: z.string().length(2, 'A sigla do estado deve ter 2 letras.'),
        zipCode: z.string()
    }).nullable().optional()
});

const updatePfSchema = z.object({
    cpf: z.string().length(11, 'O CPF deve ter 11 dígitos.').optional(),
    rg: z.string().nullable().optional(),
    birthDate: z.string().nullable().optional(),
    maritalStatus: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']).nullable().optional(),
    motherName: z.string().nullable().optional(),
    monthlyIncome: z.string().nullable().optional(),
    occupation: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    city: z.string().optional(),
    state: z.string().length(2, 'A sigla do estado deve ter 2 letras.').optional(),
    zipCode: z.string().optional()
});

const updatePjSchema = z.object({
    cnpj: z.string().length(14, 'O CNPJ deve ter 14 dígitos.').optional(),
    companyName: z.string().nullable().optional(),
    tradeName: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    companySize: z.enum(['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE']).nullable().optional(),
    annualRevenue: z.string().nullable().optional(),
    foundedDate: z.string().nullable().optional(),
    machineryCount: z.string().nullable().optional(),
    employeeCount: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    city: z.string().optional(),
    state: z.string().length(2, 'A sigla do estado deve ter 2 letras.').optional(),
    zipCode: z.string().optional()
});

const loginSchema = z.object({
    email: z.string().email('E-mail inválido.'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.')
});

const updateSchema = z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres.').optional(),
    email: z.string().email('E-mail inválido.').optional(),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.').optional(),
    perfilId: z.number().optional()
});

export const register = async (req, res) => {
    try {
        const { name, email, password, permissionId, pfType, pfDetails, pjDetails } = registerSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Validate correct payload details for selected pfType
        if (pfType === 'FISICA' && !pfDetails) {
            return res.status(400).json({ error: 'Os detalhes da pessoa física (pfDetails) são obrigatórios para este tipo de conta.' });
        }

        if (pfType === 'JURIDICA' && !pjDetails) {
            return res.status(400).json({ error: 'Os detalhes da pessoa jurídica (pjDetails) são obrigatórios para este tipo de conta.' });
        }

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                pfType,
                ...(permissionId && {
                    permissions: {
                        connect: { id: permissionId }
                    }
                }),
                ...(pfType === 'FISICA' && pfDetails && {
                    pessoaFisica: {
                        create: {
                            ...pfDetails,
                            birthDate: pfDetails.birthDate ? new Date(pfDetails.birthDate) : null,
                            monthlyIncome: pfDetails.monthlyIncome ? Number(pfDetails.monthlyIncome) : null
                        }
                    }
                }),
                ...(pfType === 'JURIDICA' && pjDetails && {
                    pessoaJuridica: {
                        create: {
                            ...pjDetails,
                            foundedDate: pjDetails.foundedDate ? new Date(pjDetails.foundedDate) : null,
                            machineryCount: pjDetails.machineryCount ? Number(pjDetails.machineryCount) : null,
                            employeeCount: pjDetails.employeeCount ? Number(pjDetails.employeeCount) : null,
                            annualRevenue: pjDetails.annualRevenue ? Number(pjDetails.annualRevenue) : null
                        }
                    }
                })
            },
            include: {
                permissions: true,
                pessoaFisica: true,
                pessoaJuridica: true
            }
        });

        const token = jwt.sign(
            { id: newUser.id },
            process.env.JWT_SECRET || 'supersecretJWT',
            { expiresIn: '1d' }
        );

        res.status(201).json({
            message: 'Usuário registrado com sucesso',
            token,
            user: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                perfil: newUser.permissions[0] || null,
                pfType: newUser.pfType,
                pfDetails: newUser.pfType === 'FISICA' ? (newUser.pessoaFisica || {}) : null,
                pjDetails: newUser.pfType === 'JURIDICA' ? (newUser.pessoaJuridica || {}) : null
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Erro no registro: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const login = async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                permissions: true,
                pessoaFisica: true,
                pessoaJuridica: true
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Credenciais inválidas.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ error: 'Credenciais inválidas.' });
        }

        const token = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET || 'supersecretJWT',
            { expiresIn: '1d' }
        );

        res.json({
            message: 'Login bem sucedido',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                perfil: user.permissions[0] || null,
                pfType: user.pfType,
                pfDetails: user.pfType === 'FISICA' ? (user.pessoaFisica || {}) : null,
                pjDetails: user.pfType === 'JURIDICA' ? (user.pessoaJuridica || {}) : null
            }
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Erro no login: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const updateUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, password, perfilId } = updateSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!existingUser) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const updateData = {};

        if (name) updateData.name = name;
        if (email) {
            if (email !== existingUser.email) {
                const emailInUse = await prisma.user.findUnique({ where: { email } });
                if (emailInUse) {
                    return res.status(400).json({ error: 'Este e-mail já está em uso.' });
                }
            }
            updateData.email = email;
        }
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }
        if (perfilId) {
            updateData.permissions = {
                set: [{ id: perfilId }]
            };
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                permissions: true,
                pessoaFisica: true,
                pessoaJuridica: true
            }
        });

        res.json({
            message: 'Usuário atualizado com sucesso!',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                perfil: updatedUser.permissions[0] || null,
                pfType: updatedUser.pfType,
                pfDetails: updatedUser.pfType === 'FISICA' ? (updatedUser.pessoaFisica || {}) : null,
                pjDetails: updatedUser.pfType === 'JURIDICA' ? (updatedUser.pessoaJuridica || {}) : null
            }
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Erro na atualização de usuário: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const updatePfDetails = async (req, res) => {
    try {
        const userId = req.params.id;
        const data = updatePfSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { pessoaFisica: true }
        });

        if (!existingUser) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        if (existingUser.pfType !== 'FISICA') {
            return res.status(400).json({ error: 'Este usuário não é do tipo Pessoa Física.' });
        }

        const formattedData = {
            ...data,
            ...(data.birthDate && { birthDate: new Date(data.birthDate) }),
            ...(data.monthlyIncome && { monthlyIncome: Number(data.monthlyIncome) })
        };

        const updatedPf = await prisma.pessoaFisica.upsert({
            where: { userId },
            update: formattedData,
            create: {
                ...formattedData,
                userId
            }
        });

        res.json({
            message: 'Detalhes de Pessoa Física atualizados com sucesso!',
            pfDetails: updatedPf
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Erro na atualização PF: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const updatePjDetails = async (req, res) => {
    try {
        const userId = req.params.id;
        const data = updatePjSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            include: { pessoaJuridica: true }
        });

        if (!existingUser) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        if (existingUser.pfType !== 'JURIDICA') {
            return res.status(400).json({ error: 'Este usuário não é do tipo Pessoa Jurídica.' });
        }

        const formattedData = {
            ...data,
            ...(data.foundedDate && { foundedDate: new Date(data.foundedDate) }),
            ...(data.machineryCount && { machineryCount: Number(data.machineryCount) }),
            ...(data.employeeCount && { employeeCount: Number(data.employeeCount) }),
            ...(data.annualRevenue && { annualRevenue: Number(data.annualRevenue) })
        };

        const updatedPj = await prisma.pessoaJuridica.upsert({
            where: { userId },
            update: formattedData,
            create: {
                ...formattedData,
                userId
            }
        });

        res.json({
            message: 'Detalhes de Pessoa Jurídica atualizados com sucesso!',
            pjDetails: updatedPj
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error('Erro na atualização PJ: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};
