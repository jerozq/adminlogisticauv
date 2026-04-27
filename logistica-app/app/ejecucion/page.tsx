import { listarActividadesCalendarioMaestro, listarActividadesKanban } from '@/actions/ejecucion'
import { EjecucionBoardShell } from '@/components/ejecucion/EjecucionBoardShell'

export const dynamic = 'force-dynamic'

export default async function EjecucionPage() {
  const [actividadesKanban, actividadesCalendario] = await Promise.all([
    listarActividadesKanban(),
    listarActividadesCalendarioMaestro(),
  ])

  return (
    <EjecucionBoardShell
      actividadesKanban={actividadesKanban}
      actividadesCalendario={actividadesCalendario}
    />
  )
}
