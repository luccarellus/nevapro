/**
 * Email Service — Resend
 *
 * Gerencia o envio de e‑mails transacionais, como redefinição de senha e boas-vindas.
 * Requer a variável de ambiente RESEND_API_KEY.
 */

import { Resend } from 'resend';
import { log } from '../utils/logger';

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY não configurada. Defina no .env');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/** Helper para garantir URL pública HTTPS válida da logo */
function getLogoUrl(): string {
  const envUrl = process.env.APP_URL || 'https://nevapro.olharjovem.org';
  let cleanUrl = envUrl.trim().replace(/\/$/, '');
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = `https://${cleanUrl}`;
  }
  cleanUrl = cleanUrl.replace(/^http:/, 'https:');
  return `${cleanUrl}/logo.png`;
}

/** E‑mail de redefinição de senha */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetLink: string,
): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL || 'naoresponda@olharjovem.org';
  const senderName = process.env.RESEND_SENDER_NAME || 'Neva PRO';
  const logoUrl = getLogoUrl();

  const { error } = await getClient().emails.send({
    from: `${senderName} <${from}>`,
    to,
    subject: 'Redefinição de senha — Neva PRO',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:24px;padding:32px 32px 40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <!-- Logo Header -->
              <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9;margin-bottom:24px;">
                <img src="${logoUrl}" alt="Instituto Olhar Jovem - Neva PRO" width="320" style="max-width:320px;width:100%;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
              </div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a1a2e;text-align:left;">
                Redefinição de senha
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6;text-align:left;">
                Olá, <strong>${userName}</strong>!
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;text-align:left;">
                Recebemos uma solicitação de redefinição de senha para sua conta no
                <strong>Neva PRO</strong>. Clique no botão abaixo para criar uma nova senha:
              </p>
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
                <tr>
                  <td align="center">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:16px 40px;background:#6C5CE7;color:#ffffff;
                              text-decoration:none;border-radius:40px;font-size:14px;font-weight:700;
                              letter-spacing:0.5px;">
                      Redefinir senha
                    </a>
                  </td>
                </tr>
              </table>
              <!-- Fallback link -->
              <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;word-break:break-all;text-align:left;">
                Ou copie o link:<br />
                <a href="${resetLink}" style="color:#6C5CE7;">${resetLink}</a>
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:left;">
                Este link expira em <strong>1 hora</strong>.<br />
                Se você não solicitou esta redefinição, ignore este e-mail.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Neva PRO &bull; Instituto Olhar Jovem<br />
                Se tiver dúvidas, entre em contato pelo nosso suporte.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  });

  if (error) {
    log.error('[Email] Erro ao enviar e-mail de reset:', error);
    throw error;
  }

  log.info(`[Email] E-mail de redefinição enviado para ${to}`);
}

/** E‑mail de boas-vindas para novos cadastros (incluindo integração EventEase) */
export async function sendWelcomeEmail(
  to: string,
  userName: string,
  loginUrl: string = process.env.APP_URL || 'https://nevapro.olharjovem.org',
): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL || 'naoresponda@olharjovem.org';
  const senderName = process.env.RESEND_SENDER_NAME || 'Neva PRO';
  const logoUrl = getLogoUrl();

  const { error } = await getClient().emails.send({
    from: `${senderName} <${from}>`,
    to,
    subject: 'Bem-vindo(a) ao Neva PRO! 🎉',
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:24px;padding:32px 32px 40px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
              <!-- Logo Header -->
              <div style="text-align:center;padding-bottom:20px;border-bottom:1px solid #f1f5f9;margin-bottom:24px;">
                <img src="${logoUrl}" alt="Instituto Olhar Jovem - Neva PRO" width="320" style="max-width:320px;width:100%;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
              </div>
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#1a1a2e;text-align:left;">
                Bem-vindo(a) ao Neva PRO!
              </h1>
              <p style="margin:0 0 16px;font-size:15px;color:#64748b;line-height:1.6;text-align:left;">
                Olá, <strong>${userName}</strong>!
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:#64748b;line-height:1.6;text-align:left;">
                Sua conta foi criada com sucesso e você já pode acessar a nossa plataforma de estudos e simulados.
              </p>
              
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;text-align:left;">
                <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#334155;">
                  🔑 Dados de Acesso:
                </p>
                <p style="margin:0 0 6px;font-size:14px;color:#475569;">
                  <strong>E-mail:</strong> ${to}
                </p>
                <p style="margin:0;font-size:14px;color:#475569;">
                  <strong>Senha padrão:</strong> <code style="background:#e2e8f0;padding:2px 8px;border-radius:6px;color:#6C5CE7;font-weight:bold;">nevapro123</code>
                </p>
              </div>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}"
                       style="display:inline-block;padding:16px 40px;background:#6C5CE7;color:#ffffff;
                              text-decoration:none;border-radius:40px;font-size:14px;font-weight:700;
                              letter-spacing:0.5px;">
                      Acessar a Plataforma
                    </a>
                  </td>
                </tr>
              </table>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:left;">
                💡 <em>Dica de Segurança:</em> Recomendamos que você altere sua senha após o primeiro acesso.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                Neva PRO &bull; Instituto Olhar Jovem<br />
                Bons estudos!
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
  });

  if (error) {
    log.error('[Email] Erro ao enviar e-mail de boas-vindas:', error);
    throw error;
  }

  log.info(`[Email] E-mail de boas-vindas enviado para ${to}`);
}
