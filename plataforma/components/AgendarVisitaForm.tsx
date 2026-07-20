"use client";

import { useEffect, useState } from "react";
import { formatarTelefone, telefoneValido } from "@/lib/telefone";
import { rastrearEventoMeta } from "@/lib/marketing/meta-client";

interface Slot {
  id: string;
  inicio: string;
  fim: string;
  local: string | null;
  vagasRestantes: number;
}

interface Confirmacao {
  id: string;
  cancelToken: string;
  inicio: string;
  fim: string;
  local: string | null;
  eventId: string;
}

const SEGMENTOS = [
  "Ensino Fundamental — Anos Iniciais",
  "Ensino Fundamental — Anos Finais",
  "Ensino Médio",
];

type Papel = "pai" | "mae" | "responsavel" | "candidato";
const PAPEL_LABEL: Record<Papel, string> = {
  pai: "Pai",
  mae: "Mãe",
  responsavel: "Responsável",
  candidato: "Candidato(a)",
};
interface Participante {
  papel: Papel;
  nome: string;
  serie: string;
}

// Persiste click-ids/UTM da URL em cookies de 1ª parte, para o BFF (extrairOrigem)
// recuperá-los no POST (que não carrega a query da landing).
function persistirOrigem() {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  const um_ano = 60 * 60 * 24 * 365;
  for (const chave of [
    "gclid",
    "wbraid",
    "gbraid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
  ]) {
    const v = q.get(chave);
    if (v) document.cookie = `${chave}=${encodeURIComponent(v)}; Path=/; Max-Age=${um_ano}; SameSite=Lax`;
  }
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AgendarVisitaForm() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [slotId, setSlotId] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [segmento, setSegmento] = useState("");
  const [participantes, setParticipantes] = useState<Participante[]>([
    { papel: "candidato", nome: "", serie: "" },
  ]);
  const [consentimento, setConsentimento] = useState(true);

  function atualizarParticipante(i: number, campo: keyof Participante, valor: string) {
    setParticipantes((lista) =>
      lista.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)),
    );
  }
  function adicionarParticipante() {
    setParticipantes((lista) =>
      lista.length >= 10 ? lista : [...lista, { papel: "responsavel", nome: "", serie: "" }],
    );
  }
  function removerParticipante(i: number) {
    setParticipantes((lista) => (lista.length <= 1 ? lista : lista.filter((_, idx) => idx !== i)));
  }
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);

  useEffect(() => {
    persistirOrigem();
    fetch("/api/visitas/slots")
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setCarregando(false));
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    // Todos os campos são obrigatórios.
    if (!slotId) {
      setErro("Escolha um horário.");
      return;
    }
    if (!nome.trim() || !email.trim()) {
      setErro("Preencha nome e e-mail do responsável.");
      return;
    }
    if (!telefone.trim() || !telefoneValido(telefone)) {
      setErro("Informe um telefone válido (com DDD).");
      return;
    }
    if (!segmento) {
      setErro("Selecione o segmento de interesse.");
      return;
    }
    const pessoas = participantes.map((p) => ({
      ...p,
      nome: p.nome.trim(),
      serie: p.serie.trim(),
    }));
    if (pessoas.some((p) => !p.nome)) {
      setErro("Preencha o nome de todas as pessoas que vão comparecer.");
      return;
    }
    if (pessoas.some((p) => p.papel === "candidato" && !p.serie)) {
      setErro("Informe a série de cada candidato(a).");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/visitas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          nome,
          email,
          telefone,
          segmento: segmento || null,
          participantes: pessoas.map((p) => ({
            nome: p.nome,
            papel: p.papel,
            serie: p.papel === "candidato" ? p.serie || null : null,
          })),
          consentimentoMkt: consentimento,
        }),
      });
      const dados = await res.json();
      if (!res.ok) {
        const msgs: Record<string, string> = {
          "slot-lotado": "Este horário acabou de lotar. Escolha outro, por favor.",
          "ja-agendado": "Você já tem uma visita marcada para este horário.",
          "dados-invalidos": "Preencha todos os campos obrigatórios.",
          "telefone-invalido": "Telefone inválido (informe com DDD).",
          "participantes-obrigatorios": "Informe quem vai comparecer.",
          "serie-obrigatoria": "Informe a série de cada candidato(a).",
          "muitas-tentativas": "Muitas tentativas. Aguarde um instante.",
          indisponivel: "Agendamento indisponível no momento.",
        };
        setErro(msgs[dados?.erro] ?? "Não foi possível concluir o agendamento.");
        // recarrega slots (o escolhido pode ter lotado)
        fetch("/api/visitas/slots")
          .then((r) => r.json())
          .then((d) => setSlots(d.slots ?? []));
        return;
      }
      setConfirmacao(dados);
      // Deduplicação browser × servidor pelo mesmo event_id (se o Pixel carregou).
      if (consentimento) {
        rastrearEventoMeta(
          "Schedule",
          { content_name: "Visita ao CSA", content_category: "visita" },
          dados.eventId,
        );
      }
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  if (confirmacao) {
    const linkCancelar = `/api/visitas/${confirmacao.id}?token=${confirmacao.cancelToken}`;
    return (
      <div className="rounded-3xl bg-white p-8 shadow-xl">
        <h2 className="font-display text-2xl font-bold text-csa-navy">
          Visita agendada! 🎉
        </h2>
        <p className="mt-3 text-grafite">
          Sua visita está marcada para{" "}
          <strong>{formatarData(confirmacao.inicio)}</strong>
          {confirmacao.local ? ` — ${confirmacao.local}` : ""}. Você receberá a
          confirmação por e-mail.
        </p>
        <p className="mt-4 text-sm text-cinza-suave">
          Precisa cancelar?{" "}
          <button
            type="button"
            className="font-medium text-csa-azul underline"
            onClick={async () => {
              await fetch(linkCancelar, { method: "DELETE" });
              setConfirmacao(null);
              setSlotId("");
              fetch("/api/visitas/slots")
                .then((r) => r.json())
                .then((d) => setSlots(d.slots ?? []));
            }}
          >
            Cancelar esta visita
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="rounded-3xl bg-white p-6 shadow-xl sm:p-8">
      <h2 className="font-display text-2xl font-bold text-csa-navy">
        Agende sua visita
      </h2>
      <p className="mt-2 text-sm text-cinza-suave">
        Escolha um horário disponível e conheça o Colégio Santo Agostinho — Leblon.
      </p>

      {carregando ? (
        <p className="mt-6 text-cinza-suave">Carregando horários…</p>
      ) : slots.length === 0 ? (
        <p className="mt-6 rounded-xl bg-areia p-4 text-grafite">
          Não há horários disponíveis no momento. Tente novamente em breve.
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="block text-sm font-semibold text-grafite">
              Horário da visita
            </span>
            <select
              required
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 p-3"
            >
              <option value="">Selecione um horário…</option>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatarData(s.inicio)}
                  {s.local ? ` — ${s.local}` : ""} ({s.vagasRestantes} vaga
                  {s.vagasRestantes > 1 ? "s" : ""})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-sm font-semibold text-grafite">
              Nome do responsável
            </span>
            <input
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 p-3"
              placeholder="Seu nome completo"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="block text-sm font-semibold text-grafite">
                E-mail
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/15 p-3"
                placeholder="voce@email.com"
              />
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-grafite">
                Telefone
              </span>
              <input
                required
                inputMode="tel"
                value={telefone}
                onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
                className="mt-1 w-full rounded-xl border border-black/15 p-3"
                placeholder="(21) 99876-5432"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-semibold text-grafite">
              Segmento de interesse
            </span>
            <select
              required
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/15 p-3"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {SEGMENTOS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-2">
            <span className="block text-sm font-semibold text-grafite">
              Quem vai comparecer?
            </span>
            <p className="text-xs text-cinza-suave">
              Identifique cada pessoa (pai, mãe, responsável ou candidato).
            </p>
            {participantes.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={p.papel}
                  onChange={(e) => atualizarParticipante(i, "papel", e.target.value)}
                  className="rounded-xl border border-black/15 p-2 text-sm"
                >
                  {(Object.keys(PAPEL_LABEL) as Papel[]).map((papel) => (
                    <option key={papel} value={papel}>
                      {PAPEL_LABEL[papel]}
                    </option>
                  ))}
                </select>
                <input
                  value={p.nome}
                  onChange={(e) => atualizarParticipante(i, "nome", e.target.value)}
                  placeholder="Nome"
                  className="min-w-32 flex-1 rounded-xl border border-black/15 p-2 text-sm"
                />
                {p.papel === "candidato" && (
                  <input
                    value={p.serie}
                    onChange={(e) => atualizarParticipante(i, "serie", e.target.value)}
                    placeholder="Série (ex.: 1º ano)"
                    className="w-32 rounded-xl border border-black/15 p-2 text-sm"
                  />
                )}
                {participantes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerParticipante(i)}
                    className="rounded-lg px-2 py-1 text-sm text-csa-vermelho hover:bg-csa-vermelho/10"
                    aria-label="Remover pessoa"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {participantes.length < 10 && (
              <button
                type="button"
                onClick={adicionarParticipante}
                className="text-sm font-medium text-csa-azul underline"
              >
                + Adicionar pessoa
              </button>
            )}
          </div>

          <label className="flex items-start gap-3 text-sm text-cinza-suave">
            <input
              type="checkbox"
              checked={consentimento}
              onChange={(e) => setConsentimento(e.target.checked)}
              className="mt-1 h-4 w-4 accent-csa-azul"
            />
            <span>
              Autorizo o contato do Colégio Santo Agostinho sobre esta visita e o
              processo de admissão, conforme o{" "}
              <a href="/privacidade" className="text-csa-azul underline">
                Aviso de Privacidade
              </a>
              .
            </span>
          </label>

          {erro ? (
            <p className="rounded-xl bg-csa-vermelho/10 p-3 text-sm text-csa-vermelho">
              {erro}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={enviando || !slotId}
            className="w-full rounded-xl bg-csa-navy px-4 py-3 font-semibold text-white hover:bg-csa-azul disabled:opacity-50"
          >
            {enviando ? "Agendando…" : "Confirmar visita"}
          </button>
        </div>
      )}
    </form>
  );
}
