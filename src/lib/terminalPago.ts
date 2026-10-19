export interface TerminalOrder {
  id: string
  status: string
  status_detail?: string
  transactions?: {
    payments?: Array<{ status?: string; status_detail?: string }>
  }
}

export const ESTADOS_ESPERA = ['iniciando', 'created', 'at_terminal']
// 'failed' es lo que regresa Mercado Pago cuando la tarjeta es rechazada (ej. fondos insuficientes)
export const ESTADOS_FALLO = ['canceled', 'expired', 'rejected', 'failed']

const MOTIVOS_RECHAZO: Record<string, string> = {
  insufficient_amount: 'Fondos insuficientes en la tarjeta.',
  required_call_for_authorize: 'El banco requiere autorización. El cliente debe llamar a su banco o usar otra tarjeta.',
  rejected_by_issuer: 'El banco emisor rechazó la tarjeta.',
  rejected_by_bank: 'El banco rechazó la tarjeta.',
  card_disabled: 'La tarjeta está deshabilitada.',
  invalid_card: 'La tarjeta no es válida.',
  expired_card: 'La tarjeta está vencida.',
  bad_filled_security_code: 'El código de seguridad es incorrecto.',
  bad_filled_card_data: 'Los datos de la tarjeta son incorrectos.',
  max_attempts_exceeded: 'Se superó el número de intentos permitidos.',
  high_risk: 'El pago fue rechazado por seguridad.',
  duplicated_payment: 'Pago duplicado. Verifica si ya se cobró.',
}

export function getMotivoFallo(order: TerminalOrder | null, status: string): string {
  const detalle = order?.transactions?.payments?.[0]?.status_detail
  if (detalle && MOTIVOS_RECHAZO[detalle]) return MOTIVOS_RECHAZO[detalle]
  if (status === 'expired') return 'El cobro expiró en la terminal sin completarse.'
  if (status === 'canceled') return 'El cobro fue cancelado en la terminal.'
  if (status === 'failed' || status === 'rejected') return 'La tarjeta fue rechazada.'
  return 'El cobro no se completó.'
}
