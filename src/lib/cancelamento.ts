// Cálculo de cancelamento — espelha a planilha "Cálculo Cancelamento.xlsx".

export interface AreaContrato {
  area: string
  valor: number
  parcelamento: number
  parcelasPagas: number
  sessoesRealizadas: number
}

export interface LinhaCancelamento extends AreaContrato {
  sessoesConsideradas: number
  multa: number
  totalPago: number
  saldoUtilizado: number
  saldoDevido: number // positivo: cliente paga; negativo: devolver ao cliente
}

export interface ResultadoCancelamento {
  linhas: LinhaCancelamento[]
  compraTotal: number
  saldoUtilizado: number
  multa: number
  totalPago: number
  saldoDevido: number
}

export function calcularCancelamento(areas: AreaContrato[], sessoesCalculo: number, multaPct: number): ResultadoCancelamento {
  const n = sessoesCalculo > 0 ? sessoesCalculo : 1
  const linhas = areas.map((a) => {
    // a planilha limita as sessões realizadas ao nº de sessões do cálculo
    const sessoesConsideradas = Math.min(Math.max(a.sessoesRealizadas, 0), n)
    const valorSessao = a.valor / n
    const multa = (n - sessoesConsideradas) * valorSessao * multaPct
    const totalPago = a.parcelamento > 0 ? (a.valor / a.parcelamento) * a.parcelasPagas : 0
    const saldoUtilizado = valorSessao * sessoesConsideradas
    const saldoDevido = a.valor > 0 ? saldoUtilizado + multa - totalPago : 0
    return { ...a, sessoesConsideradas, multa, totalPago, saldoUtilizado, saldoDevido }
  })
  const soma = (f: (l: LinhaCancelamento) => number) => linhas.reduce((s, l) => s + f(l), 0)
  return {
    linhas,
    compraTotal: soma((l) => l.valor),
    saldoUtilizado: soma((l) => l.saldoUtilizado),
    multa: soma((l) => l.multa),
    totalPago: soma((l) => l.totalPago),
    saldoDevido: soma((l) => l.saldoDevido),
  }
}
