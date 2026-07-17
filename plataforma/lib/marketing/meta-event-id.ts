export function eventIdInscricao(idps: number, numeroInscricao: number): string {
  return `inscricao-${idps}-${numeroInscricao}`;
}

export function eventIdMatricula(idps: number, numeroInscricao: number): string {
  return `matricula-${idps}-${numeroInscricao}`;
}

