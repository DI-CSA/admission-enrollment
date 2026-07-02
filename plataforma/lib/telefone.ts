// Utilitários de telefone/celular brasileiros (cliente e servidor): máscara de
// digitação e extração de dígitos. Sem dependências.

/** Mantém apenas os dígitos do valor informado. */
export function apenasDigitos(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

/**
 * Formata progressivamente para telefone brasileiro com DDD, aceitando fixo
 * (10 dígitos) e celular (11 dígitos):
 *   (21) 3206-7850   |   (21) 99876-5432
 * Aceita entrada parcial (mascara conforme o usuário digita).
 */
export function formatarTelefone(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  if (d.length === 0) return "";
  let out = "(" + d.slice(0, 2);
  if (d.length < 3) return out;
  out += ") ";
  if (d.length <= 6) {
    return out + d.slice(2);
  }
  if (d.length <= 10) {
    // fixo: 4 + 4
    return out + d.slice(2, 6) + "-" + d.slice(6, 10);
  }
  // celular: 5 + 4
  return out + d.slice(2, 7) + "-" + d.slice(7, 11);
}

/** Telefone válido = 10 (fixo) ou 11 (celular) dígitos com DDD. */
export function telefoneValido(valor: string): boolean {
  const n = apenasDigitos(valor).length;
  return n === 10 || n === 11;
}
