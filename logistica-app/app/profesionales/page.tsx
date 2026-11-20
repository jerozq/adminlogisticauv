import { listarDirectorioProfesionales } from '@/actions/profesionales'
import { DirectorioProfesionales } from '@/components/profesionales/DirectorioProfesionales'
import { PageHeader } from '@/components/PageHeader'

export const metadata = {
  title: 'Profesionales · Logística UV',
}

export const dynamic = 'force-dynamic'

export default async function ProfesionalesPage() {
  const profesionales = await listarDirectorioProfesionales()

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <PageHeader
        title="Directorio de Profesionales"
        subtitle={`${profesionales.length} persona${profesionales.length === 1 ? '' : 's'} han apoyado actividades`}
        backHref="/"
        breadcrumbs={[
          { label: 'Inicio', href: '/' },
          { label: 'Profesionales', href: '/profesionales' },
        ]}
      />

      <DirectorioProfesionales profesionales={profesionales} />
    </main>
  )
}
