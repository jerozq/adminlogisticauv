import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

// ============================================================
// vitest.config.ts
//
// Configuración de pruebas automatizadas para logistica-app.
//
// Entornos:
//   - jsdom       → componentes React / DOM (Testing Library)
//   - node        → lógica pura de dominio y use-cases
//
// Alias @/ → raíz del proyecto (espeja tsconfig.json "paths").
// El plugin vite-tsconfig-paths lo lee automáticamente de tsconfig.json.
//
// Cobertura:
//   Ejecutar con `npm run test:coverage` para generar reporte HTML
//   en ./coverage/.
// ============================================================

export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),  // Lee el alias @/* de tsconfig.json
  ],

  test: {
    // ── Entorno DOM para Testing Library ──────────────────────
    environment: 'jsdom',

    // ── Setup global: matchers de @testing-library/jest-dom ───
    setupFiles: ['./src/__tests__/setup.ts'],

    // ── Patrones de archivos de test ──────────────────────────
    include: [
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],

    // ── Cobertura de código (v8, sin instrumentación extra) ───
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
      exclude: ['src/core/**/__tests__/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
    },

    // ── Reporters: legible en consola + output compacto ───────
    reporters: ['verbose'],

    // ── Globals: describe/it/expect disponibles sin import ────
    globals: true,

    // ── Timeout por test (ms) ─────────────────────────────────
    testTimeout: 10_000,
  },
})
