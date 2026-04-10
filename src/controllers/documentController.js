import prisma from '../config/db.js';
import crypto from 'crypto';

const findUserPendingSignature = async (doc, userId) => {
    let sig = doc.signatures.find(s => s.userId === userId && s.status === 'pending');
    if (sig) return sig;

    const userObj = await prisma.user.findUnique({ where: { id: userId }, include: { permissions: true } });
    if (!userObj) return null;

    const isManager = userObj.permissions.some(p => p.id === 1001);
    const isAnalyst = userObj.permissions.some(p => p.id === 1002);

    if (isManager) {
        sig = doc.signatures.find(s => s.role === 'gerente' && s.userId === null && s.status === 'pending');
    }
    if (!sig && isAnalyst) {
        sig = doc.signatures.find(s => s.role === 'analista' && s.userId === null && s.status === 'pending');
    }
    return sig;
};

const rejectDocumentLogic = async (req, res, documentId, currentUserId, comment, ipAddress) => {
    try {
        const userObj = await prisma.user.findUnique({ where: { id: currentUserId }, include: { permissions: true } });
        const isManager = userObj.permissions.some(p => p.id === 1001);
        const isAnalyst = userObj.permissions.some(p => p.id === 1002);

        const pendingSignatures = await prisma.signature.findMany({
            where: { documentId, status: 'pending' },
            orderBy: { order: 'asc' }
        });

        if (pendingSignatures.length === 0) {
            return res.status(400).json({ error: "Não há pendências neste documento." });
        }

        let matchSig = null;
        for (const sig of pendingSignatures) {
            if (sig.userId === currentUserId || (sig.userId === null && sig.role === 'gerente' && isManager) || (sig.userId === null && sig.role === 'analista' && isAnalyst)) {
                matchSig = sig;
                break;
            } else {
                break; // Hierarquia vazou e o primeiro pendente nao é compatível
            }
        }

        if (!matchSig) return res.status(403).json({ error: "Assinatura bloqueada: Aguardando papel anterior na hierarquia assinar primeiro." });

        await prisma.$transaction([
             prisma.signature.update({
                 where: { id: matchSig.id },
                 data: { status: 'rejected', userId: currentUserId, signedAt: new Date(), ipAddress }
             }),
             prisma.auditLog.create({
                 data: {
                     userId: currentUserId,
                     action: 'document_rejected',
                     entityType: 'document',
                     entityId: documentId,
                     details: { comment, rejectedRole: matchSig.role },
                     ipAddress
                 }
             }),
             prisma.document.update({
                 where: { id: documentId },
                 data: { signatureStatus: 'rejected' }
             })
        ]);

        res.json({ success: true, message: "Documento rejeitado e log gerado." });

    } catch (error) {
        console.error("Erro na rejeição:", error);
        res.status(500).json({ error: "Erro interno na rejeição." });
    }
};

export const signDocument = async (req, res) => {
    try {
        const documentId = req.params.id;
        const currentUserId = req.user.id;
        const { action, comment } = req.body;
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        if (action === 'reject') {
            return rejectDocumentLogic(req, res, documentId, currentUserId, comment, ipAddress);
        }

        const userObj = await prisma.user.findUnique({ where: { id: currentUserId }, include: { permissions: true } });
        const isManager = userObj.permissions.some(p => p.id === 1001);
        const isAnalyst = userObj.permissions.some(p => p.id === 1002);

        const pendingSignatures = await prisma.signature.findMany({
            where: { documentId, status: 'pending' },
            orderBy: { order: 'asc' }
        });

        if (pendingSignatures.length === 0) {
            return res.status(400).json({ error: "Não há pendências neste documento." });
        }

        const cadeirasParaAssinar = [];

        for (const sig of pendingSignatures) {
            let isMatch = false;
            if (sig.userId === currentUserId) isMatch = true;
            if (sig.userId === null) {
                if (sig.role === 'gerente' && isManager) isMatch = true;
                if (sig.role === 'analista' && isAnalyst) isMatch = true;
            }

            if (isMatch) {
                cadeirasParaAssinar.push(sig);
            } else {
                break;
            }
        }

        if (cadeirasParaAssinar.length === 0) {
            return res.status(403).json({ error: "Assinatura bloqueada: Aguardando o papel anterior na hierarquia assinar." });
        }

        const signatureHash = crypto.createHash('sha256').update(`${documentId}-${currentUserId}-${Date.now()}`).digest('hex');

        await prisma.$transaction([
            ...cadeirasParaAssinar.map(sig => prisma.signature.update({
                where: { id: sig.id },
                data: {
                    status: 'signed',
                    userId: currentUserId,
                    signedAt: new Date(),
                    ipAddress,
                    signatureHash
                }
            })),
            prisma.auditLog.create({
                data: {
                    userId: currentUserId,
                    action: 'document_signed',
                    entityType: 'document',
                    entityId: documentId,
                    details: { comment, signatureHash, assignedRoles: cadeirasParaAssinar.map(c => c.role) },
                    ipAddress
                }
            })
        ]);

        const docAllSignatures = await prisma.signature.findMany({ where: { documentId } });
        const hasPending = docAllSignatures.some(s => s.status === 'pending');
        const nextStatus = hasPending ? "in_progress" : "signed";
        
        await prisma.document.update({
             where: { id: documentId },
             data: { signatureStatus: nextStatus }
        });

        res.json({ success: true, signature: {}, documentStatus: nextStatus, message: `Assinado como ${cadeirasParaAssinar.map(c => c.role).join(' e ')}` });

    } catch (error) {
        console.error("Erro ao assinar:", error);
        res.status(500).json({ error: "Erro interno no processo de assinatura." });
    }
};

export const rejectDocument = async (req, res) => {
    // Separate explicit endpoint to conform to /reject
    const documentId = req.params.id;
    const userId = req.user.id;
    const { comment } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    return rejectDocumentLogic(req, res, documentId, userId, comment, ipAddress);
};

export const getDocumentSignatures = async (req, res) => {
     try {
         const { id } = req.params;
         let doc = await prisma.document.findUnique({
             where: { id },
             include: { 
                 proposal: true,
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

         if (!doc) return res.status(404).json({ error: "Documento não encontrado." });

         // Auto-Healer e Sincronizador para Cadeiras de Assinatura
         let needsRelookup = false;

         if (doc.signatures.length === 0) {
             const pendingSignatures = [
                 { proposalId: doc.proposalId, documentId: doc.id, userId: doc.proposal.analystId || null, role: 'analista', order: 1 },
                 { proposalId: doc.proposalId, documentId: doc.id, userId: null, role: 'gerente', order: 2 },
                 { proposalId: doc.proposalId, documentId: doc.id, userId: doc.proposal.userId, role: 'cliente', order: 3 }
             ];
             await prisma.signature.createMany({ data: pendingSignatures });
             needsRelookup = true;
         } else {
             // Sync se a proposta ganhou Analista depois que a assinatura foi gerada
             const analistaSig = doc.signatures.find(s => s.role === 'analista' && s.userId === null && s.status === 'pending');
             if (analistaSig && doc.proposal.analystId) {
                 await prisma.signature.update({
                     where: { id: analistaSig.id },
                     data: { userId: doc.proposal.analystId }
                 });
                 needsRelookup = true;
             }
         }

         if (needsRelookup) {
             // Relookup
             doc = await prisma.document.findUnique({
                 where: { id },
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
         }

         res.json({
             documentId: doc.id,
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
         });
     } catch(e) {
          console.error("Erro pegando signatures do documento:", e);
          res.status(500).json({ error: "Erro interno no servidor." });
     }
};
