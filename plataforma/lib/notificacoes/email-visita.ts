import "server-only";

import nodemailer from "nodemailer";

// Alerta interno de nova visita agendada pelo Portal de Inscrições.
// Destino: secretaria (VISITA_ALERTA_TO) com cópia oculta de acompanhamento
// (VISITA_ALERTA_BCC). Best-effort: se o SMTP não estiver configurado, apenas
// registra um aviso e retorna — NUNCA quebra a confirmação da visita.

const PAPEL_LABEL: Record<string, string> = {
  pai: "Pai",
  mae: "Mãe",
  responsavel: "Responsável",
  candidato: "Candidato(a)",
};

export interface DadosAlertaVisita {
  nome: string;
  email: string;
  telefone: string | null;
  segmento: string;
  participantes: { nome: string; papel: string; serie: string | null }[];
  inicio: string; // ISO
  fim: string; // ISO
  local: string | null;
}

function criarTransporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const TZ = "America/Sao_Paulo";

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  });
}

// Escapa dados vindos do formulário público antes de interpolar no HTML.
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function enviarAlertaVisita(d: DadosAlertaVisita): Promise<void> {
  const tx = criarTransporter();
  if (!tx) {
    console.warn(
      "[visitas] SMTP_HOST não configurado — alerta de visita para a secretaria não enviado.",
    );
    return;
  }

  const para = process.env.VISITA_ALERTA_TO || "secretaria@csa.com.br";
  const bcc = process.env.VISITA_ALERTA_BCC || "cesar@csa.com.br";
  const remetente = process.env.MAIL_FROM || process.env.SMTP_USER || para;

  // Link para o módulo de visitas na AGOS (se a base estiver configurada).
  const agosBase = process.env.AGOS_URL?.replace(/\/$/, "");
  const agosLink = agosBase ? `${agosBase}/pt-BR/visitas` : null;

  const qtd = d.participantes.length;
  const participantesHtml = d.participantes
    .map(
      (p) =>
        `<li><strong>${esc(PAPEL_LABEL[p.papel] ?? p.papel)}:</strong> ${esc(p.nome)}${
          p.serie ? ` <span style="color:#666;">(${esc(p.serie)})</span>` : ""
        }</li>`,
    )
    .join("");

  const ctaAgos = agosLink
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${esc(agosLink)}"
            style="background-color:#0b5cab;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
           Abrir no AGOS — Agendamento de visitas
         </a>
       </div>`
    : `<p style="margin:20px 0;">Verifique e gerencie este agendamento na
         <strong>plataforma AGOS</strong>, módulo <em>Agendamento de visitas</em>.</p>`;

  const assunto = `Nova visita agendada — ${d.nome} (${fmtDataCurta(d.inicio)})`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;">
      <h2 style="color:#0b5cab;">Portal de Inscrições — Nova visita agendada</h2>
      <p>Uma nova visita foi agendada pelo site de inscrições. Os detalhes estão abaixo.</p>

      <div style="background-color:#f5f7fa;padding:20px;border-radius:8px;margin:20px 0;">
        <p style="margin:0 0 6px;"><strong>Data e hora:</strong> ${fmtDataHora(d.inicio)} – ${fmtHora(d.fim)}</p>
        <p style="margin:0 0 6px;"><strong>Local:</strong> ${esc(d.local) || "—"}</p>
        <p style="margin:0 0 6px;"><strong>Responsável:</strong> ${esc(d.nome)}</p>
        <p style="margin:0 0 6px;"><strong>E-mail:</strong> ${esc(d.email)}</p>
        <p style="margin:0 0 6px;"><strong>Telefone:</strong> ${esc(d.telefone) || "—"}</p>
        <p style="margin:0 0 6px;"><strong>Segmento de interesse:</strong> ${esc(d.segmento)}</p>
        <p style="margin:0 0 6px;"><strong>Pessoas:</strong> ${qtd} pessoa${qtd === 1 ? "" : "s"}</p>
        <p style="margin:12px 0 4px;"><strong>Participantes:</strong></p>
        <ul style="margin:0;padding-left:20px;">${participantesHtml}</ul>
      </div>

      ${ctaAgos}

      <hr style="margin:30px 0;border:none;border-top:1px solid #ddd;">
      <p style="font-size:12px;color:#666;">
        E-mail automático do Portal de Admissão do Colégio Santo Agostinho — Leblon.
        Este agendamento também alimenta o funil de marketing/CRM.
      </p>
    </div>
  `;

  const texto = [
    "Portal de Inscrições — Nova visita agendada",
    "",
    `Data e hora: ${fmtDataHora(d.inicio)} – ${fmtHora(d.fim)}`,
    `Local: ${d.local || "—"}`,
    `Responsável: ${d.nome}`,
    `E-mail: ${d.email}`,
    `Telefone: ${d.telefone || "—"}`,
    `Segmento de interesse: ${d.segmento}`,
    `Pessoas: ${qtd}`,
    "Participantes:",
    ...d.participantes.map(
      (p) =>
        `  - ${PAPEL_LABEL[p.papel] ?? p.papel}: ${p.nome}${p.serie ? ` (${p.serie})` : ""}`,
    ),
    "",
    agosLink
      ? `Gerencie no AGOS: ${agosLink}`
      : "Verifique e gerencie na plataforma AGOS (módulo Agendamento de visitas).",
  ].join("\n");

  await tx.sendMail({
    from: remetente,
    to: para,
    bcc,
    subject: assunto,
    text: texto,
    html,
  });
}
