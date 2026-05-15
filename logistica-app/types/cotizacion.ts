// ============================================================
// Tipos del módulo de Cotizaciones / Requerimientos
// ============================================================

export type EstadoRequerimiento =
  | 'cargado'      // Excel cargado, solo lectura
  | 'generado'     // Cotización v1 creada, editable
  | 'en_ejecucion' // En campo; cambios generan v2
  | 'liquidado'    // Bloqueado para Cuenta de Cobro
  | 'aplazado'     // Actividad postergada
  | 'cancelado'    // Actividad cancelada definitivamente

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aprobada' | 'rechazada'

export type FuenteItem = 'tarifario' | 'manual' | 'excel'

// ---------------------------------------------------------------
// Encabezado extraído del Excel (FORMATO MATERIAL APOYO)
// ---------------------------------------------------------------
export interface RequerimientoEncabezado {
  numeroRequerimiento: string
  nombreActividad: string
  objeto: string
  direccionTerritorial: string
  municipio: string
  departamento: string
  lugarDetalle: string
  fechaSolicitud: string
  fechaInicio: string
  fechaFin: string
  horaInicio: string
  horaFin: string
  responsableNombre: string
  responsableCedula: string
  responsableCelular: string
  responsableCorreo: string
  numVictimas: number
  montoReembolsoDeclarado: number
}

// ---------------------------------------------------------------
// Ítem de cotización (draft antes de guardar)
// ---------------------------------------------------------------
export interface CotizacionItemDraft {
  id: string                // UUID local temporal (crypto.randomUUID)
  tarifarioId: string | null
  codigoItem: string
  descripcion: string
  categoria: string
  unidadMedida: string
  cantidad: number
  precioUnitario: number
  esPassthrough: boolean
  excluirDeFinanzas: boolean   // Ítems cobrados pero sin impacto en margen operativo
  ocultarEnCotizacion: boolean // Ítems internos que no van en la plantilla
  fuente: FuenteItem
  // Candidatos del tarifario para que el usuario elija (vacío = no hay pendientes)
  opcionesTarifario: TarifarioSugerencia[]
}

export interface TarifarioSugerencia {
  id: string
  codigoItem: string
  descripcion: string
  precioVenta: number
  unidadMedida: string
  categoria: string
}

// ---------------------------------------------------------------
// Reembolso por beneficiario (solo transporte e inhumación)
// ---------------------------------------------------------------
export interface ReembolsoDetalleDraft {
  id: string
  nombreBeneficiario: string
  documentoIdentidad: string
  celularBeneficiario: string | null
  municipioOrigen: string
  municipioDestino: string
  valorTransporte: number
  valorAlojamiento: number
  valorAlimentacion: number
  valorOtros: number
}

// ---------------------------------------------------------------
// Cronograma sugerido por IA (desde observaciones del requerimiento)
// ---------------------------------------------------------------
export interface CronogramaEntregaDraft {
  descripcion: string
  fechaHoraLimite: string // ISO datetime
}

// ---------------------------------------------------------------
// Resultado del parsing del Excel
// ---------------------------------------------------------------
export interface ParsedRequerimiento {
  encabezado: RequerimientoEncabezado
  items: CotizacionItemDraft[]
  reembolsos: ReembolsoDetalleDraft[]
  cronogramaSugerido: CronogramaEntregaDraft[]
}

// ---------------------------------------------------------------
// Rows de DB (para queries Supabase)
// ---------------------------------------------------------------
export interface RequerimientoRow {
  id: string
  numero_requerimiento: string | null
  nombre_actividad: string
  objeto: string | null
  direccion_territorial: string | null
  municipio: string | null
  departamento: string | null
  lugar_detalle: string | null
  fecha_solicitud: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  hora_inicio: string | null
  hora_fin: string | null
  responsable_nombre: string | null
  responsable_cedula: string | null
  responsable_celular: string | null
  responsable_correo: string | null
  num_victimas: number
  monto_reembolso_declarado: number | null
  archivo_origen_nombre: string | null
  estado: EstadoRequerimiento
  created_at: string
  updated_at: string
}

export interface CotizacionRow {
  id: string
  requerimiento_id: string
  version: number
  estado: EstadoCotizacion
  subtotal_servicios: number
  total_reembolsos: number
  total_general: number
  notas: string | null
  creado_por: string | null
  created_at: string
  updated_at: string
}

export interface CotizacionItemRow {
  id: string
  cotizacion_id: string
  tarifario_id: string | null
  codigo_item: string | null
  descripcion: string
  categoria: string | null
  unidad_medida: string | null
  cantidad: number
  precio_unitario: number
  precio_total: number
  es_passthrough: boolean
  excluir_de_finanzas: boolean
  ocultar_en_cotizacion: boolean
  fuente: FuenteItem
  editado_por: string | null
  editado_en: string | null
  created_at: string
}

export interface ReembolsoDetalleRow {
  id: string
  cotizacion_id: string
  nombre_beneficiario: string
  documento_identidad: string | null
  municipio_origen: string | null
  municipio_destino: string | null
  valor_transporte: number
  valor_alojamiento: number
  valor_alimentacion: number
  valor_otros: number
  total_reembolso: number
  notas: string | null
  created_at: string
}

// ---------------------------------------------------------------
// Estado del wizard de creación
// ---------------------------------------------------------------
export type WizardStep = 1 | 2 | 3 | 4

export interface WizardState {
  step: WizardStep
  file: File | null
  fileName: string
  parsed: ParsedRequerimiento | null
  items: CotizacionItemDraft[]
  reembolsos: ReembolsoDetalleDraft[]
  saving: boolean
  savedRequerimientoId: string | null
  savedCotizacionId: string | null
  error: string | null
}
