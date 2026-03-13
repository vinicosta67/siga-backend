import prisma from '../config/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const registerSchema = z.object({
    name: z.string().min(2, 'O nome deve ter no mínimo 2 caracteres.'),
    email: z.string().email('E-mail inválido.'),
    password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres.'),
    permissionId: z.number().int().optional()
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
        const { name, email, password, permissionId } = registerSchema.parse(req.body);

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Este e-mail já está em uso.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                ...(permissionId && {
                    permissions: {
                        connect: { id: permissionId }
                    }
                })
            },
            include: {
                permissions: true
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
                perfil: newUser.permissions[0] || null
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
            include: { permissions: true }
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
                perfil: user.permissions[0] || null
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
            include: { permissions: true }
        });

        res.json({
            message: 'Usuário atualizado com sucesso!',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                perfil: updatedUser.permissions[0] || null
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
