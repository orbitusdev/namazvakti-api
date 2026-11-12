import { createRepo } from '@namazvakti/db'
import { createDbFromEnv, createSourceFromEnv } from '../src/server/context'
import { syncPlaces } from '../src/server/place-sync'

// Runs in its own process, so there is no in-memory place cache to invalidate; the server's cache
// refreshes on the next cron sync or restart.
async function main() {
  await syncPlaces(createRepo(createDbFromEnv()), createSourceFromEnv())
  console.log('places synced')
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
