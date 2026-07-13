"use client";

import { useEffect, useState } from "react";
import { LinhaDigitavelBoleto } from "@/components/LinhaDigitavelBoleto";

/** Resumo capturado no momento em que a matrícula é efetivada (mesma sessão). */
export interface MatriculaResumo {
  /** Mensagem de confirmação do RM (PRTMSGCONFIRMACAOMAT), se houver. */
  mensagem: string | null;
  /** Descrição do plano de pagamento escolhido, se houver. */
  planoDescricao: string | null;
  /** Data/hora (ISO) em que a matrícula foi concluída pelo portal. */
  dataHora: string;
}

const botaoBoleto =
  "block w-full rounded-lg bg-csa-azul px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-csa-azul/90";
const botaoContrato =
  "block w-full rounded-lg border border-csa-azul/30 bg-white px-4 py-2.5 text-center text-sm font-semibold text-csa-azul transition hover:bg-csa-azul/5";

function formatarDataHora(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface BoletoInfo {
  idBoleto: number | null;
  temPdf: boolean;
  urlBoletoFixo: string | null;
  linhaDigitavel: string | null;
}

interface ContratoParams {
  idAreaOfertada: number;
  codColigadaRelatorio: number;
  idRelatorio: number;
}

/**
 * Detalhes da matrícula CONCLUÍDA de um candidato, para o drawer do card (mesmo
 * padrão da inscrição). Mostra a confirmação, o plano e a data/hora (quando
 * vindos da mesma sessão, via `resumo`) e sempre tenta carregar, na WebAPI, o
 * boleto da matrícula e o contrato (quando o PS os disponibiliza).
 */
export function DetalhesMatricula({
  numeroInscricao,
  idps,
  resumo,
}: {
  numeroInscricao: number | null;
  idps: number | null;
  resumo?: MatriculaResumo | null;
}) {
  const [boleto, setBoleto] = useState<BoletoInfo | "carregando" | null>(
    "carregando",
  );
  const [contrato, setContrato] = useState<ContratoParams | null>(null);

  useEffect(() => {
    if (numeroInscricao == null || idps == null) {
      setBoleto(null);
      return;
    }
    let ativo = true;
    const q = new URLSearchParams({
      numeroInscricao: String(numeroInscricao),
      idps: String(idps),
    });
    (async () => {
      try {
        const res = await fetch(`/api/matricula/boleto?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as
          | { ok: true; boleto?: BoletoInfo | null }
          | { ok: false };
        if (ativo) setBoleto(data.ok ? (data.boleto ?? null) : null);
      } catch {
        if (ativo) setBoleto(null);
      }
    })();
    (async () => {
      try {
        const res = await fetch(`/api/matricula/contexto?${q.toString()}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as
          | {
              ok: true;
              idAreaOfertada?: number | null;
              parametros?: {
                codColigadaRelatorioContrato: number | null;
                idRelatorioContrato: number | null;
              } | null;
            }
          | { ok: false };
        if (!ativo || !data.ok) return;
        const idArea = data.idAreaOfertada ?? null;
        const codRel = data.parametros?.codColigadaRelatorioContrato ?? null;
        const idRel = data.parametros?.idRelatorioContrato ?? null;
        if (idArea != null && codRel != null && idRel != null) {
          setContrato({
            idAreaOfertada: idArea,
            codColigadaRelatorio: codRel,
            idRelatorio: idRel,
          });
        }
      } catch {
        // contrato é opcional: falha aqui apenas oculta o botão.
      }
    })();
    return () => {
      ativo = false;
    };
  }, [numeroInscricao, idps]);

  const urlBoletoPdf =
    boleto && boleto !== "carregando" && boleto.temPdf && boleto.idBoleto
      ? `/api/matricula/boleto?numeroInscricao=${numeroInscricao}&idps=${idps}` +
        `&pdf=1&idBoleto=${boleto.idBoleto}`
      : null;
  const urlBoletoFixo =
    boleto && boleto !== "carregando" ? boleto.urlBoletoFixo : null;
  const linhaDigitavel =
    boleto && boleto !== "carregando" ? boleto.linhaDigitavel : null;

  const urlContrato = contrato
    ? `/api/matricula/contrato?idAreaOfertada=${contrato.idAreaOfertada}` +
      `&codColigadaRelatorio=${contrato.codColigadaRelatorio}` +
      `&idRelatorio=${contrato.idRelatorio}` +
      `&numeroInscricao=${numeroInscricao}&idps=${idps}`
    : null;

  const dataFmt = resumo?.dataHora ? formatarDataHora(resumo.dataHora) : null;

  return (
    <div className="space-y-3 rounded-lg bg-emerald-50 px-3 py-3 ring-1 ring-inset ring-emerald-600/20">
      <div className="flex items-center gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-5 w-5 text-emerald-600"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
            clipRule="evenodd"
          />
        </svg>
        <p className="font-semibold text-emerald-800">Matrícula concluída</p>
      </div>

      <p className="whitespace-pre-line text-xs text-emerald-900/80">
        {resumo?.mensagem ??
          "A matrícula deste candidato foi registrada com sucesso."}
      </p>

      {(resumo?.planoDescricao || dataFmt) && (
        <ul className="space-y-0.5 text-xs text-emerald-900/80">
          {resumo?.planoDescricao && (
            <li>
              <strong className="text-emerald-900">Plano:</strong>{" "}
              {resumo.planoDescricao}
            </li>
          )}
          {dataFmt && (
            <li>
              <strong className="text-emerald-900">Concluída em:</strong>{" "}
              {dataFmt}
            </li>
          )}
        </ul>
      )}

      {boleto === "carregando" && (
        <p className="text-xs text-emerald-900/70">Verificando boleto…</p>
      )}

      {urlBoletoPdf && (
        <a
          href={urlBoletoPdf}
          target="_blank"
          rel="noopener noreferrer"
          className={botaoBoleto}
        >
          Baixar boleto da matrícula
        </a>
      )}

      {!urlBoletoPdf && urlBoletoFixo && (
        <a
          href={urlBoletoFixo}
          target="_blank"
          rel="noopener noreferrer"
          className={botaoBoleto}
        >
          Acessar boleto da matrícula
        </a>
      )}

      {linhaDigitavel && (
        <LinhaDigitavelBoleto linhaDigitavel={linhaDigitavel} />
      )}

      {urlContrato && (
        <a
          href={urlContrato}
          target="_blank"
          rel="noopener noreferrer"
          className={botaoContrato}
        >
          Baixar contrato da matrícula
        </a>
      )}
    </div>
  );
}
