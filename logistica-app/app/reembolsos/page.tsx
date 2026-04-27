import { ReceiptText, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { listarEvidenciasGlobales } from "@/actions/evidencias";
import { GaleriaEvidencias } from "@/components/reembolsos/GaleriaEvidencias";

export const metadata = { title: "Evidencias y Reembolsos · Admin Logística" }

// Forzar dinámico
export const dynamic = 'force-dynamic'

export default async function ReembolsosPage() {
  const evidencias = await listarEvidenciasGlobales();

  return (
    <div className="min-h-screen [background:var(--background)]">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-panel border-b px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link
            href="/"
            className="p-2 -ml-2 rounded-xl hover:[background:var(--surface)] transition-colors"
            aria-label="Volver al inicio"
          >
            <ArrowLeft strokeWidth={1.5} className="size-5 [color:var(--text-secondary)]" />
          </Link>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <ReceiptText strokeWidth={1.5} className="size-5 text-violet-500 shrink-0" />
            <div>
              <h1 className="font-bold [color:var(--text-primary)] leading-none">Gestión de Evidencias</h1>
              <p className="text-xs [color:var(--text-muted)] mt-0.5">
                Central de soportes fotográficos y documentos
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <GaleriaEvidencias evidencias={evidencias} />
      </div>
    </div>
  );
}
