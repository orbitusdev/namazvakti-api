import { migrate } from '@namazvakti/db'
import { createDbFromEnv } from '../src/server/context'

async function main() {
  await migrate(createDbFromEnv())
  console.log('migrations applied')
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
