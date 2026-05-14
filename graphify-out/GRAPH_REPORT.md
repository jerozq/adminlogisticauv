# Graph Report - .  (2026-05-14)

## Corpus Check
- Large corpus: 206 files · ~163,142 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1056 nodes · 1912 edges · 64 communities (49 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.72)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_cotizaciones.ts|cotizaciones.ts]]
- [[_COMMUNITY_getSupabase()|getSupabase()]]
- [[_COMMUNITY_liquidaciones.ts|liquidaciones.ts]]
- [[_COMMUNITY_TabInforme.tsx|TabInforme.tsx]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_route.ts|route.ts]]
- [[_COMMUNITY_TesoreriaDashboard.tsx|TesoreriaDashboard.tsx]]
- [[_COMMUNITY_ExcelToPdfReembolsoAdapter.test.ts|ExcelToPdfReembolsoAdapter.test.ts]]
- [[_COMMUNITY_FinancialExportAdapter.ts|FinancialExportAdapter.ts]]
- [[_COMMUNITY_CloudConvertAdapter.ts|CloudConvertAdapter.ts]]
- [[_COMMUNITY_domain.ts|domain.ts]]
- [[_COMMUNITY_documentos-proyecto.ts|documentos-proyecto.ts]]
- [[_COMMUNITY_ejecucion.ts|ejecucion.ts]]
- [[_COMMUNITY_route.ts|route.ts]]
- [[_COMMUNITY_GetFinancialSummary.ts|GetFinancialSummary.ts]]
- [[_COMMUNITY_TablaReembolsos.tsx|TablaReembolsos.tsx]]
- [[_COMMUNITY_EjecucionBoardShell.tsx|EjecucionBoardShell.tsx]]
- [[_COMMUNITY_SupabaseActivityRepository|SupabaseActivityRepository]]
- [[_COMMUNITY_CambiarEstadoButton.tsx|CambiarEstadoButton.tsx]]
- [[_COMMUNITY_Actividad|Actividad]]
- [[_COMMUNITY_Reembolso.ts|Reembolso.ts]]
- [[_COMMUNITY_withSpan()|withSpan()]]
- [[_COMMUNITY_Reembolso|Reembolso]]
- [[_COMMUNITY_BalanceFinanciero|BalanceFinanciero]]
- [[_COMMUNITY_WordTemplateAdapter.ts|WordTemplateAdapter.ts]]
- [[_COMMUNITY_Actividad.test.ts|Actividad.test.ts]]
- [[_COMMUNITY_reembolsos.ts|reembolsos.ts]]
- [[_COMMUNITY_container.ts|container.ts]]
- [[_COMMUNITY_TabCronograma.tsx|TabCronograma.tsx]]
- [[_COMMUNITY_logistica-appEVIDENCIAS PDF DOCS|logistica-app/EVIDENCIAS PDF DOCS.md]]
- [[_COMMUNITY_reembolsos-separacion.test.ts|reembolsos-separacion.test.ts]]
- [[_COMMUNITY_ChangeActivityStatus.ts|ChangeActivityStatus.ts]]
- [[_COMMUNITY_SupabaseFinancialAdapter|SupabaseFinancialAdapter]]
- [[_COMMUNITY_SupabaseReportingRepository|SupabaseReportingRepository]]
- [[_COMMUNITY_CalendarioMaestro.tsx|CalendarioMaestro.tsx]]
- [[_COMMUNITY_listarActividadesCalendarioMaestro()|listarActividadesCalendarioMaestro()]]
- [[_COMMUNITY_proxy.ts|proxy.ts]]
- [[_COMMUNITY_Reembolso.test.ts|Reembolso.test.ts]]
- [[_COMMUNITY_Supabase Storage bucket evidencias|Supabase Storage bucket evidencias]]
- [[_COMMUNITY_SocioParticipacion|SocioParticipacion]]
- [[_COMMUNITY_InMemoryReembolsoRepository|InMemoryReembolsoRepository]]
- [[_COMMUNITY_IExcelParser.ts|IExcelParser.ts]]
- [[_COMMUNITY_logistica-appREADME|logistica-app/README.md]]
- [[_COMMUNITY_logistica-appAGENTS|logistica-app/AGENTS.md]]
- [[_COMMUNITY_Visibilidad financiera (abonadocostos)|Visibilidad financiera (abonado/costos)]]
- [[_COMMUNITY_eslintConfig|eslintConfig]]
- [[_COMMUNITY_next.config.js|next.config.js]]
- [[_COMMUNITY_config|config]]
- [[_COMMUNITY_README.md (root)|README.md (root)]]
- [[_COMMUNITY_publicfile.svg|public/file.svg]]
- [[_COMMUNITY_publicglobe.svg|public/globe.svg]]
- [[_COMMUNITY_publicwindow.svg|public/window.svg]]

## God Nodes (most connected - your core abstractions)
1. `getSupabase()` - 47 edges
2. `Actividad` - 21 edges
3. `SupabaseActivityRepository` - 19 edges
4. `Reembolso` - 16 edges
5. `BalanceFinanciero` - 14 edges
6. `getLogger()` - 14 edges
7. `MockSupabaseQuery` - 12 edges
8. `parsearRequerimientoExcel()` - 11 edges
9. `withSpan()` - 11 edges
10. `InformeActividad` - 10 edges

## Surprising Connections (you probably didn't know these)
- `public/next.svg` --starter_asset_of_nextjs_app--> `logistica-app/README.md`  [INFERRED]
  C:/Users/Jeronimo Zapata/Documents/GitHub/adminlogisticauv/logistica-app/public/next.svg → C:/Users/Jeronimo Zapata/Documents/GitHub/adminlogisticauv/logistica-app/README.md
- `public/vercel.svg` --deployment_brand_asset--> `logistica-app/README.md`  [INFERRED]
  C:/Users/Jeronimo Zapata/Documents/GitHub/adminlogisticauv/logistica-app/public/vercel.svg → C:/Users/Jeronimo Zapata/Documents/GitHub/adminlogisticauv/logistica-app/README.md
- `agregarCostoBatch()` --calls--> `getSupabase()`  [EXTRACTED]
  logistica-app/actions/ejecucion.ts → logistica-app/lib/supabase.ts
- `listarItemsCotizados()` --calls--> `getSupabase()`  [EXTRACTED]
  logistica-app/actions/ejecucion.ts → logistica-app/lib/supabase.ts
- `actualizarEstadoInforme()` --calls--> `getSupabase()`  [EXTRACTED]
  logistica-app/actions/informes.ts → logistica-app/lib/supabase.ts

## Hyperedges (group relationships)
- **h_pdf3_delivery_bundle** — f_files_modified_summary, f_impl_summary_pdf3, f_pdf3_testing, f_pdf3_checklist, f_evidencias_docs, c_pdf3, code_evidencias_pdf, code_generar_btn [EXTRACTED]
- **h_agenda_evidence_workflow** — f_manual_edit, f_agenda_example, code_agenda, c_storage, c_pdf3 [INFERRED]
- **h_ops_document_templates** — f_formato_asistencia, f_recibo_satisfaccion, f_plantilla_cotizacion, f_cuenta_cobro [EXTRACTED]

## Communities (64 total, 15 thin omitted)

### Community 0 - "cotizaciones.ts"
Cohesion: 0.05
Nodes (73): actualizarCotizacion(), buildCronogramaFallback(), cargarCotizacion(), cell(), cellDate(), cellNum(), cellStr(), countInhumaciones() (+65 more)

### Community 1 - "getSupabase()"
Cohesion: 0.05
Nodes (51): actualizarItemCronograma(), actualizarItemCronogramaPorReferencia(), agregarItemCronograma(), eliminarItemCronograma(), EntregableEditable, obtenerCronogramaIA(), ReferenciaEntregable, subirArchivoEvidencia() (+43 more)

### Community 2 - "liquidaciones.ts"
Cohesion: 0.05
Nodes (56): actualizarAbono(), _armarNotasMovimientoCosto(), cambiarEstadoPagoCosto(), CostoLiquidacionDetalle, eliminarAbono(), eliminarCostoReal(), eliminarDeudaDevolucion(), eliminarSoporte() (+48 more)

### Community 3 - "TabInforme.tsx"
Cohesion: 0.05
Nodes (51): actualizarEstadoInforme(), EvidenciaInforme, InformeActividad, ReembolsoInforme, subirDocumentoActividad(), subirDocumentoBeneficiario(), COP, Props (+43 more)

### Community 4 - "page.tsx"
Cohesion: 0.05
Nodes (40): actualizarCronogramaIA(), CronogramaSchema, EntregableSchema, generarCronogramaIA(), GenerarCronogramaResult, guardarCronogramaIAEnCache(), HitoCronogramaIA, MOCK_HITOS (+32 more)

### Community 5 - "route.ts"
Cohesion: 0.06
Nodes (34): signIn(), signOut(), getDashboardStats(), geistMono, geistSans, metadata, fmtM(), getUserDisplayName() (+26 more)

### Community 6 - "TesoreriaDashboard.tsx"
Cohesion: 0.07
Nodes (32): crearRequerimientoManual(), guardarCotizacion(), calcularSaldoCuenta(), _calcularSaldosDesdeMovimientos(), crearCuentaProyecto(), crearCuentaSocio(), CuentaVirtual, inyectarCapital() (+24 more)

### Community 7 - "ExcelToPdfReembolsoAdapter.test.ts"
Cohesion: 0.05
Nodes (23): ExcelToPdfReembolsoAdapter, formatDate(), log, resolveTemplatePath(), createMockSupabase(), MockSupabaseClient, MockSupabaseQuery, QueryCall (+15 more)

### Community 8 - "FinancialExportAdapter.ts"
Cohesion: 0.1
Nodes (32): addWorksheet(), applyDataRow(), applyHeaderRow(), applyTotalRow(), BORDER_THIN, buildHojaActividades(), buildHojaPorFuente(), buildHojaPorMes() (+24 more)

### Community 9 - "CloudConvertAdapter.ts"
Cohesion: 0.07
Nodes (18): CloudConvertAdapter, cloudConvertFetch(), CloudConvertJob, CloudConvertJobResponse, CloudConvertTask, CloudConvertUploadTaskResult, PROVIDER, sleep() (+10 more)

### Community 10 - "domain.ts"
Cohesion: 0.14
Nodes (25): normalizarPagador(), toCostoReal(), IActivityRepository, ActividadResumen, ConfiguracionParticipaciones, CostoReal, DistribucionSocio, EntregaHito (+17 more)

### Community 11 - "documentos-proyecto.ts"
Cohesion: 0.09
Nodes (25): cargarDocumentosProyecto(), DocumentoCampos, DocumentoProyectoState, DocumentosProyectoState, estadoFallback(), guardarDocumentoProyecto(), obtenerDocumentoProyectoActual(), parsearCampos() (+17 more)

### Community 12 - "ejecucion.ts"
Cohesion: 0.1
Nodes (20): ActividadBasica, agregarCostoBatch(), DashboardStats, getActividadBasica(), guardarParticipacionesActividad(), isMissingTable(), listarCostos(), listarItemsCotizados() (+12 more)

### Community 13 - "route.ts"
Cohesion: 0.11
Nodes (21): fixAndNormalizeTemplateTags(), fmt(), GenerarCotizacionBody, ItemExport, POST(), RequerimientoExport, TEMPLATE_TAG_RENAMES, TotalsExport (+13 more)

### Community 14 - "GetFinancialSummary.ts"
Cohesion: 0.24
Nodes (16): log, ReqRow, BalanceFinancieroProps, KpisFinancieros, AgregadoPorFuente, AgregadoPorMes, AgregadoPorSocio, FiltrosReporte (+8 more)

### Community 15 - "TablaReembolsos.tsx"
Cohesion: 0.14
Nodes (13): COP, CreateModalProps, EditModalProps, fmtCOP(), fmtFecha(), FormatoCard(), ModalCrearFormato(), ModalEditarReembolso() (+5 more)

### Community 16 - "EjecucionBoardShell.tsx"
Cohesion: 0.13
Nodes (11): calcularTiempoRestante(), CalculoVencimiento, Props, ViewMode, ColKey, COLUMNS, KanbanBoard(), now (+3 more)

### Community 17 - "SupabaseActivityRepository"
Cohesion: 0.14
Nodes (3): SupabaseActivityRepository, toEntregaHito(), toSocioParticipacion()

### Community 18 - "CambiarEstadoButton.tsx"
Cohesion: 0.13
Nodes (15): cambiarEstadoActividad(), BADGE, CambiarEstadoButton(), DOT, ESTADOS, ESTADOS_FINALES, NECESITA_MOTIVO, Props (+7 more)

### Community 20 - "Reembolso.ts"
Cohesion: 0.16
Nodes (11): CENTENAS, convertirALetras(), DECENAS, menorCien(), menorMil(), ReembolsoProps, TipoReembolso, UNIDADES (+3 more)

### Community 21 - "withSpan()"
Cohesion: 0.12
Nodes (6): withSpan(), ChangeActivityStatus, GetFinancialSummary, GetReembolsosFromActivity, PrepareReembolsoDocument, RedefinirParticipacion

### Community 22 - "Reembolso"
Cohesion: 0.19
Nodes (9): _store, Reembolso, IReembolsoRepository, GetReembolsosFromActivityInput, GetReembolsosFromActivityOutput, tracer, PrepareReembolsoDocumentInput, PrepareReembolsoDocumentOutput (+1 more)

### Community 23 - "BalanceFinanciero"
Cohesion: 0.14
Nodes (4): BalanceFinanciero, b, dist, total

### Community 24 - "WordTemplateAdapter.ts"
Cohesion: 0.23
Nodes (8): fixAndNormalizeTemplateTags(), fmt(), fmtDate(), TEMPLATE_TAG_RENAMES, WordTemplateAdapter, DocumentoGenerado, IDocumentGenerator, DatosCotizacionDocumento

### Community 25 - "Actividad.test.ts"
Cohesion: 0.19
Nodes (12): ActividadProps, a, actividad, dist, gastos, makeActividadConDistribucion(), makeActividadProps(), makeCosto() (+4 more)

### Community 26 - "reembolsos.ts"
Cohesion: 0.32
Nodes (11): BeneficiarioExtraido, crearReembolso(), eliminarReembolso(), guardarReembolso(), importarReembolsosDesdeExcel(), materializarReembolsosAuto(), obtenerReembolsos(), parseAlojamientoSheet() (+3 more)

### Community 27 - "container.ts"
Cohesion: 0.27
Nodes (9): getSupabaseActivityRepository(), createSupabaseFinancialAdapter(), getSupabaseClient(), getSupabaseReportingRepository(), getRepo(), getReportingRepository(), makeChangeActivityStatus(), makeGetFinancialSummary() (+1 more)

### Community 28 - "TabCronograma.tsx"
Cohesion: 0.18
Nodes (8): crearEntrega(), marcarEntregaLista(), marcarEntregaPendiente(), CardProps, EntregaCard(), formatDateTime(), Props, EstadoEntrega

### Community 29 - "logistica-app/EVIDENCIAS PDF DOCS.md"
Cohesion: 0.27
Nodes (6): Grilla adaptativa de evidencias, Agrupacion por item (descripcion), PDF 3: Reporte de Evidencias Fotograficas, components/informes/pdf/EvidenciasPDF.tsx, GenerarEvidenciasPDFButton, logistica-app/EVIDENCIAS_PDF_DOCS.md

### Community 30 - "reembolsos-separacion.test.ts"
Cohesion: 0.18
Nodes (10): actividad, anaRows, baseItems, beneficiarios, inhumacion, itemsSinInhumacion, pedroRows, result (+2 more)

### Community 31 - "ChangeActivityStatus.ts"
Cohesion: 0.24
Nodes (7): register(), getTracer(), initSDK(), SpanOptions, ChangeActivityStatusInput, ChangeActivityStatusOutput, tracer

### Community 34 - "CalendarioMaestro.tsx"
Cohesion: 0.33
Nodes (5): CalendarEventProps, CalendarioMaestro(), EventEstado, useMasterCalendarEvents(), ActividadCalendarioMaestro

### Community 35 - "listarActividadesCalendarioMaestro()"
Cohesion: 0.38
Nodes (6): listarActividadesCalendarioMaestro(), listarActividadesKanban(), makeCronogramaKey(), parseDescCantidad(), EjecucionBoardShell(), EjecucionPage()

### Community 36 - "proxy.ts"
Cohesion: 0.47
Nodes (5): config, getRequestKind(), log(), proxy(), RequestKind

### Community 37 - "Reembolso.test.ts"
Cohesion: 0.33
Nodes (4): back, casos, props, r

### Community 41 - "IExcelParser.ts"
Cohesion: 0.5
Nodes (3): IExcelParser, OpcionesParser, RequerimientoParsed

### Community 42 - "logistica-app/README.md"
Cohesion: 0.67
Nodes (3): logistica-app/README.md, public/next.svg, public/vercel.svg

## Knowledge Gaps
- **268 isolated node(s):** `eslintConfig`, `nextConfig`, `config`, `RequestKind`, `config` (+263 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getSupabase()` connect `getSupabase()` to `cotizaciones.ts`, `TabInforme.tsx`, `page.tsx`, `listarActividadesCalendarioMaestro()`, `route.ts`, `documentos-proyecto.ts`, `ejecucion.ts`?**
  _High betweenness centrality (0.159) - this node is a cross-community bridge._
- **Why does `getLogger()` connect `liquidaciones.ts` to `route.ts`, `TesoreriaDashboard.tsx`, `ExcelToPdfReembolsoAdapter.test.ts`, `FinancialExportAdapter.ts`, `GetFinancialSummary.ts`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Why does `createClient()` connect `route.ts` to `liquidaciones.ts`, `TesoreriaDashboard.tsx`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `config` to the rest of the system?**
  _268 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cotizaciones.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `getSupabase()` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `liquidaciones.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._