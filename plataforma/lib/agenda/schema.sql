-- Agendador de visitas — CONTRATO das tabelas no banco compartilhado `csa`,
-- schema `agos` (o mesmo da plataforma AGOS).
--
-- Propriedade: em PRODUÇÃO estas tabelas pertencem à AGOS (que fará a administração
-- de horários/presença). Este arquivo serve para:
--   1) subir um banco de DEV em localhost:6510 e testar o portal de agendamento;
--   2) documentar o contrato que a AGOS deve seguir (nomes de tabela/coluna).
-- NÃO rodar em produção depois que a AGOS assumir o schema.
--
-- Idempotente: pode rodar mais de uma vez (CREATE ... IF NOT EXISTS).

CREATE SCHEMA IF NOT EXISTS agos;
SET search_path TO agos, public;

-- pgcrypto fornece gen_random_uuid(). No Cloud SQL basta habilitar a extensão.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Tipos de agendamento (geridos pelo SYSOP na AGOS). `publico` controla se os
-- horários desse tipo aparecem no portal público.
CREATE TABLE IF NOT EXISTS visita_tipo (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                        text NOT NULL UNIQUE,
  descricao                   text,
  publico                     boolean NOT NULL DEFAULT true,
  acompanhamento_coordenacao  boolean NOT NULL DEFAULT false,
  ativo                       boolean NOT NULL DEFAULT true,
  criado_em                   timestamptz NOT NULL DEFAULT now(),
  atualizado_em               timestamptz NOT NULL DEFAULT now()
);

-- Disponibilidade definida pela AGOS: cada slot é um horário com capacidade.
CREATE TABLE IF NOT EXISTS visita_slot (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio      timestamptz NOT NULL,
  fim         timestamptz NOT NULL,
  capacidade  integer NOT NULL DEFAULT 1 CHECK (capacidade > 0),
  local       text,
  ativo       boolean NOT NULL DEFAULT true,
  tipo_id     uuid REFERENCES visita_tipo (id),
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visita_slot_inicio ON visita_slot (inicio);
CREATE INDEX IF NOT EXISTS idx_visita_slot_tipo ON visita_slot (tipo_id);

-- Reservas feitas pelo público neste portal (não vão para o TOTVS).
CREATE TABLE IF NOT EXISTS visita_agendamento (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id            uuid NOT NULL REFERENCES visita_slot (id),
  nome               text NOT NULL,
  email              text NOT NULL,
  telefone           text,
  segmento           text,
  qtd_pessoas        integer NOT NULL DEFAULT 1 CHECK (qtd_pessoas > 0),
  status             text NOT NULL DEFAULT 'agendada'
                       CHECK (status IN ('agendada','confirmada','realizada','cancelada','no_show')),
  consentimento_mkt  boolean NOT NULL DEFAULT false,
  -- atribuição de origem (RD/Meta/Google)
  client_tracking_id text,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  gclid              text,
  -- canal do contato e operador (default = portal/Sistema de inscrições; a AGOS
  -- sobrescreve em agendamentos criados manualmente por telefone/e-mail/etc.)
  origem_contato     text NOT NULL DEFAULT 'portal',
  operador           text NOT NULL DEFAULT 'Sistema de inscrições',
  -- controle operacional
  cancel_token       text NOT NULL UNIQUE,
  mkt_sincronizado   timestamptz,          -- quando os eventos de funil foram disparados
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visita_agendamento_slot ON visita_agendamento (slot_id);

-- Um mesmo e-mail não agenda o mesmo slot duas vezes (ignora cancelados).
CREATE UNIQUE INDEX IF NOT EXISTS uq_visita_slot_email_ativo
  ON visita_agendamento (slot_id, lower(email))
  WHERE status <> 'cancelada';

-- Participantes da visita, identificados por papel (fidelidade à planilha da
-- secretaria). `serie` só se aplica ao candidato. qtd_pessoas no agendamento é
-- mantido em sincronia (= nº de participantes) para o controle de capacidade.
CREATE TABLE IF NOT EXISTS visita_participante (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL REFERENCES visita_agendamento (id) ON DELETE CASCADE,
  nome           text NOT NULL,
  papel          text NOT NULL CHECK (papel IN ('pai','mae','responsavel','candidato')),
  serie          text,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_visita_participante_ag ON visita_participante (agendamento_id);
