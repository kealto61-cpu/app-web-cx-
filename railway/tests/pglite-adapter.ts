// Match the small postgres.js surface used by the application, backed by a real
// PostgreSQL engine in memory. Intended exclusively for simulated tests.
export function pgliteAdapter(connection: any): any {
  return {
    async unsafe(statement: string, params: unknown[] = []) {
      if (!params.length && statement.trim().split(';').filter(x => x.trim()).length > 1) {
        const results = await connection.exec(statement);
        return results[results.length - 1]?.rows || [];
      }
      return (await connection.query(statement, params)).rows;
    },
    async begin(callback: (transaction: any) => Promise<unknown>) {
      return connection.transaction((transaction: any) => callback(pgliteAdapter(transaction)));
    },
    // Shared in-memory adapters must not close the engine after setupSql.end().
    async end() {},
  };
}
