'use client'

import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'

// ============================================================
// Styles
// ============================================================
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    paddingTop: 22,
    paddingBottom: 22,
    paddingLeft: 28,
    paddingRight: 28,
    backgroundColor: '#ffffff',
  },
  // Header
  headerRow: { flexDirection: 'row', marginBottom: 6 },
  headerLogo: {
    width: 64,
    height: 44,
    border: '1pt solid #000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
  },
  headerLogoText: { fontSize: 6, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  headerTitle: {
    flex: 1,
    border: '1pt solid #000',
    borderLeft: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
  },
  headerTitleMain: { fontFamily: 'Helvetica-Bold', fontSize: 9.5, textAlign: 'center' },
  headerTitleSub: { fontSize: 6.5, textAlign: 'center', marginTop: 1 },
  headerMeta: {
    width: 130,
    border: '1pt solid #000',
    borderLeft: 'none',
    padding: 4,
    justifyContent: 'space-between',
  },
  metaRow: { flexDirection: 'row', marginBottom: 1 },
  metaLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, width: 60 },
  metaValue: { fontSize: 6, flex: 1 },
  // Info row
  infoGrid: { flexDirection: 'row', marginBottom: 4, gap: 3 },
  infoCell: {
    flex: 1,
    border: '0.5pt solid #000',
    padding: 3,
  },
  infoLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, marginBottom: 1 },
  infoValue: { fontSize: 7 },
  // Section
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    marginTop: 6,
    marginBottom: 3,
    backgroundColor: '#1c3664',
    color: '#ffffff',
    padding: '2 4',
  },
  // Tabla SI/NO/NA
  checkTable: { marginBottom: 4 },
  checkHeader: { flexDirection: 'row', backgroundColor: '#d9e1f2', borderBottom: '0.5pt solid #000' },
  checkRow: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc' },
  checkRowAlt: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc', backgroundColor: '#f5f8ff' },
  checkCriterio: { flex: 1, padding: '2 3', borderRight: '0.5pt solid #ccc' },
  checkBox: { width: 24, padding: '2 3', alignItems: 'center', borderRight: '0.5pt solid #ccc' },
  checkBoxLast: { width: 24, padding: '2 3', alignItems: 'center', borderRight: '0.5pt solid #ccc' },
  checkObs: { width: 120, padding: '2 3' },
  checkHeaderText: { fontFamily: 'Helvetica-Bold', fontSize: 6, textAlign: 'center' },
  checkBodyText: { fontSize: 6.5 },
  checkBodyCenter: { fontSize: 6.5, textAlign: 'center' },
  // Obs box
  obsLabel: { fontFamily: 'Helvetica-Bold', fontSize: 7, marginTop: 5, marginBottom: 2 },
  obsBox: { border: '0.5pt solid #000', minHeight: 28, padding: 4 },
  // Tabla beneficiarios
  benTable: { marginBottom: 4 },
  benHeader: { flexDirection: 'row', backgroundColor: '#1c3664' },
  benRow: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc' },
  benRowAlt: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc', backgroundColor: '#f0f4fa' },
  benNo: { width: 18, padding: 2, borderRight: '0.5pt solid #ccc' },
  benNombre: { flex: 2, padding: 2, borderRight: '0.5pt solid #ccc' },
  benDoc: { flex: 1, padding: 2, borderRight: '0.5pt solid #ccc' },
  benServicio: { flex: 2, padding: 2, borderRight: '0.5pt solid #ccc' },
  benValor: { width: 55, padding: 2, borderRight: '0.5pt solid #ccc' },
  benFirma: { flex: 1, padding: 2 },
  benHeaderText: { color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 5.5, textAlign: 'center' },
  benBodyText: { fontSize: 6, textAlign: 'center' },
  benBodyLeft: { fontSize: 6 },
  // Firmas
  footerRow: { flexDirection: 'row', marginTop: 10 },
  footerBlock: { flex: 1, borderTop: '0.5pt solid #000', paddingTop: 3, marginRight: 8 },
  footerBlockLast: { flex: 1, borderTop: '0.5pt solid #000', paddingTop: 3 },
  footerLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, textAlign: 'center' },
  footerSub: { fontSize: 5.5, textAlign: 'center', color: '#555' },
})

// ============================================================
// Helpers
// ============================================================

function fmt(v: string | null | undefined, fb = '') { return v ?? fb }

function fmtMoney(v: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v)
}

function fmtFecha(v: string | null | undefined) {
  if (!v) return ''
  try { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return v }
}

// ============================================================
// Criterios de satisfacción (Código 400.08.15-104)
// ============================================================

const CRITERIOS_ATENCION = [
  'La entrega se realizó en el horario convenido',
  'El operador explicó claramente el proceso antes de la entrega',
  'El lugar de atención fue adecuado y seguro',
  'Se respetó la privacidad durante la atención',
  'El personal trató a los beneficiarios con respeto y dignidad',
  'Se atendieron las necesidades especiales (adultos mayores, discapacidad, etc.)',
]

const CRITERIOS_ENTREGA = [
  'Los bienes/servicios entregados corresponden a la necesidad identificada',
  'La cantidad recibida coincide con lo acordado',
  'La calidad del bien o servicio recibido es satisfactoria',
  'La forma de entrega fue ordenada y sin contratiempos',
]

const CRITERIOS_INFO = [
  'Se le informó sobre los derechos que tiene como víctima',
  'Se le entregó o explicó la documentación requerida',
  'Sabe a quién acudir si tiene preguntas o inconformidades',
]

interface CheckRowData { criterio: string; si: boolean; no: boolean; na: boolean; obs: string }

function makeRows(criterios: string[]): CheckRowData[] {
  return criterios.map(criterio => ({ criterio, si: false, no: false, na: false, obs: '' }))
}

function CheckTableSection({ title, criterios }: { title: string; criterios: string[] }) {
  const rows = makeRows(criterios)
  return (
    <View style={s.checkTable}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.checkHeader}>
        <View style={s.checkCriterio}><Text style={s.checkHeaderText}>CRITERIO DE EVALUACIÓN</Text></View>
        <View style={s.checkBox}><Text style={s.checkHeaderText}>SÍ</Text></View>
        <View style={s.checkBoxLast}><Text style={s.checkHeaderText}>NO</Text></View>
        <View style={s.checkBoxLast}><Text style={s.checkHeaderText}>N.A.</Text></View>
        <View style={s.checkObs}><Text style={s.checkHeaderText}>OBSERVACIONES</Text></View>
      </View>
      {rows.map((row, i) => (
        <View key={i} style={i % 2 === 0 ? s.checkRow : s.checkRowAlt}>
          <View style={s.checkCriterio}><Text style={s.checkBodyText}>{row.criterio}</Text></View>
          <View style={s.checkBox}><Text style={s.checkBodyCenter}>☐</Text></View>
          <View style={s.checkBoxLast}><Text style={s.checkBodyCenter}>☐</Text></View>
          <View style={s.checkBoxLast}><Text style={s.checkBodyCenter}>☐</Text></View>
          <View style={s.checkObs}><Text style={s.checkBodyText}></Text></View>
        </View>
      ))}
    </View>
  )
}

// ============================================================
// Main Component
// ============================================================

interface Props {
  actividad: InformeActividad
  reembolsos: ReembolsoInforme[]
}

export function ReciboSatisfaccionPDF({ actividad, reembolsos }: Props) {
  const total = reembolsos.reduce((s, r) => s + (r.precio_total ?? 0), 0)
  const BLANK = 8

  const rows = Array.from({ length: Math.max(BLANK, reembolsos.length) }, (_, i) =>
    reembolsos[i] ?? null
  )

  return (
    <Document>
      <Page size="LETTER" style={s.page}>

        {/* ---- ENCABEZADO ---- */}
        <View style={s.headerRow}>
          <View style={s.headerLogo}>
            <Text style={s.headerLogoText}>UNIDAD PARA{'\n'}LAS VÍCTIMAS</Text>
          </View>
          <View style={s.headerTitle}>
            <Text style={s.headerTitleMain}>RECIBO DE SATISFACCIÓN</Text>
            <Text style={s.headerTitleSub}>
              ENTREGA DE ASISTENCIA HUMANITARIA A VÍCTIMAS DEL CONFLICTO ARMADO
            </Text>
            <Text style={s.headerTitleSub}>CONTRATO No 931 de 2025</Text>
          </View>
          <View style={s.headerMeta}>
            {[
              ['Código:', '400.08.15-104'],
              ['Versión:', '07'],
              ['Vigencia:', '12/06/2024'],
              ['Página:', '1 de 1'],
            ].map(([l, v]) => (
              <View key={l} style={s.metaRow}>
                <Text style={s.metaLabel}>{l}</Text>
                <Text style={s.metaValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ---- DATOS ACTIVIDAD ---- */}
        <View style={s.infoGrid}>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>No. REQUERIMIENTO</Text>
            <Text style={s.infoValue}>{fmt(actividad.numero_requerimiento)}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>ACTIVIDAD</Text>
            <Text style={s.infoValue}>{fmt(actividad.nombre_actividad)}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>FECHA</Text>
            <Text style={s.infoValue}>{fmtFecha(actividad.fecha_inicio)}</Text>
          </View>
          <View style={s.infoCell}>
            <Text style={s.infoLabel}>LUGAR</Text>
            <Text style={s.infoValue}>
              {[actividad.lugar_detalle, actividad.municipio, actividad.departamento].filter(Boolean).join(', ')}
            </Text>
          </View>
        </View>

        {/* ---- TABLA BENEFICIARIOS ---- */}
        <Text style={s.sectionTitle}>RELACIÓN DE BENEFICIARIOS Y SERVICIOS ENTREGADOS</Text>
        <View style={s.benTable}>
          <View style={s.benHeader}>
            <View style={s.benNo}><Text style={s.benHeaderText}>No.</Text></View>
            <View style={s.benNombre}><Text style={s.benHeaderText}>NOMBRE COMPLETO</Text></View>
            <View style={s.benDoc}><Text style={s.benHeaderText}>DOCUMENTO</Text></View>
            <View style={s.benServicio}><Text style={s.benHeaderText}>SERVICIO / DESCRIPCIÓN</Text></View>
            <View style={s.benValor}><Text style={s.benHeaderText}>VALOR $</Text></View>
            <View style={s.benFirma}><Text style={s.benHeaderText}>FIRMA / HUELLA</Text></View>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? s.benRow : s.benRowAlt}>
              <View style={s.benNo}><Text style={s.benBodyText}>{i + 1}</Text></View>
              <View style={s.benNombre}><Text style={s.benBodyLeft}>{r ? fmt(r.beneficiario_nombre) : ''}</Text></View>
              <View style={s.benDoc}><Text style={s.benBodyText}>{r ? fmt(r.beneficiario_documento) : ''}</Text></View>
              <View style={s.benServicio}><Text style={s.benBodyLeft}>{r ? fmt(r.descripcion) : ''}</Text></View>
              <View style={s.benValor}><Text style={s.benBodyText}>{r ? fmtMoney(r.precio_total) : ''}</Text></View>
              <View style={s.benFirma}><Text style={s.benBodyText}></Text></View>
            </View>
          ))}
          <View style={[s.benRow, { backgroundColor: '#e8edf5' }]}>
            <View style={{ flex: 4, alignItems: 'flex-end', paddingRight: 4, padding: 2 }}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5 }}>TOTAL ENTREGADO:</Text>
            </View>
            <View style={s.benValor}>
              <Text style={[s.benBodyText, { fontFamily: 'Helvetica-Bold' }]}>{fmtMoney(total)}</Text>
            </View>
            <View style={s.benFirma}></View>
          </View>
        </View>

        {/* ---- CRITERIOS ---- */}
        <CheckTableSection title="I. CALIDAD DE LA ATENCIÓN" criterios={CRITERIOS_ATENCION} />
        <CheckTableSection title="II. CALIDAD DE LA ENTREGA" criterios={CRITERIOS_ENTREGA} />
        <CheckTableSection title="III. INFORMACIÓN Y ORIENTACIÓN" criterios={CRITERIOS_INFO} />

        {/* ---- OBSERVACIONES GENERALES ---- */}
        <Text style={s.obsLabel}>OBSERVACIONES GENERALES:</Text>
        <View style={s.obsBox}><Text style={{ fontSize: 6 }}></Text></View>

        {/* ---- FIRMAS ---- */}
        <View style={s.footerRow}>
          <View style={s.footerBlock}>
            <Text style={s.footerLabel}>OPERADOR CONTRATISTA</Text>
            <Text style={s.footerSub}>Nombre y Firma / Sello</Text>
          </View>
          <View style={s.footerBlock}>
            <Text style={s.footerLabel}>SUPERVISOR UARIV</Text>
            <Text style={s.footerSub}>Nombre y Firma</Text>
          </View>
          <View style={s.footerBlockLast}>
            <Text style={s.footerLabel}>RESPONSABLE DE ACTIVIDAD</Text>
            <Text style={s.footerSub}>{fmt(actividad.responsable_nombre, 'Nombre y Firma')}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
