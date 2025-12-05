import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type NotificationType = 
  | "ticket_created" 
  | "new_ticket_alert" 
  | "status_updated" 
  | "feedback_request";

interface NotificationRequest {
  type: NotificationType;
  ticket: {
    id: string;
    protocolo: string;
    titulo: string;
    descricao?: string;
    newStatus?: string;
    solicitante?: string;
  };
  recipient: {
    email: string;
    name: string;
  };
}

// Email templates with Grupo Astrotur branding
const getEmailTemplate = (type: NotificationType, ticket: NotificationRequest["ticket"], recipientName: string): { subject: string; html: string } => {
  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(".supabase.co", ".lovable.app") || "https://app.lovable.app";
  const ticketUrl = `${baseUrl}/ticket/${ticket.id}`;
  
  const headerStyle = `
    background: linear-gradient(135deg, #D32F2F 0%, #B71C1C 100%);
    padding: 30px;
    text-align: center;
  `;
  
  const containerStyle = `
    max-width: 600px;
    margin: 0 auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: #ffffff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  `;
  
  const buttonStyle = `
    display: inline-block;
    background-color: #D32F2F;
    color: #ffffff;
    text-decoration: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: 600;
    margin-top: 20px;
  `;

  const footerStyle = `
    background-color: #f5f5f5;
    padding: 20px;
    text-align: center;
    color: #6B6B6B;
    font-size: 12px;
  `;

  switch (type) {
    case "ticket_created":
      return {
        subject: `Ticket #${ticket.protocolo} criado com sucesso`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Olá, ${recipientName}!</h2>
              <p style="color: #666; line-height: 1.6;">
                Seu ticket de suporte foi criado com sucesso. Nossa equipe de TI irá analisar sua solicitação em breve.
              </p>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
              </div>
              <p style="color: #666; line-height: 1.6;">
                Você pode acompanhar o status do seu ticket a qualquer momento clicando no botão abaixo:
              </p>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
              <p style="margin: 5px 0 0 0;">Este é um email automático, por favor não responda.</p>
            </div>
          </div>
        `,
      };

    case "new_ticket_alert":
      return {
        subject: `🔔 Novo ticket: ${ticket.titulo}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Novo Ticket Aberto</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${recipientName}! Um novo ticket de suporte foi aberto e precisa de atenção.
              </p>
              <div style="background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Solicitante:</strong> ${ticket.solicitante || "Não informado"}</p>
              </div>
              ${ticket.descricao ? `
                <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                  <p style="margin: 0 0 10px 0; color: #333; font-weight: 600;">Descrição:</p>
                  <p style="margin: 0; color: #666; white-space: pre-wrap;">${ticket.descricao.substring(0, 300)}${ticket.descricao.length > 300 ? "..." : ""}</p>
                </div>
              ` : ""}
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Atender Ticket</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
            </div>
          </div>
        `,
      };

    case "status_updated":
      const statusLabels: Record<string, string> = {
        aberto: "Aberto",
        em_andamento: "Em Andamento",
        aguardando_resposta: "Aguardando Resposta",
        resolvido: "Resolvido",
        fechado: "Fechado",
      };
      const statusLabel = statusLabels[ticket.newStatus || ""] || ticket.newStatus;
      
      return {
        subject: `Ticket #${ticket.protocolo} - Status atualizado para ${statusLabel}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Atualização do seu Ticket</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${recipientName}! O status do seu ticket foi atualizado.
              </p>
              <div style="background-color: #e3f2fd; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0 0 10px 0; color: #333; font-size: 14px;">Novo Status:</p>
                <p style="margin: 0; color: #1976d2; font-size: 20px; font-weight: 600;">${statusLabel}</p>
              </div>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
              </div>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Ver Ticket</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
              <p style="margin: 5px 0 0 0;">Este é um email automático, por favor não responda.</p>
            </div>
          </div>
        `,
      };

    case "feedback_request":
      return {
        subject: `Avalie o atendimento - Ticket #${ticket.protocolo}`,
        html: `
          <div style="${containerStyle}">
            <div style="${headerStyle}">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Help Desk - Grupo Astrotur</h1>
            </div>
            <div style="padding: 30px;">
              <h2 style="color: #333; margin-top: 0;">Seu Ticket foi Resolvido! 🎉</h2>
              <p style="color: #666; line-height: 1.6;">
                Olá, ${recipientName}! Seu ticket de suporte foi marcado como resolvido.
              </p>
              <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
                <p style="margin: 0; color: #2e7d32; font-size: 18px;">✅ Ticket Resolvido</p>
              </div>
              <div style="background-color: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0; color: #333;"><strong>Protocolo:</strong> ${ticket.protocolo}</p>
                <p style="margin: 5px 0; color: #333;"><strong>Título:</strong> ${ticket.titulo}</p>
              </div>
              <p style="color: #666; line-height: 1.6;">
                <strong>Sua opinião é muito importante!</strong> Por favor, avalie o atendimento para que possamos continuar melhorando nossos serviços.
              </p>
              <div style="text-align: center;">
                <a href="${ticketUrl}" style="${buttonStyle}">Avaliar Atendimento</a>
              </div>
            </div>
            <div style="${footerStyle}">
              <p style="margin: 0;">© ${new Date().getFullYear()} Grupo Astrotur - Todos os direitos reservados</p>
              <p style="margin: 5px 0 0 0;">Obrigado por utilizar nosso Help Desk!</p>
            </div>
          </div>
        `,
      };

    default:
      return {
        subject: `Notificação - Help Desk`,
        html: `<p>Notificação do Help Desk</p>`,
      };
  }
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, ticket, recipient }: NotificationRequest = await req.json();

    console.log(`[send-notification] Sending ${type} email to ${recipient.email}`);

    const { subject, html } = getEmailTemplate(type, ticket, recipient.name);

    const emailResponse = await resend.emails.send({
      from: "Help Desk Astrotur <onboarding@resend.dev>",
      to: [recipient.email],
      subject,
      html,
    });

    console.log("[send-notification] Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("[send-notification] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
