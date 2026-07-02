import "server-only";

// Rate limiter simples em memória (janela deslizante por chave). Suficiente para
// 1 instância (a plataforma roda como Node único). Para múltiplas instâncias,
// trocar por um store compartilhado (Redis/Memorystore).

interface Registro {
  contagem: number;
  reiniciaEm: number;
}

const baldes = new Map<string, Registro>();

export interface ResultadoRateLimit {
  permitido: boolean;
  restante: number;
  reiniciaEm: number;
}

/**
 * Consome 1 unidade da cota de `chave`. Permite até `limite` requisições por
 * `janelaMs`. Limpa janelas expiradas no acesso.
 */
export function consumir(
  chave: string,
  limite: number,
  janelaMs: number,
): ResultadoRateLimit {
  const agora = Date.now();
  const atual = baldes.get(chave);

  if (!atual || atual.reiniciaEm <= agora) {
    const reiniciaEm = agora + janelaMs;
    baldes.set(chave, { contagem: 1, reiniciaEm });
    return { permitido: true, restante: limite - 1, reiniciaEm };
  }

  if (atual.contagem >= limite) {
    return { permitido: false, restante: 0, reiniciaEm: atual.reiniciaEm };
  }

  atual.contagem += 1;
  return {
    permitido: true,
    restante: limite - atual.contagem,
    reiniciaEm: atual.reiniciaEm,
  };
}
