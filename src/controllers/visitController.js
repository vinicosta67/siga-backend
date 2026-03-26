import prisma from '../config/db.js';

export const createVisit = async (req, res) => {
    try {
        const {
            nome, dataHora, zip, street, number, neighborhood,
            city, state, complement, latitude, longitude
        } = req.body;

        const userId = req.user.id;

        if (!nome || !dataHora || !street || !number || !city || !state) {
            return res.status(400).json({ error: "Preencha os campos obrigatórios (nome, dataHora, e os dados de endereço)." });
        }

        const fallbackAddress = `${street}, ${number}${complement ? ` - ${complement}` : ''}${neighborhood ? ` - ${neighborhood}` : ''}, ${city} - ${state}${zip ? `, ${zip}` : ''}`;

        const newVisit = await prisma.visit.create({
            data: {
                clientName: nome,
                scheduledAt: new Date(dataHora),
                address: fallbackAddress,
                zip,
                street,
                number,
                neighborhood,
                city,
                state,
                complement,
                latitude,
                longitude,
                userId: userId
            }
        });

        return res.status(201).json(newVisit);
    } catch (error) {
        console.error("Erro ao criar visita:", error);
        return res.status(500).json({ error: "Erro interno ao criar visita." });
    }
};

export const getVisits = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const isManager = req.user.permissions?.some(p => p.id === 1001);
        const whereClause = isManager ? {} : { userId: req.user.id };

        if (startDate && endDate) {
            whereClause.scheduledAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const visits = await prisma.visit.findMany({
            where: whereClause,
            orderBy: {
                scheduledAt: 'asc'
            }
        });

        return res.status(200).json(visits);
    } catch (error) {
        console.error("Erro ao buscar visitas:", error);
        return res.status(500).json({ error: "Erro interno ao buscar visitas." });
    }
};

export const updateVisit = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nome, clientName,
            dataHora, scheduledAt,
            status,
            address, zip, street, number, neighborhood,
            city, state, complement, latitude, longitude,
            opportunities
        } = req.body;

        // Verifica se o usuário tem a permissão 1001 (Gerente)
        const isManager = req.user.permissions?.some(p => p.id === 1001);

        if (!isManager) {
            return res.status(403).json({ error: "Acesso negado. Apenas gerentes podem editar visitas." });
        }

        const visitExists = await prisma.visit.findFirst({
            where: { id }
        });

        if (!visitExists) {
            return res.status(404).json({ error: "Visita não encontrada." });
        }

        const finalClientName = clientName || nome || visitExists.clientName;
        const finalScheduledAt = scheduledAt ? new Date(scheduledAt) : (dataHora ? new Date(dataHora) : visitExists.scheduledAt);
        const finalStatus = status || visitExists.status;
        const finalZip = zip !== undefined ? zip : visitExists.zip;
        const finalStreet = street !== undefined ? street : visitExists.street;
        const finalNumber = number !== undefined ? number : visitExists.number;
        const finalNeighborhood = neighborhood !== undefined ? neighborhood : visitExists.neighborhood;
        const finalCity = city !== undefined ? city : visitExists.city;
        const finalState = state !== undefined ? state : visitExists.state;
        const finalComplement = complement !== undefined ? complement : visitExists.complement;
        const finalLatitude = latitude !== undefined ? latitude : visitExists.latitude;
        const finalLongitude = longitude !== undefined ? longitude : visitExists.longitude;
        const finalOpportunities = opportunities !== undefined ? opportunities : visitExists.opportunities;

        let finalAddress = address;
        if (!finalAddress) {
            if (finalStreet && finalNumber && finalCity && finalState) {
                finalAddress = `${finalStreet}, ${finalNumber}${finalComplement ? ` - ${finalComplement}` : ''}${finalNeighborhood ? ` - ${finalNeighborhood}` : ''}, ${finalCity} - ${finalState}${finalZip ? `, ${finalZip}` : ''}`;
            } else {
                finalAddress = visitExists.address;
            }
        }

        const updatedVisit = await prisma.visit.update({
            where: { id },
            data: {
                clientName: finalClientName,
                scheduledAt: finalScheduledAt,
                status: finalStatus,
                address: finalAddress,
                zip: finalZip,
                street: finalStreet,
                number: finalNumber,
                neighborhood: finalNeighborhood,
                city: finalCity,
                state: finalState,
                complement: finalComplement,
                latitude: finalLatitude,
                longitude: finalLongitude,
                opportunities: finalOpportunities,
            }
        });

        return res.status(200).json(updatedVisit);
    } catch (error) {
        console.error("Erro ao atualizar visita:", error);
        return res.status(500).json({ error: "Erro interno ao atualizar visita." });
    }
};

export const getVisitsDashboard = async (req, res) => {
    try {
        const isManager = req.user.permissions?.some(p => p.id === 1001);
        const whereClause = isManager ? {} : { userId: req.user.id };

        const visits = await prisma.visit.findMany({
            where: whereClause
        });

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(now.getDate() - now.getDay());

        const endOfWeek = new Date(now);
        endOfWeek.setHours(23, 59, 59, 999);
        endOfWeek.setDate(now.getDate() + (6 - now.getDay()));

        let realizadasNaSemana = 0;
        let agendadasNaSemana = 0;
        let rejeitadas = 0;
        let naoRealizadas = 0;

        // Conversão
        let realizadasComInteresse = 0;

        visits.forEach(v => {
            const visDate = new Date(v.scheduledAt);
            const isThisWeek = visDate >= startOfWeek && visDate <= endOfWeek;

            if (v.status === 'AGENDADA') {
                if (isThisWeek) agendadasNaSemana++;
            }

            if (v.status === 'ACEITO' || v.status === 'REJEITADO') {
                if (isThisWeek) realizadasNaSemana++;

                if (v.opportunities && v.opportunities.length > 0) {
                    realizadasComInteresse++;
                }
            }

            if (v.status === 'REJEITADO') {
                rejeitadas++;
            }

            if (v.status === 'ENCERRADO') {
                naoRealizadas++;
            }
        });

        const totalVisitas = visits.length;
        let conversaoPosVisita = 0;
        // conversão: (quantas realizadas e o cliente teve interesse em prosseguir) / (total de propostas agendadas)
        if (totalVisitas > 0) {
            conversaoPosVisita = (realizadasComInteresse / totalVisitas) * 100;
        }

        return res.status(200).json({
            realizadasNaSemana,
            agendadasNaSemana,
            rejeitadas,
            naoRealizadas,
            conversaoPosVisita: Math.round(conversaoPosVisita)
        });

    } catch (error) {
        console.error("Erro ao buscar estatísticas do dashboard de visitas:", error);
        return res.status(500).json({ error: "Erro interno ao buscar dashboard." });
    }
};
