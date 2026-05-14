'use client'

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { InformeActividad, EvidenciaInforme } from '@/actions/informes'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 22,
    paddingRight: 22,
    backgroundColor: '#ffffff',
  },
  // Header strip
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: '1.5pt solid #1c3664',
  },
  headerLogoBox: {
    width: 52,
    height: 36,
    border: '1pt solid #000',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    padding: 2,
  },
  headerLogoText: { fontSize: 5.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  headerInfo: { flex: 1 },
  headerTitle: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: '#1c3664' },
  headerSub: { fontSize: 6.5, color: '#444', marginTop: 1 },
  headerMeta: { fontSize: 6, color: '#666', marginTop: 1 },
  // Cover page
  coverPage: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    paddingTop: 80,
    paddingBottom: 40,
    paddingLeft: 50,
    paddingRight: 50,
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  coverBadge: {
    backgroundColor: '#1c3664',
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    padding: '3 10',
    borderRadius: 4,
    marginBottom: 20,
  },
  coverTitle: { fontFamily: 'Helvetica-Bold', fontSize: 18, textAlign: 'center', color: '#1c3664', marginBottom: 8 },
  coverSub: { fontSize: 10, textAlign: 'center', color: '#444', marginBottom: 30 },
  coverInfoRow: { flexDirection: 'row', marginBottom: 5, width: '100%' },
  coverLabel: { fontFamily: 'Helvetica-Bold', fontSize: 8, width: 120 },
  coverValue: { fontSize: 8, flex: 1, color: '#222' },
  coverLine: { borderTop: '0.5pt solid #aaa', width: '100%', marginTop: 30, marginBottom: 8 },
  coverNote: { fontSize: 7, textAlign: 'center', color: '#888' },
  // Sección de ítem
  itemSection: {
    marginBottom: 12,
    borderBottom: '1pt solid #e0e0e0',
    paddingBottom: 8,
  },
  itemHeader: {
    marginBottom: 6,
    borderLeft: '2.5pt solid #1c3664',
    paddingLeft: 6,
  },
  itemTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: '#1c3664',
    marginBottom: 2,
  },
  itemDate: {
    fontSize: 6,
    color: '#888',
  },
  // Photo grid adaptable
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  photoCard1: {
    width: '100%',
    marginBottom: 4,
  },
  photoCard2: {
    width: '49%',
    marginBottom: 4,
  },
  photoCard3: {
    width: '32.33%',
    marginBottom: 4,
  },
  photoCard4: {
    width: '24%',
    marginBottom: 4,
  },
  photoBorder: {
    border: '0.5pt solid #d0d0d0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  photoImg1: { width: '100%', height: 180, objectFit: 'cover' },
  photoImg2: { width: '100%', height: 100, objectFit: 'cover' },
  photoImg3: { width: '100%', height: 70, objectFit: 'cover' },
  photoImg4: { width: '100%', height: 60, objectFit: 'cover' },
  photoCaption: {
    padding: '2 3',
    backgroundColor: '#f5f5f5',
    borderTop: '0.5pt solid #eee',
  },
  photoCaptionText: { fontSize: 5, color: '#666', lineHeight: 1.2 },
  photoNum: { fontSize: 4.5, color: '#aaa', marginBottom: 0.5 },
})

// ============================================================
// Helpers
// ============================================================

function fmt(v: string | null | undefined, fb = '') { return v ?? fb }

function fmtFecha(v: string | null | undefined) {
  if (!v) return ''
  try { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return v }
}

function fmtFechaHora(v: string | null | undefined) {
  if (!v) return ''
  try { return new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return v }
}

// ============================================================
// Tipos y Helpers para agrupación
// ============================================================

interface EvidenciaGrupada {
  item: string
  fecha: string
  fotos: EvidenciaInforme[]
}

interface PaginaFotos {
  grupos: EvidenciaGrupada[]
  esUltimaPagina: boolean
}

function agruparEvidenciasPorItem(evidencias: EvidenciaInforme[]): EvidenciaGrupada[] {
  const map = new Map<string, EvidenciaGrupada>()
  
  for (const ev of evidencias) {
    const key = ev.descripcion || 'Sin descripción'
    if (!map.has(key)) {
      map.set(key, {
        item: key,
        fecha: ev.fecha_hora_limite,
        fotos: [],
      })
    }
    map.get(key)!.fotos.push(ev)
  }
  
  return Array.from(map.values())
}

/**
 * Distribuye los grupos de evidencias por página,
 * intentando mantener cada grupo junto sin romper dentro.
 * Si un grupo es muy grande (>4 fotos), crea breakpoints.
 */
function distribuirPorPaginas(grupos: EvidenciaGrupada[]): PaginaFotos[] {
  const paginas: PaginaFotos[] = []
  let paginaActual: PaginaFotos = { grupos: [], esUltimaPagina: false }
  
  for (const grupo of grupos) {
    // Si el grupo tiene >4 fotos, dividirlo en subgrupos
    const subgrupos: EvidenciaGrupada[] = []
    if (grupo.fotos.length > 4) {
      // Partir en chunks de 4
      for (let i = 0; i < grupo.fotos.length; i += 4) {
        subgrupos.push({
          item: grupo.item + (subgrupos.length > 0 ? ` (continuación)` : ''),
          fecha: grupo.fecha,
          fotos: grupo.fotos.slice(i, i + 4),
        })
      }
    } else {
      subgrupos.push(grupo)
    }
    
    // Intentar agregar subgrupos a la página actual
    for (const sg of subgrupos) {
      // Estimación aproximada: altura = (cantidad de fotos / max_por_fila) * altura_fila + overhead
      const fotosPorFila = Math.min(4, sg.fotos.length)
      const filasNecesarias = Math.ceil(sg.fotos.length / fotosPorFila)
      const alturaEstimada = filasNecesarias * 80 + 40 // 80pt por fila + overhead
      
      // Si la página actual está cerca del límite (~600pt), iniciar nueva página
      const alturaActual = paginaActual.grupos.length === 0 
        ? 0 
        : paginaActual.grupos.reduce((sum, g) => {
            const fpf = Math.min(4, g.fotos.length)
            const fn = Math.ceil(g.fotos.length / fpf)
            return sum + fn * 80 + 40
          }, 0)
      
      if (alturaActual + alturaEstimada > 600 && paginaActual.grupos.length > 0) {
        paginas.push(paginaActual)
        paginaActual = { grupos: [], esUltimaPagina: false }
      }
      
      paginaActual.grupos.push(sg)
    }
  }
  
  if (paginaActual.grupos.length > 0) {
    paginas.push(paginaActual)
  }
  
  // Marcar última página
  if (paginas.length > 0) {
    paginas[paginas.length - 1].esUltimaPagina = true
  }
  
  return paginas
}

/**
 * Calcula el ancho de tarjeta según cantidad de fotos
 */
function obtenerEstilosGrid(cantidad: number) {
  switch (true) {
    case cantidad === 1:
      return {
        cardStyle: s.photoCard1,
        imgStyle: s.photoImg1,
      }
    case cantidad === 2:
      return {
        cardStyle: s.photoCard2,
        imgStyle: s.photoImg2,
      }
    case cantidad >= 3 && cantidad <= 4:
      return {
        cardStyle: s.photoCard3,
        imgStyle: s.photoImg3,
      }
    default: // 5+
      return {
        cardStyle: s.photoCard4,
        imgStyle: s.photoImg4,
      }
  }
}

// ============================================================
// Props
// ============================================================

interface Props {
  actividad: InformeActividad
  evidencias: EvidenciaInforme[]
}

export function EvidenciasPDF({ actividad, evidencias }: Props) {
  const lugarCompleto = [actividad.lugar_detalle, actividad.municipio, actividad.departamento]
    .filter(Boolean).join(', ')
  
  const gruposEvidencias = agruparEvidenciasPorItem(evidencias)
  const paginasFotos = distribuirPorPaginas(gruposEvidencias)

  return (
    <Document>
      {/* ---- PORTADA ---- */}
      <Page size="LETTER" style={s.coverPage}>
        <Text style={s.coverBadge}>UNIDAD PARA LAS VÍCTIMAS · CONTRATO 931 DE 2025</Text>
        <Text style={s.coverTitle}>REGISTRO FOTOGRÁFICO DE ACTIVIDAD</Text>
        <Text style={s.coverSub}>Evidencias de campo — Asistencia Humanitaria</Text>

        <View style={{ width: '100%', border: '0.5pt solid #ddd', padding: '12 16', borderRadius: 4 }}>
          {[
            ['Actividad:', fmt(actividad.nombre_actividad)],
            ['No. Requerimiento:', fmt(actividad.numero_requerimiento)],
            ['Fecha:', fmtFecha(actividad.fecha_inicio)],
            ['Lugar:', lugarCompleto],
            ['Responsable:', fmt(actividad.responsable_nombre)],
            ['No. Beneficiarios:', String(actividad.num_victimas)],
            ['Total evidencias:', String(evidencias.length)],
          ].map(([l, v]) => (
            <View key={l} style={s.coverInfoRow}>
              <Text style={s.coverLabel}>{l}</Text>
              <Text style={s.coverValue}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={s.coverLine} />
        <Text style={s.coverNote}>
          Documento generado el {new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
        </Text>
      </Page>

      {/* ---- PÁGINAS DE FOTOS CON GRILLA ADAPTATIVA ---- */}
      {paginasFotos.map((pagina, pageIdx) => (
        <Page key={pageIdx} size="LETTER" style={s.page}>
          {/* Header strip */}
          <View style={s.headerBar}>
            <View style={s.headerLogoBox}>
              <Text style={s.headerLogoText}>UNIDAD PARA{'\n'}LAS VÍCTIMAS</Text>
            </View>
            <View style={s.headerInfo}>
              <Text style={s.headerTitle}>REGISTRO FOTOGRÁFICO DE ACTIVIDAD</Text>
              <Text style={s.headerSub}>{fmt(actividad.nombre_actividad)}</Text>
              <Text style={s.headerMeta}>
                Req. {fmt(actividad.numero_requerimiento, '—')} · {fmtFecha(actividad.fecha_inicio)} · {lugarCompleto} · Pág. {pageIdx + 2}
              </Text>
            </View>
          </View>

          {/* Contenido por grupo de ítem */}
          {pagina.grupos.map((grupo, grupoIdx) => (
            <View key={`${pageIdx}-${grupoIdx}`} style={s.itemSection}>
              {/* Header del ítem */}
              <View style={s.itemHeader}>
                <Text style={s.itemTitle}>{grupo.item}</Text>
                <Text style={s.itemDate}>
                  {fmtFechaHora(grupo.fecha)}
                </Text>
              </View>

              {/* Grilla adaptativa de fotos */}
              <GridAdaptativa fotos={grupo.fotos} />
            </View>
          ))}
        </Page>
      ))}
    </Document>
  )
}

// ============================================================
// Componente Grid Adaptativo
// ============================================================

interface GridAdaptativaProps {
  fotos: EvidenciaInforme[]
}

function GridAdaptativa({ fotos }: GridAdaptativaProps) {
  const { cardStyle, imgStyle } = obtenerEstilosGrid(fotos.length)
  
  return (
    <View style={s.gridContainer}>
      {fotos.map((foto, idx) => (
        <View key={foto.id} style={[s.photoBorder, cardStyle]}>
          {foto.evidencia_url ? (
            <Image src={foto.evidencia_url} style={imgStyle} />
          ) : (
            <View style={[imgStyle, { backgroundColor: '#e8e8e8', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 6, color: '#999' }}>Sin imagen</Text>
            </View>
          )}
          <View style={s.photoCaption}>
            <Text style={s.photoNum}>Foto #{idx + 1}</Text>
            {foto.descripcion && (
              <Text style={s.photoCaptionText}>{foto.descripcion}</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  )
}
