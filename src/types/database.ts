// ─── Enums ────────────────────────────────────────────────────────────────────

export type EstadoUsuario = 'ACTIVO' | 'INACTIVO'
export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE'
export type EstadoVenta = 'PAGADA' | 'CANCELADA'
export type EstadoCaja = 'ABIERTA' | 'CERRADA'
export type EstadoCredito = 'PENDIENTE' | 'ABONANDO' | 'PAGADO' | 'VENCIDO' | 'CANCELADO'

// ─── Tablas ───────────────────────────────────────────────────────────────────

export interface Rol {
  id: number
  nombre: string
  descripcion?: string | null
  creado_en: string
}

export interface Usuario {
  id: number
  rol_id: number
  nombre: string
  usuario: string
  password_hash: string
  telefono?: string | null
  email?: string | null
  estado: EstadoUsuario
  creado_en: string
}

export interface Categoria {
  id: number
  nombre: string
  descripcion?: string | null
  creado_en: string
}

export interface Proveedor {
  id: number
  nombre: string
  telefono?: string | null
  email?: string | null
  direccion?: string | null
  activo: boolean
  creado_en: string
}

export interface UnidadMedida {
  id: number
  nombre: string
  abreviatura: string
}

export interface Producto {
  id: number
  categoria_id?: number | null
  proveedor_id?: number | null
  unidad_medida_id?: number | null
  codigo_barras?: string | null
  sku?: string | null
  nombre: string
  descripcion?: string | null
  costo_actual: number
  precio_actual: number
  stock_minimo: number
  activo: boolean
  creado_en: string
  actualizado_en?: string | null
}

export interface ProductoPrecio {
  id: number
  producto_id: number
  usuario_id: number
  precio_venta: number
  costo?: number | null
  vigente_desde: string
  vigente_hasta?: string | null
  observacion?: string | null
}

export interface InventarioMovimiento {
  id: number
  producto_id: number
  usuario_id: number
  tipo: TipoMovimiento
  cantidad: number
  costo_unitario?: number | null
  referencia_tipo?: string | null
  referencia_id?: number | null
  observacion?: string | null
  fecha_movimiento: string
}

export interface MetodoPago {
  id: number
  nombre: string
}

export interface CajaSesion {
  id: number
  empleado_apertura_id: number
  empleado_cierre_id?: number | null
  fecha_apertura: string
  fecha_cierre?: string | null
  monto_apertura: number
  estado: EstadoCaja
  observacion?: string | null
}

export interface Venta {
  id: number
  caja_sesion_id?: number | null
  usuario_id: number
  folio: string
  fecha_venta: string
  subtotal: number
  descuento: number
  impuesto: number
  total: number
  estado: EstadoVenta
  observacion?: string | null
}

export interface VentaDetalle {
  id: number
  venta_id: number
  producto_id: number
  cantidad: number
  precio_unitario: number
  descuento: number
  subtotal: number
  costo_unitario?: number | null
}

export interface VentaPago {
  id: number
  venta_id: number
  metodo_pago_id: number
  monto: number
  referencia?: string | null
  creado_en: string
}

export interface CorteCaja {
  id: number
  caja_sesion_id: number
  usuario_id: number
  fecha_corte: string
  total_ventas: number
  total_efectivo: number
  total_tarjeta: number
  total_entradas: number
  total_salidas: number
  efectivo_esperado: number
  efectivo_contado: number
  diferencia: number
  observacion?: string | null
}

export interface Cliente {
  id: number
  nombre: string
  telefono?: string | null
  direccion?: string | null
  limite_credito?: number | null
  activo?: boolean | null
  creado_en?: string | null
}

export interface CreditoVenta {
  id: number
  venta_id: number
  cliente_id: number
  usuario_id: number
  fecha_credito: string
  fecha_vencimiento?: string | null
  total_credito: number
  saldo_pendiente: number
  estado?: EstadoCredito | null
  observaciones?: string | null
}

export interface AbonoCredito {
  id: number
  credito_id: number
  usuario_id: number
  monto: number
  fecha_abono: string
  metodo_pago_id?: number | null
  observacion?: string | null
}
