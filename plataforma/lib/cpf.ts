// Utilitários de CPF compartilhados (cliente e servidor): máscara de digitação,
// extração de dígitos e validação dos dígitos verificadores. Sem dependências.

/** Mantém apenas os dígitos do valor informado. */
export function apenasDigitos(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

/**
 * Formata progressivamente para 000.000.000-00, facilitando a digitação.
 * Aceita entrada parcial (mascara conforme o usuário digita).
 */
export function formatarCpf(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  let out = d.slice(0, 3);
  if (d.length >= 4) out += "." + d.slice(3, 6);
  if (d.length >= 7) out += "." + d.slice(6, 9);
  if (d.length >= 10) out += "-" + d.slice(9, 11);
  return out;
}

/** Valida o CPF pelos dígitos verificadores (rejeita sequências repetidas). */
export function cpfValido(valor: string): boolean {
  const d = apenasDigitos(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(d[9])) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(d[10]);
}
