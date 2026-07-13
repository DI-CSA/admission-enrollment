// Documentos da MATRÍCULA que o CSA definiu como OBRIGATÓRIOS em acordo com a
// secretaria, ainda que NÃO estejam marcados como obrigatórios no RM
// (SPSDOCUMENTOEXIGIDO.OBRIGATORIO fica nulo). A obrigatoriedade é aplicada pelo
// nosso sistema (cliente + BFF), não pelo RM.
//
// A ordem abaixo é também a ordem de exibição: estes itens aparecem no TOPO do
// passo de documentos da matrícula, nesta sequência.
//
// Módulo client-safe (sem dependências de servidor): importado tanto pelo
// componente de UI quanto pela rota BFF.
export interface DocObrigatorioMatricula {
  /** CODDOCUMENTO no RM (SDOCUMENTO). */
  codDocumento: number;
  /** Rótulo de referência (a descrição exibida vem do RM). */
  rotulo: string;
}

export const DOCS_OBRIGATORIOS_MATRICULA: ReadonlyArray<DocObrigatorioMatricula> =
  [
    { codDocumento: 2, rotulo: "Foto do candidato" },
    { codDocumento: 4, rotulo: "CPF do candidato" },
    { codDocumento: 3, rotulo: "Certidão de nascimento" },
    { codDocumento: 16, rotulo: "Declaração de escolaridade" },
    { codDocumento: 29, rotulo: "CPF do responsável financeiro" },
    {
      codDocumento: 30,
      rotulo: "Identidade do responsável financeiro (RG ou CNH)",
    },
    {
      codDocumento: 38,
      rotulo: "Comprovante de residência do responsável financeiro",
    },
  ];

/** Códigos obrigatórios na ordem de exibição (topo da lista). */
export const CODS_DOCS_OBRIGATORIOS_MATRICULA: ReadonlyArray<number> =
  DOCS_OBRIGATORIOS_MATRICULA.map((d) => d.codDocumento);
