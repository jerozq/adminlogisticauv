// ============================================================
// Tipos de dominio globales — puros, sin dependencias de Supabase.
// Representan conceptos del negocio logístico de la UV.
// ============================================================

// ---------------------------------------------------------------
// Fuente de financiación de una Actividad
// ---------------------------------------------------------------

/**
 * Mecanismo por el cual se fondea la actividad.
 * Determina el origen del capital operativo.
 */
export type FuenteFinanciacion =
  | 'Fondo Propio'      // Capital propio de los socios
  | 'Anticipo Unidad'   // Anticipo recibido de la unidad contratante
  | 'Crédito'           // Financiado mediante crédito externo

// ---------------------------------------------------------------
// Estados y transiciones de una Actividad
// ---------------------------------------------------------------

/** Estados del ciclo de vida de una Actividad / Requerimiento. */
export type EstadoActividad =
  | 'generado'      // Cotización creada, pendiente de aprobación de campo
  | 'en_ejecucion'  // En campo; permite registrar costos y entregas
  | 'liquidado'     // Cerrada; bloqueada para Cuenta de Cobro
  | 'aplazado'      // Postergada; puede retomar ejecución
  | 'cancelado'     // Cancelada definitivamente

/**
 * Mapa de transiciones válidas del dominio.
 * Cualquier cambio de estado que no esté aquí es ilegal.
 */
export const TRANSICIONES_VALIDAS: Record<EstadoActividad, EstadoActividad[]> = {
  generado:     ['en_ejecucion', 'cancelado'],
  en_ejecucion: ['aplazado', 'liquidado', 'cancelado'],
  aplazado:     ['en_ejecucion'],
  liquidado:    [],
  cancelado:    [],
}

// ---------------------------------------------------------------
// Partes / Pagadores
// ---------------------------------------------------------------

/**
 * Quién desembolsó un gasto operativo en campo.
 * Puede ser el UUID de un socio o 'pago_unidad' (fondos del proyecto/UV).
 */
export type Pagador = string

/** Modo de registro del costo. */
export type ModoRegistroCosto = 'por_item' | 'delegado'

// ---------------------------------------------------------------
// Entidades de soporte
// ---------------------------------------------------------------

export interface CostoReal {
  id: string
  actividadId: string
  itemId: string | null
  descripcion: string
  monto: number          // COP, entero positivo
  pagador: Pagador
  soporteUrl: string | null
  notas: string | null
  creadoEn: string       // ISO 8601
  /** Modo de registro: granular por_item o total delegado */
  modoRegistro: ModoRegistroCosto
  /** Número de unidades (solo cuando modoRegistro = 'por_item') */
  cantidad: number
  /** Precio por unidad (solo cuando modoRegistro = 'por_item') */
  precioUnitario: number | null
  /** Etiqueta de variación libre (ej: 'Almuerzo ejecutivo') */
  concepto: string | null
}

export interface EntregaHito {
  id: string
  actividadId: string
  descripcion: string
  fechaHoraLimite: string   // ISO 8601 timestamptz
  estado: 'pendiente' | 'listo'
  evidenciaUrl: string | null
  creadoEn: string
}

export interface ItemCotizado {
  id: string
  actividadId: string
  tarifarioId: string | null
  codigoItem: string
  descripcion: string
  categoria: string
  unidadMedida: string
  cantidad: number
  precioUnitario: number
  precioTotal: number
  esPassthrough: boolean    // El costo se traslada 1:1 sin margen
}

// ---------------------------------------------------------------
// Encabezado del Requerimiento (extraído del Excel)
// ---------------------------------------------------------------

export interface RequerimientoEncabezado {
  numeroRequerimiento: string
  nombreActividad: string
  objeto: string
  direccionTerritorial: string
  municipio: string
  departamento: string
  lugarDetalle: string
  fechaSolicitud: string   // YYYY-MM-DD
  fechaInicio: string      // YYYY-MM-DD
  fechaFin: string         // YYYY-MM-DD
  horaInicio: string       // HH:MM
  horaFin: string          // HH:MM
  responsableNombre: string
  responsableCedula: string
  responsableCelular: string
  responsableCorreo: string
  numVictimas: number
  montoReembolsoDeclarado: number   // COP
}

// ---------------------------------------------------------------
// Resultado del parseo del Excel (entrada del IExcelParser)
// ---------------------------------------------------------------

export interface ItemRequerimientoParsed {
  codigoItem: string
  descripcion: string
  categoria: string
  unidadMedida: string
  cantidad: number
  precioUnitarioSugerido: number
  esPassthrough: boolean
}

export interface ReembolsoBeneficiario {
  nombreBeneficiario: string
  documentoIdentidad: string
  municipioOrigen: string
  municipioDestino: string
  valorTransporte: number
  valorAlojamiento: number
  valorAlimentacion: number
  valorOtros: number
}

export interface HitoCronogramaSugerido {
  descripcion: string
  fechaHoraLimite: string  // ISO 8601
}

export interface RequerimientoParsed {
  encabezado: RequerimientoEncabezado
  items: ItemRequerimientoParsed[]
  reembolsos: ReembolsoBeneficiario[]
  cronogramaSugerido: HitoCronogramaSugerido[]
}

// ---------------------------------------------------------------
// Datos para generación de documentos (entrada del IDocumentGenerator)
// ---------------------------------------------------------------

export interface DatosCotizacionDocumento {
  encabezado: RequerimientoEncabezado
  items: ItemCotizado[]
  reembolsos: ReembolsoBeneficiario[]
  totalGeneral: number      // COP
  version: number
  fechaGeneracion: string   // ISO 8601
}

// ---------------------------------------------------------------
// Liquidación (salida del cálculo 50/50)
// ---------------------------------------------------------------

export interface ResumenLiquidacion {
  ingresoTotal: number
  gastosTotales: number
  pagadoJero: number
  pagadoSocio: number
  pagadoCaja: number
  utilidadNeta: number
  jeroRecibe: number         // compat: primer socio cuando hay exactamente 2
  socioRecibe: number        // compat: segundo socio cuando hay exactamente 2
}

/** Resultado de calcularDistribucion() para un socio individual. */
export interface DistribucionSocio {
  socioId: string
  nombreSocio: string
  porcentaje: number       // 0–100
  montoAportado: number    // capital devuelto
  porcionUtilidad: number  // utilidadNeta * (porcentaje / 100)
  totalRecibe: number      // montoAportado + porcionUtilidad
}

/**
 * Resultado del reparto de utilidades desde BalanceFinanciero.
 * Aplica la regla: primero capital, luego remanente por %.
 */
export interface DistribucionFinanciero {
  socioId: string
  nombreSocio: string
  porcentaje: number           // 0–100
  montoAportado: number        // capital que aportó originalmente
  devolucionCapital: number    // capital devuelto (puede ser menor si hay déficit)
  porcionRemanente: number     // parte del remanente tras devolver capital (puede ser negativa si hay pérdida)
  totalRecibe: number          // devolucionCapital + porcionRemanente
}

// ---------------------------------------------------------------
// Formularios de entrada (comandos del dominio)
// ---------------------------------------------------------------

/** Datos necesarios para registrar un nuevo gasto operativo. */
export interface NuevoCosto {
  itemId: string | null
  descripcion: string
  monto: number
  pagador: Pagador
  soporteUrl?: string
  notas?: string
  modoRegistro?: ModoRegistroCosto
  cantidad?: number
  precioUnitario?: number | null
  concepto?: string | null
}

/** Datos necesarios para crear un nuevo hito de cronograma. */
export interface NuevaEntrega {
  descripcion: string
  fechaHoraLimite: string   // ISO 8601
}

/** Datos para definir o actualizar la participación de un socio. */
export interface NuevaParticipacion {
  socioId: string
  nombreSocio: string
  porcentaje: number    // 0–100
  montoAportado: number // COP
}

/** Conjunto de participaciones a registrar en bloque para una actividad. */
export interface ConfiguracionParticipaciones {
  actividadId: string
  participaciones: NuevaParticipacion[]
}

// ---------------------------------------------------------------
// Vista resumida de Actividad (para Kanban y listados)
// ---------------------------------------------------------------

export interface ActividadResumen {
  id: string
  numeroRequerimiento: string | null
  nombreActividad: string
  municipio: string | null
  fechaInicio: string | null   // YYYY-MM-DD
  fechaFin: string | null      // YYYY-MM-DD
  horaInicio: string | null    // HH:MM
  estado: EstadoActividad
  totalEntregas: number
  entregasListas: number
  ingresoCotizado: number | null
}
