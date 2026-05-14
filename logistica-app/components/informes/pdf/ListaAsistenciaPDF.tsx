'use client'

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import type { InformeActividad, ReembolsoInforme } from '@/actions/informes'

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 20,
    paddingRight: 20,
    backgroundColor: '#ffffff',
  },
  // Header
  headerRow: { flexDirection: 'row', marginBottom: 4 },
  headerLogo: {
    width: 60,
    height: 40,
    border: '1pt solid #000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  headerLogoText: { fontSize: 6, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  headerTitle: {
    flex: 1,
    border: '1pt solid #000',
    borderLeft: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  headerTitleText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    textAlign: 'center',
  },
  headerMeta: {
    width: 120,
    border: '1pt solid #000',
    borderLeft: 'none',
    padding: 3,
    justifyContent: 'space-around',
  },
  headerMetaRow: { flexDirection: 'row', marginBottom: 1 },
  headerMetaLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, width: 55 },
  headerMetaValue: { fontSize: 6, flex: 1 },
  // Section label
  sectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    marginTop: 4,
    marginBottom: 2,
  },
  // Info grid
  infoRow: { flexDirection: 'row', marginBottom: 3 },
  infoBlock: {
    flex: 1,
    border: '0.5pt solid #000',
    padding: 3,
    marginRight: 3,
  },
  infoBlockLast: {
    flex: 1,
    border: '0.5pt solid #000',
    padding: 3,
  },
  infoLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, marginBottom: 1 },
  infoValue: { fontSize: 7 },
  // Table
  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1c3664' },
  tableRow: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc' },
  tableRowAlt: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc', backgroundColor: '#f0f4fa' },
  // Cell widths (total ≈ 555pt in landscape)
  cellNo: { width: 18, padding: 2, borderRight: '0.5pt solid #000' },
  cellNombre: { width: 90, padding: 2, borderRight: '0.5pt solid #000' },
  cellDoc: { width: 55, padding: 2, borderRight: '0.5pt solid #000' },
  cellFecha: { width: 38, padding: 2, borderRight: '0.5pt solid #000' },
  cellSexo: { width: 22, padding: 2, borderRight: '0.5pt solid #000' },
  cellEtnia: { width: 40, padding: 2, borderRight: '0.5pt solid #000' },
  cellDiscap: { width: 32, padding: 2, borderRight: '0.5pt solid #000' },
  cellMunicipio: { width: 55, padding: 2, borderRight: '0.5pt solid #000' },
  cellTelefono: { width: 48, padding: 2, borderRight: '0.5pt solid #000' },
  cellServicio: { width: 60, padding: 2, borderRight: '0.5pt solid #000' },
  cellValor: { width: 42, padding: 2, borderRight: '0.5pt solid #000' },
  cellFirma: { flex: 1, padding: 2 },
  // Header cell text
  cellHeaderText: { color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 5.5, textAlign: 'center' },
  // Body cell text
  cellBodyText: { fontSize: 6, textAlign: 'center' },
  cellBodyTextLeft: { fontSize: 6 },
  // Footer
  footer: { marginTop: 8 },
  footerRow: { flexDirection: 'row', marginTop: 6 },
  footerBlock: { flex: 1, borderTop: '0.5pt solid #000', paddingTop: 3, marginRight: 10 },
  footerBlockLast: { flex: 1, borderTop: '0.5pt solid #000', paddingTop: 3 },
  footerLabel: { fontFamily: 'Helvetica-Bold', fontSize: 6, textAlign: 'center' },
  footerSub: { fontSize: 5.5, textAlign: 'center', color: '#444' },
  // Observations
  obsBox: {
    border: '0.5pt solid #000',
    padding: 4,
    minHeight: 30,
    marginTop: 4,
  },
})

// ============================================================
// Helpers
// ============================================================

function fmt(val: string | null | undefined, fallback = '') {
  return val ?? fallback
}

function fmtMoney(val: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val)
}

function fmtFecha(val: string | null | undefined) {
  if (!val) return ''
  try {
    return new Date(val).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return val
  }
}

const BLANK_ROWS = 16

// ============================================================
// Component
// ============================================================

interface Props {
  actividad: InformeActividad
  reembolsos: ReembolsoInforme[]
}

export function ListaAsistenciaPDF({ actividad, reembolsos }: Props) {
  // Rellenar hasta BLANK_ROWS filas
  const rows = Array.from({ length: Math.max(BLANK_ROWS, reembolsos.length) }, (_, i) =>
    reembolsos[i] ?? null
  )

  const totalValor = reembolsos.reduce((s, r) => s + (r.precio_total ?? 0), 0)

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>

        {/* ---- ENCABEZADO ---- */}
        <View style={styles.headerRow}>
          <View style={styles.headerLogo}>
            <Text style={styles.headerLogoText}>UNIDAD PARA{'\n'}LAS VÍCTIMAS</Text>
          </View>
          <View style={styles.headerTitle}>
            <Text style={styles.headerTitleText}>
              LISTA DE ASISTENCIA PARA ENTREGA DE REEMBOLSOS A VÍCTIMAS DE HECHOS VICTIMIZANTES
            </Text>
            <Text style={{ fontSize: 6.5, marginTop: 2 }}>
              EN EL MARCO DE LAS MEDIDAS DE ASISTENCIA HUMANITARIA INMEDIATA Y DE EMERGENCIA
            </Text>
          </View>
          <View style={styles.headerMeta}>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Código:</Text>
              <Text style={styles.headerMetaValue}>500.08.15-68</Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Versión:</Text>
              <Text style={styles.headerMetaValue}>07</Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Fecha vigencia:</Text>
              <Text style={styles.headerMetaValue}>12/06/2024</Text>
            </View>
            <View style={styles.headerMetaRow}>
              <Text style={styles.headerMetaLabel}>Página:</Text>
              <Text style={styles.headerMetaValue}>1 de 1</Text>
            </View>
          </View>
        </View>

        {/* ---- INFO ACTIVIDAD ---- */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>No. CONTRATO:</Text>
            <Text style={styles.infoValue}>931 de 2025</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>No. REQUERIMIENTO:</Text>
            <Text style={styles.infoValue}>{fmt(actividad.numero_requerimiento)}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>ACTIVIDAD / NOMBRE:</Text>
            <Text style={styles.infoValue}>{fmt(actividad.nombre_actividad)}</Text>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>FECHA:</Text>
            <Text style={styles.infoValue}>{fmtFecha(actividad.fecha_inicio)}</Text>
          </View>
          <View style={styles.infoBlockLast}>
            <Text style={styles.infoLabel}>LUGAR:</Text>
            <Text style={styles.infoValue}>
              {[actividad.lugar_detalle, actividad.municipio, actividad.departamento].filter(Boolean).join(', ')}
            </Text>
          </View>
        </View>

        {/* ---- TABLA ---- */}
        <View style={styles.table}>
          {/* Header */}
          <View style={styles.tableHeader}>
            <View style={styles.cellNo}><Text style={styles.cellHeaderText}>No.</Text></View>
            <View style={styles.cellNombre}><Text style={styles.cellHeaderText}>NOMBRE COMPLETO</Text></View>
            <View style={styles.cellDoc}><Text style={styles.cellHeaderText}>No. DOCUMENTO{'\n'}DE IDENTIDAD</Text></View>
            <View style={styles.cellFecha}><Text style={styles.cellHeaderText}>FECHA{'\n'}NACIMIENTO</Text></View>
            <View style={styles.cellSexo}><Text style={styles.cellHeaderText}>SEXO{'\n'}M/F</Text></View>
            <View style={styles.cellEtnia}><Text style={styles.cellHeaderText}>ETNIA / GRUPO{'\n'}DIFERENCIAL</Text></View>
            <View style={styles.cellDiscap}><Text style={styles.cellHeaderText}>DISCAPACI-{'\n'}DAD S/N</Text></View>
            <View style={styles.cellMunicipio}><Text style={styles.cellHeaderText}>MUNICIPIO{'\n'}RESIDENCIA</Text></View>
            <View style={styles.cellTelefono}><Text style={styles.cellHeaderText}>TELÉFONO</Text></View>
            <View style={styles.cellServicio}><Text style={styles.cellHeaderText}>SERVICIO/DESCRIPCIÓN{'\n'}REEMBOLSO</Text></View>
            <View style={styles.cellValor}><Text style={styles.cellHeaderText}>VALOR{'\n'}REEMBOLSO $</Text></View>
            <View style={styles.cellFirma}><Text style={styles.cellHeaderText}>FIRMA / HUELLA</Text></View>
          </View>

          {/* Rows */}
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <View style={styles.cellNo}><Text style={styles.cellBodyText}>{i + 1}</Text></View>
              <View style={styles.cellNombre}>
                <Text style={styles.cellBodyTextLeft}>{r ? fmt(r.beneficiario_nombre) : ''}</Text>
              </View>
              <View style={styles.cellDoc}>
                <Text style={styles.cellBodyText}>{r ? fmt(r.beneficiario_documento) : ''}</Text>
              </View>
              <View style={styles.cellFecha}><Text style={styles.cellBodyText}> </Text></View>
              <View style={styles.cellSexo}><Text style={styles.cellBodyText}> </Text></View>
              <View style={styles.cellEtnia}><Text style={styles.cellBodyText}> </Text></View>
              <View style={styles.cellDiscap}><Text style={styles.cellBodyText}> </Text></View>
              <View style={styles.cellMunicipio}>
                <Text style={styles.cellBodyText}>{fmt(actividad.municipio)}</Text>
              </View>
              <View style={styles.cellTelefono}><Text style={styles.cellBodyText}> </Text></View>
              <View style={styles.cellServicio}>
                <Text style={styles.cellBodyTextLeft}>{r ? fmt(r.descripcion) : ''}</Text>
              </View>
              <View style={styles.cellValor}>
                <Text style={styles.cellBodyText}>{r ? fmtMoney(r.precio_total) : ''}</Text>
              </View>
              <View style={styles.cellFirma}><Text style={styles.cellBodyText}> </Text></View>
            </View>
          ))}

          {/* Totals row */}
          <View style={[styles.tableRow, { backgroundColor: '#e8edf5' }]}>
            <View style={[styles.cellNo, { flex: 9, alignItems: 'flex-end', paddingRight: 4 }]}>
              <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 6.5 }}>TOTAL ENTREGADO:</Text>
            </View>
            <View style={styles.cellValor}>
              <Text style={[styles.cellBodyText, { fontFamily: 'Helvetica-Bold' }]}>{fmtMoney(totalValor)}</Text>
            </View>
            <View style={styles.cellFirma}><Text style={styles.cellBodyText}> </Text></View>
          </View>
        </View>

        {/* ---- OBSERVACIONES ---- */}
        <Text style={styles.sectionLabel}>OBSERVACIONES:</Text>
        <View style={styles.obsBox}>
          <Text style={{ fontSize: 6 }}> </Text>
        </View>

        {/* ---- FIRMAS ---- */}
        <View style={styles.footerRow}>
          <View style={styles.footerBlock}>
            <Text style={styles.footerLabel}>OPERADOR CONTRATISTA</Text>
            <Text style={styles.footerSub}>Nombre y Firma</Text>
          </View>
          <View style={styles.footerBlock}>
            <Text style={styles.footerLabel}>SUPERVISOR UARIV</Text>
            <Text style={styles.footerSub}>Nombre y Firma</Text>
          </View>
          <View style={styles.footerBlockLast}>
            <Text style={styles.footerLabel}>RESPONSABLE DE ACTIVIDAD</Text>
            <Text style={styles.footerSub}>{fmt(actividad.responsable_nombre, 'Nombre y Firma')}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
