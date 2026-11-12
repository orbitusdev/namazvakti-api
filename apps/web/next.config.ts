import type { NextConfig } from 'next'

const config: NextConfig = {
  // Native/driver packages must not be bundled (PGlite loads its wasm/data files at runtime).
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  transpilePackages: ['@namazvakti/core', '@namazvakti/db', '@namazvakti/diyanet-client'],
}

export default config
