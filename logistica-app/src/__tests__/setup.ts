// ============================================================
// src/__tests__/setup.ts
//
// Archivo de setup global para Vitest.
// Se ejecuta una vez antes de cada archivo de test.
//
// Responsabilidades:
//   - Extiende los matchers de `expect` con los de
//     @testing-library/jest-dom (toBeInTheDocument, toHaveClass, etc.)
//   - Limpia el DOM después de cada test (cleanup automático
//     de React Testing Library ya se ejecuta via afterEach).
// ============================================================

import '@testing-library/jest-dom'
