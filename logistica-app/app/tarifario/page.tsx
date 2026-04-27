import { listarTarifario } from '@/actions/tarifario'
import type { TarifarioPageParams } from '@/src/core/domain/ports/ITarifarioRepository'
import { TarifarioEditor } from '@/components/tarifario/TarifarioEditor'
import { PageHeader } from '@/components/PageHeader'

export const metadata = {
  title: 'Tarifario 2026 · Logística UV',
}

const PAGE_SIZE = 25

export default async function TarifarioPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; categoria?: string }>
}) {
  const { page: pageStr, search = '', categoria = '' } = await searchParams

  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)

  const { items, totalCount } = await listarTarifario({
    page,
    pageSize: PAGE_SIZE,
    search,
    categoria,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <PageHeader
        title="Tarifario 2026"
        subtitle={`${totalCount} ítems activos · Precios oficiales para cotizaciones`}
        backHref="/"
        breadcrumbs={[
          { label: 'Inicio',    href: '/' },
          { label: 'Tarifario', href: '/tarifario' },
        ]}
      />

      <TarifarioEditor
        key={`${page}-${search}-${categoria}`}
        items={items}
        totalCount={totalCount}
        page={page}
        pageSize={PAGE_SIZE}
        initialSearch={search}
        initialCategoria={categoria}
      />
    </main>
  )
}
