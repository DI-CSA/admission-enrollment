export function eventIdInscricao(idps: number, numeroInscricao: number): string {
  return `inscricao-${idps}-${numeroInscricao}`;
}

export function eventIdMatricula(idps: number, numeroInscricao: number): string {
  return `matricula-${idps}-${numeroInscricao}`;
}

export function eventIdVisita(id: string): string {
  return `visita-${id}`;
}

