import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(to, token, originUrl) {
  const frontendUrl = originUrl || process.env.FRONTEND_URL || "http://localhost:5000";
  const link = `${frontendUrl}/verificar-email/${token}`;

  await transporter.sendMail({
    from: '"SIGA" <naoresponda@seusiga.com>',
    to,
    subject: "Código de Verificação - SIGA",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2e7d32;">Bem-vindo ao SIGA!</h2>
          <p>Para ativar sua conta e liberar o acesso ao sistema, utilize o código de verificação abaixo:</p>
          <div style="margin: 30px 0; padding: 15px; background: #f5f5f5; border-radius: 8px; text-align: center;">
            <p style="font-size: 32px; font-weight: bold; letter-spacing: 10px; margin: 0; color: #333;">${token}</p>
          </div>
          <p>Ou, se preferir, clique no botão abaixo para verificar automaticamente:</p>
          <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #2e7d32; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Validar Meu E-mail</a>
          <br/><br/>
          <p style="font-size: 12px; color: #777;">O código expira em 24 horas.</p>
      </div>
    `,
  });
}

export async function sendResetPasswordEmail(to, token, originUrl) {
  const frontendUrl = originUrl || process.env.FRONTEND_URL || "http://localhost:5000";
  const link = `${frontendUrl}/reset-senha/${token}`;

  await transporter.sendMail({
    from: '"SIGA" <naoresponda@seusiga.com>',
    to,
    subject: "Redefinição de senha - SIGA",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #2e7d32;">Redefinição de Senha</h2>
          <p>Você solicitou a redefinição de senha no SIGA.</p>
          <p>Clique no botão abaixo para criar uma nova senha (válido por 1 hora):</p>
          <br/>
          <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #2e7d32; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">Redefinir Minha Senha</a>
          <br/><br/>
          <p style="font-size: 14px; color: #555;">Se o botão não funcionar, você também pode acessar o link diretamente:</p>
          <a href="${link}" style="font-size: 14px; color: #2e7d32; word-break: break-all;">${link}</a>
          <br/><br/>
          <p style="font-size: 12px; color: #999;"><em>Se não foi você que solicitou, ignore este e-mail. Sua senha continuará segura.</em></p>
      </div>
    `,
  });
}
