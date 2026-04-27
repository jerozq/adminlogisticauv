// ============================================================
// src/__tests__/mocks/supabase.ts
//
// Mock de Supabase Client para pruebas de integración.
//
// Diseño:
//   - MockSupabaseQuery<T> — builder fluido que espeja el API
//     PostgREST de @supabase/supabase-js (from → select → eq →
//     in → order → single → maybeSingle → limit).
//   - MockSupabaseClient — implementa el subconjunto de la interfaz
//     SupabaseClient que usa SupabaseActivityRepository.
//   - createMockSupabase(rows) — factory que devuelve un cliente
//     ya configurado con los datos a retornar.
//
// Los datos configurados se retornan directamente sin ninguna
// llamada de red. Los filtros (eq, in) se aplican en memoria
// para que los tests puedan verificar el comportamiento del
// repositorio ante datos reales o ausentes.
//
// ¿Por qué no usar vi.mock('@supabase/supabase-js')?
//   Mockar el módulo completo rompe el encadenamiento fluido del
//   builder PostgREST. Este mock manual es más fiel al contrato
//   real y funciona sin importar cambios internos del SDK.
// ============================================================

// ---------------------------------------------------------------
// Tipo interno: tabla → filas de datos de fixture
// ---------------------------------------------------------------

export type TableFixtures = Record<string, unknown[]>

// ---------------------------------------------------------------
// Registro de llamadas — para aserciones en tests
// ---------------------------------------------------------------

export interface QueryCall {
  table:   string
  method:  string
  args:    unknown[]
}

// ---------------------------------------------------------------
// MockSupabaseQuery — builder fluido
// ---------------------------------------------------------------

/**
 * Simula la cadena de métodos de un QueryBuilder de PostgREST.
 * Cada método registra la llamada y retorna `this` para encadenar.
 * El método terminal (data, error) retorna la respuesta simulada.
 */
export class MockSupabaseQuery<T = unknown> {
  private _rows: T[]
  private readonly _calls: QueryCall[]
  private readonly _table: string

  constructor(table: string, rows: T[], calls: QueryCall[]) {
    this._table = table
    this._rows  = [...rows]
    this._calls = calls
  }

  // ── Métodos de filtrado (aplican filtro en memoria) ───────────

  select(...args: unknown[]): this {
    this._calls.push({ table: this._table, method: 'select', args })
    return this
  }

  eq(column: string, value: unknown): this {
    this._calls.push({ table: this._table, method: 'eq', args: [column, value] })
    this._rows = this._rows.filter(
      (r) => (r as Record<string, unknown>)[column] === value,
    )
    return this
  }

  in(column: string, values: unknown[]): this {
    this._calls.push({ table: this._table, method: 'in', args: [column, values] })
    const set = new Set(values)
    this._rows = this._rows.filter(
      (r) => set.has((r as Record<string, unknown>)[column]),
    )
    return this
  }

  order(...args: unknown[]): this {
    this._calls.push({ table: this._table, method: 'order', args })
    return this
  }

  limit(n: number): this {
    this._calls.push({ table: this._table, method: 'limit', args: [n] })
    this._rows = this._rows.slice(0, n)
    return this
  }

  // ── Métodos terminales — devuelven { data, error } ────────────

  /** Resuelve con todas las filas que sobrevivieron los filtros. */
  then(
    resolve: (result: { data: T[] | null; error: null }) => void,
  ): void {
    resolve({ data: this._rows, error: null })
  }

  /** Compatibilidad con `await query` (thenable). */
  get [Symbol.toStringTag]() { return 'MockSupabaseQuery' }

  // Permite `const { data } = await sb.from('x').select('*')` directamente
  // porque @supabase/supabase-js usa Promises con then/catch.
  async single(): Promise<{ data: T | null; error: null }> {
    return { data: this._rows[0] ?? null, error: null }
  }

  async maybeSingle(): Promise<{ data: T | null; error: null }> {
    return { data: this._rows[0] ?? null, error: null }
  }

  /** Awaitable: `const { data, error } = await query`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async [Symbol.for('nodejs.rejection')](): Promise<any> {
    return { data: this._rows, error: null }
  }
}

// Hacer que MockSupabaseQuery sea awaitable directamente
// (igual que un SupabaseClient real, cuyo QueryBuilder es una Promise)
Object.defineProperty(MockSupabaseQuery.prototype, 'then', {
  value(
    this: MockSupabaseQuery,
    onfulfilled: (v: { data: unknown[]; error: null }) => unknown,
  ) {
    return Promise.resolve({ data: this['_rows'] as unknown[], error: null }).then(onfulfilled)
  },
  writable: true,
})

// ---------------------------------------------------------------
// MockSupabaseClient
// ---------------------------------------------------------------

export class MockSupabaseClient {
  /** Todas las llamadas realizadas durante el test (para aserciones). */
  readonly calls: QueryCall[] = []

  private readonly fixtures: TableFixtures

  constructor(fixtures: TableFixtures = {}) {
    this.fixtures = fixtures
  }

  /**
   * Punto de entrada del mock — espeja `supabase.from(table)`.
   * Devuelve un QueryBuilder con las filas pre-configuradas para esa tabla.
   */
  from(table: string): MockSupabaseQuery<unknown> {
    const rows = this.fixtures[table] ?? []
    return new MockSupabaseQuery<unknown>(table, rows, this.calls)
  }

  /**
   * Reemplaza los datos de una tabla en tiempo de test.
   * Útil para escenarios donde distintos tests necesitan datasets diferentes.
   */
  setFixture(table: string, rows: unknown[]): void {
    this.fixtures[table] = rows
  }

  /** Cuántas veces se llamó `from(table)` — util para aserciones de caché. */
  countCallsTo(table: string): number {
    return this.calls.filter((c) => c.table === table).length
  }

  /** Verifica que se haya ejecutado al menos un método concreto sobre una tabla. */
  wasCalled(table: string, method: string): boolean {
    return this.calls.some((c) => c.table === table && c.method === method)
  }
}

// ---------------------------------------------------------------
// Factory de conveniencia
// ---------------------------------------------------------------

/**
 * Crea un MockSupabaseClient pre-cargado con fixtures.
 *
 * @example
 * const sb = createMockSupabase({
 *   requerimientos: [{ id: 'act-01', nombre_actividad: 'Taller', estado: 'generado' }],
 *   bitacora_entregas: [],
 * })
 */
export function createMockSupabase(fixtures: TableFixtures = {}): MockSupabaseClient {
  return new MockSupabaseClient(fixtures)
}
