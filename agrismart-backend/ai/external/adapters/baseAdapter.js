'use strict';

/**
 * ai/external/adapters/baseAdapter.js
 *
 * The contract every dataset adapter implements. An adapter is a pure
 * function of (raw file text, config) -> { provenance, records }. It
 * NEVER fetches network resources itself (network access is out of
 * scope for adapter code — see ai/external/README.md for why real
 * ingestion could not happen in this environment) and never writes to
 * AgriSmart's own Mongo collections.
 */

const { ProvenanceSchema } = require('../schemas/provenance.schema');
const { CanonicalRecordSchema } = require('../schemas/canonicalRecord.schema');

/**
 * Validates and returns a { provenance, records, rejected } result.
 * `rejected` collects rows that failed canonical-schema validation
 * (with the reason) rather than silently dropping them — visibility
 * into what didn't parse is part of the quality contract.
 */
function finalizeAdapterResult(provenanceInput, rawRecords) {
  const provenance = ProvenanceSchema.parse(provenanceInput);
  const records = [];
  const rejected = [];

  for (const raw of rawRecords) {
    const result = CanonicalRecordSchema.safeParse(raw);
    if (result.success) {
      records.push(result.data);
    } else {
      rejected.push({ raw, issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
  }

  return { provenance, records, rejected };
}

module.exports = { finalizeAdapterResult };
