import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'

type Json = Record<string, any>
export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

const SPEC_ID = 'https://namazvakti.app/openapi.json'
let cached: Json | undefined

/** Parses and returns the OpenAPI document (cached). */
export function loadSpec(): object {
  cached ??= parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8')) as Json
  return cached
}

let ajv: Ajv2020 | undefined
const validators = new Map<string, ReturnType<Ajv2020['compile']>>()

function getAjv(): Ajv2020 {
  if (!ajv) {
    ajv = new Ajv2020({ strict: false, allErrors: true })
    addFormats(ajv)
    // Register the whole document so `#/components/schemas/*` refs resolve.
    const doc = JSON.parse(JSON.stringify(loadSpec()).replaceAll('"$ref":"#/', `"$ref":"${SPEC_ID}#/`))
    ajv.addSchema(doc, SPEC_ID)
  }
  return ajv
}

/** Finds the JSON pointer of the response schema for an operation + status. */
function findSchemaPointer(operationId: string, status: number): string | undefined {
  const spec = loadSpec() as Json
  for (const [path, item] of Object.entries<Json>(spec.paths)) {
    for (const [method, op] of Object.entries<Json>(item)) {
      if (op?.operationId !== operationId) continue
      const esc = (s: string) => s.replaceAll('~', '~0').replaceAll('/', '~1')
      let base = `#/paths/${esc(path)}/${method}/responses/${status}`
      const res = op.responses?.[String(status)]
      if (!res) return undefined
      if (res.$ref) base = res.$ref
      return `${base}/content/application~1json/schema`
    }
  }
  return undefined
}

/** Validates `body` against the response schema of `operationId` + `status`. */
export function validateResponse(operationId: string, status: number, body: unknown): ValidationResult {
  const key = `${operationId}:${status}`
  let validate = validators.get(key)
  if (!validate) {
    const pointer = findSchemaPointer(operationId, status)
    if (!pointer) return { ok: false, errors: [`no response schema for ${operationId} ${status}`] }
    validate = getAjv().compile({ $ref: `${SPEC_ID}${pointer}` })
    validators.set(key, validate)
  }
  if (validate(body)) return { ok: true }
  return {
    ok: false,
    errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`),
  }
}
