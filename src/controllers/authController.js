import prisma from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import { sendVerificationEmail, sendResetPasswordEmail } from '../services/emailService.js';

const registerSchema = z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres.'),
    email: z.string().email('E-mail inválido.'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
    permissionId: z.number().int().optional(),
    pfType: z.enum(['FISICA', 'JURIDICA']),
    pfDetails: z.object({
        cpf: z.string().length(11, 'O CPF deve ter 11 dígitos.'),
        rg: z.string().nullable().optional(),
        rgIssuer: z.string().nullable().optional(),
        birthDate: z.string().nullable().optional(),
        nationality: z.string().nullable().optional(),
        gender: z.string().nullable().optional(),
        maritalStatus: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']).nullable().optional(),
        motherName: z.string().nullable().optional(),
        monthlyIncome: z.coerce.string().nullable().optional(),
        occupation: z.string().nullable().optional(),
        phone: z.coerce.string().nullable().optional(),
        address: z.string().nullable().optional(),
        addressNumber: z.coerce.string().nullable().optional(),
        neighborhood: z.string().nullable().optional(),
        city: z.string(),
        state: z.string().length(2, 'A sigla do estado deve ter 2 letras.'),
        zipCode: z.coerce.string().optional(),
        latitude: z.coerce.number().nullable().optional(),
        longitude: z.coerce.number().nullable().optional()
    }).nullable().optional(),
    pjDetails: z.object({
        cnpj: z.string().length(14, 'O CNPJ deve ter 14 dígitos.'),
        companyName: z.string().nullable().optional(),
        tradeName: z.string().nullable().optional(),
        industry: z.string().nullable().optional(),
        companySize: z.enum(['MEI', 'ME', 'EPP', 'MEDIO', 'GRANDE']).nullable().optional(),
        annualRevenue: z.coerce.string().nullable().optional(),
        foundedDate: z.string().nullable().optional(),
        machineryCount: z.coerce.string().nullable().optional(),
        employeeCount: z.coerce.string().nullable().optional(),
        stateRegistration: z.string().nullable().optional(),
        cpf: z.string().length(11, 'O CPF deve ter 11 dígitos.').optional(),
        rg: z.string().nullable().optional(),
        rgIssuer: z.string().nullable().optional(),
        birthDate: z.string().nullable().optional(),
        nationality: z.string().nullable().optional(),
        gender: z.string().nullable().optional(),
        phone: z.coerce.string().nullable().optional(),
        address: z.string().nullable().optional(),
        addressNumber: z.coerce.string().nullable().optional(),
        neighborhood: z.string().nullable().optional(),
        city: z.string(),
        state: z.string().length(2, 'A sigla do estado deve ter 2 letras.'),
        zipCode: z.coerce.string(),
        latitude: z.coerce.number().nullable().optional(),
        longitude: z.coerce.number().nullable().optional(),
        mainPartnerName: z.string().nullable().optional(),
        fullName: z.string().nullable().optional()
    }).nullable().optional()
});

const updatePfSchema = z.object({
    cpf: z.string().length(11, 'O CPF deve ter 11 dígitos.').optional(),
    rg: z.string().nullable().optional(),
    rgIssuer: z.string().nullable().optional(),
    birthDate: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    maritalStatus: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL']).nullable().optional(),
    motherName: z.string().nullable().optional(),
    monthlyIncome: z.string().nullable().optional(),
    occupation: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    addressNumber: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    city: z.string().optional(),
    state: z.string().length(2, 'A sigla do estado deve ter 2 letras.').optional(),
    zipCode: z.string().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional()
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
    stateRegistration: z.string().nullable().optional(),
    cpf: z.string().length(11, 'O CPF deve ter 11 dígitos.').optional(),
    rg: z.string().nullable().optional(),
    rgIssuer: z.string().nullable().optional(),
    birthDate: z.string().nullable().optional(),
    nationality: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    addressNumber: z.string().nullable().optional(),
    neighborhood: z.string().nullable().optional(),
    city: z.string().optional(),
    state: z.string().length(2, 'A sigla do estado deve ter 2 letras.').optional(),
    zipCode: z.string().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    mainPartnerName: z.string().nullable().optional(),
    fullName: z.string().nullable().optional()
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

        if (pfType === 'FISICA' && pfDetails?.cpf) {
            const existingCpf = await prisma.pessoaFisica.findUnique({
                where: { cpf: pfDetails.cpf }
            });
            if (existingCpf) {
                return res.status(400).json({ error: 'Este CPF já está em uso.' });
            }
        }

        if (pfType === 'JURIDICA' && pjDetails?.cnpj) {
            const existingCnpj = await prisma.pessoaJuridica.findUnique({
                where: { cnpj: pjDetails.cnpj }
            });
            if (existingCnpj) {
                return res.status(400).json({ error: 'Este CNPJ já está em uso.' });
            }
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

        const emailVerified = false;
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                pfType,
                emailVerified,
                emailVerificationToken: verificationToken,
                emailTokenExpiry: tokenExpiry,
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
                            annualRevenue: pjDetails.annualRevenue ? Number(pjDetails.annualRevenue) : null,
                            birthDate: pjDetails.birthDate ? new Date(pjDetails.birthDate) : null
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

        try {
            const requestOrigin = req.headers.origin;
            await sendVerificationEmail(email, verificationToken, requestOrigin);
        } catch (e) {
            console.error("Falha ao enviar e-mail de verificação:", e);
        }

        if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true') {
            return res.status(201).json({ success: true, message: "Verifique seu email para ativar a conta" });
        }

        const jwtToken = jwt.sign(
            { id: newUser.id },
            process.env.JWT_SECRET || 'supersecretJWT',
            { expiresIn: '1d' }
        );

        res.status(201).json({
            message: 'Usuário registrado com sucesso',
            token: jwtToken,
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
            const errorMessage = error.issues ? error.issues[0].message : (error.errors?.[0]?.message || 'Erro de validação.');
            return res.status(400).json({ error: errorMessage });
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

        if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerified) {
            return res.status(403).json({ error: 'Verifique seu email antes de fazer login.' });
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
            const errorMessage = error.issues ? error.issues[0].message : (error.errors?.[0]?.message || 'Erro de validação.');
            return res.status(400).json({ error: errorMessage });
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
            const errorMessage = error.issues ? error.issues[0].message : (error.errors?.[0]?.message || 'Erro de validação.');
            return res.status(400).json({ error: errorMessage });
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
            const errorMessage = error.issues ? error.issues[0].message : (error.errors?.[0]?.message || 'Erro de validação.');
            return res.status(400).json({ error: errorMessage });
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
            ...(data.annualRevenue && { annualRevenue: Number(data.annualRevenue) }),
            ...(data.birthDate && { birthDate: new Date(data.birthDate) })
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
            const errorMessage = error.issues ? error.issues[0].message : (error.errors?.[0]?.message || 'Erro de validação.');
            return res.status(400).json({ error: errorMessage });
        }
        console.error('Erro na atualização PJ: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const getUserByIdentifier = async (req, res) => {
    try {
        const { identifier } = req.params;

        // Verifica se o identificador formato é um CPF (11 dígitos) ou CNPJ (14 dígitos) numéricos apenas
        const isCpf = /^\d{11}$/.test(identifier);
        const isCnpj = /^\d{14}$/.test(identifier);

        let user;

        if (isCpf || isCnpj) {
            let userIdToSearch = null;

            if (isCpf) {
                // Tenta achar na PessoaFisica
                const pf = await prisma.pessoaFisica.findUnique({ where: { cpf: identifier } });
                if (pf) {
                    userIdToSearch = pf.userId;
                } else {
                    // Se não achar, tenta na PessoaJuridica usando findFirst (já que cpf em PJ não é @unique)
                    const pj = await prisma.pessoaJuridica.findFirst({ where: { cpf: identifier } });
                    if (pj) {
                        userIdToSearch = pj.userId;
                    }
                }
            } else if (isCnpj) {
                // Tenta achar na PessoaJuridica pelo CNPJ
                const pj = await prisma.pessoaJuridica.findUnique({ where: { cnpj: identifier } });
                if (pj) {
                    userIdToSearch = pj.userId;
                }
            }

            if (!userIdToSearch) {
                return res.status(404).json({ error: 'Usuário não encontrado com este identificador corporativo (CPF/CNPJ).' });
            }

            user = await prisma.user.findUnique({
                where: { id: userIdToSearch },
                include: {
                    pessoaFisica: true,
                    pessoaJuridica: true
                }
            });
        } else {
            // Busca o usuário pelo ID
            user = await prisma.user.findUnique({
                where: { id: identifier },
                include: {
                    pessoaFisica: true,
                    pessoaJuridica: true
                }
            });
        }

        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        res.json({
            id: user.id,
            name: user.name,
            email: user.email,
            pfType: user.pfType,
            pfDetails: user.pfType === 'FISICA' ? (user.pessoaFisica || null) : null,
            pjDetails: user.pfType === 'JURIDICA' ? (user.pessoaJuridica || null) : null
        });

    } catch (error) {
        console.error('Erro ao buscar usuário: ', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

export const verifyEmail = async (req, res) => {
    try {
        const { token } = req.body;
        const requestToken = token || req.params.token;

        if (!requestToken) {
            return res.status(400).json({ error: "Código de verificação não fornecido." });
        }

        const user = await prisma.user.findFirst({
            where: { emailVerificationToken: requestToken }
        });

        if (!user) {
            return res.status(400).json({ error: "Código de verificação inválido ou não encontrado." });
        }

        if (user.emailTokenExpiry && user.emailTokenExpiry < new Date()) {
            return res.status(400).json({ error: "Código de verificação expirado." });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerified: true,
                emailVerificationToken: null,
                emailTokenExpiry: null
            }
        });

        res.json({ success: true, message: "E-mail ativado com sucesso!" });

    } catch (error) {
        console.error("Erro na verificação de e-mail:", error);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
};

export const resendVerification = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(404).json({ error: "Usuário com este e-mail não encontrado." });
        }

        if (user.emailVerified) {
            return res.status(400).json({ error: "Este email já está verificado." });
        }

        const token = Math.floor(100000 + Math.random() * 900000).toString();
        const tokenExpiry = new Date();
        tokenExpiry.setHours(tokenExpiry.getHours() + 24);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                emailVerificationToken: token,
                emailTokenExpiry: tokenExpiry
            }
        });

        const requestOrigin = req.headers.origin;
        await sendVerificationEmail(email, token, requestOrigin);

        res.json({ success: true, message: "Novo código enviado com sucesso para o seu e-mail." });

    } catch (error) {
        console.error("Erro no reenvio de código:", error);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
};

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "E-mail é obrigatório." });
        }

        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() }
        });

        if (!user) {
            return res.json({ success: true, message: "Se o e-mail estiver cadastrado, você receberá um link de redefinição." });
        }

        if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerified) {
            return res.status(400).json({ message: "Verifique seu e-mail antes de redefinir a senha." });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpiry: expiry
            }
        });

        try {
            const requestOrigin = req.headers.origin;
            await sendResetPasswordEmail(email, token, requestOrigin);
        } catch (e) {
            console.error("Falha ao enviar e-mail de redefinição de senha:", e);
        }

        res.json({ success: true, message: "Se o e-mail estiver cadastrado, você receberá um link de redefinição." });

    } catch (error) {
        console.error("Erro em forgotPassword:", error);
        res.status(500).json({ message: "Erro interno no servidor." });
    }
};

export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: "Token e nova senha são obrigatórios." });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "A senha deve ter pelo menos 8 caracteres." });
        }

        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecial) {
            return res.status(400).json({ message: "A senha deve conter letras maiúsculas, minúsculas, números e caracteres especiais." });
        }

        const user = await prisma.user.findFirst({
            where: { resetPasswordToken: token }
        });

        if (!user) {
            return res.status(400).json({ message: "Token inválido ou expirado." });
        }

        if (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date()) {
           await prisma.user.update({
               where: { id: user.id },
               data: { resetPasswordToken: null, resetPasswordExpiry: null }
           });
           return res.status(400).json({ message: "Token expirado. Solicite um novo link." });
        }

        const passwordMatchesCurrent = await bcrypt.compare(password, user.password);
        if (passwordMatchesCurrent) {
            return res.status(400).json({ message: "A nova senha deve ser diferente da atual." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpiry: null
            }
        });

        res.json({ success: true, message: "Senha alterada com sucesso. Faça login com a nova senha." });

    } catch (error) {
        console.error("Erro em resetPassword:", error);
        res.status(500).json({ message: "Erro interno no servidor." });
    }
};

export const verifyResetToken = async (req, res) => {
    try {
        const { token } = req.params;
        const user = await prisma.user.findFirst({
            where: { resetPasswordToken: token }
        });

        if (!user || (user.resetPasswordExpiry && user.resetPasswordExpiry < new Date())) {
            return res.status(400).json({ valid: false });
        }

        res.json({ valid: true });

    } catch (error) {
        console.error("Erro em verifyResetToken:", error);
        res.status(500).json({ valid: false, message: "Erro interno no servidor." });
    }
};
