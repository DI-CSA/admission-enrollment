// Flags de EXIBIÇÃO da matrícula, configuráveis por variável de ambiente.
//
// Enquanto os valores das mensalidades não são divulgados e a minuta do contrato
// de cada processo seletivo não é cadastrada no RM, estas flags permitem ocultar
// os detalhes do plano de pagamento e a minuta do contrato. Assim que tudo
// estiver disponível, basta setar as variáveis para ativar a exibição.
//
// São `NEXT_PUBLIC_*` (embutidas no bundle NO BUILD): mudar exige rebuild, não
// basta reiniciar. Default = ATIVO (true) quando a variável não está definida,
// para o sistema seguir testável durante a homologação. Só desativa com "false".
//
// Módulo client-safe (sem dependências de servidor).

/** Exibe os detalhes/valores do plano de pagamento no wizard de matrícula. */
export const MATRICULA_EXIBIR_PLANO_PAGAMENTO =
  process.env.NEXT_PUBLIC_MATRICULA_EXIBIR_PLANO_PAGAMENTO !== "false";

/**
 * Exibe a minuta do contrato (PDF/texto) no passo de contrato da matrícula.
 * Default = DESLIGADO: só exibe a minuta quando a variável for exatamente
 * "true". Enquanto desligada, o passo mostra apenas o aviso previsto no Edital.
 */
export const MATRICULA_EXIBIR_MINUTA_CONTRATO =
  process.env.NEXT_PUBLIC_MATRICULA_EXIBIR_MINUTA_CONTRATO === "true";

/**
 * Exibe os painéis de DEPURAÇÃO na interface da matrícula (papel do passo,
 * registros do formulário e resposta crua da WebAPI no último erro).
 *
 * Ao contrário das flags de exibição acima, o default aqui é DESLIGADO: só
 * mostra quando a variável for exatamente "true". Assim o servidor de produção
 * (cujo build não injeta esta variável) fica seguro por padrão. Os arquivos
 * `.env` locais setam `=true` para manter o debug ligado em desenvolvimento.
 */
export const MATRICULA_DEBUG =
  process.env.NEXT_PUBLIC_MATRICULA_DEBUG === "true";
