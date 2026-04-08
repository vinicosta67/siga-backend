import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({});

async function main() {
    console.log('Iniciando inclusão de permissões padrão...');

    const permissions = [
        { "id": 1001, "description": "Permissão Gerente 1001" },
        { "id": 1002, "description": "Permissão Analista 1002" },
        { "id": 1003, "description": "Permissão Suporte 1003" },
        { "id": 1004, "description": "Permissão Cliente 1004" },
        { "id": 1005, "description": "Permissão Administrador 1005" }
    ];

    for (const perm of permissions) {
        await prisma.permission.upsert({
            where: { id: perm.id },
            update: {},
            create: {
                id: perm.id,
                description: perm.description
            }
        });
    }

    console.log('Permissões padrão inseridas/verificadas com sucesso!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
