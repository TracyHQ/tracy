// The tool results of the brand bench (brand step trial bench, #320; migration 196, table brand_tool_result): each
// answer a tool gives is saved before it goes back to the agent loop, so a run that resumes after a crash answers a
// tool call it already made from the saved result instead of calling the tool (and paying for its drawing or
// reviewer question) again.
import { fenced, json } from './brand-sql.js'

/** The saved result of a tool call, or null. `key` is { runId, turn, tool, argsSha, seq }. */
export async function savedToolResult(pool, { runId, turn, tool, argsSha, seq }) {
  const { rows } = await pool.query(
    `select result from brand_tool_result
     where run_id = $1 and turn = $2 and tool = $3 and args_sha256 = $4 and seq = $5`,
    [runId, turn, tool, argsSha, seq]
  )
  return rows[0]?.result ?? null
}

/** Save the result of a tool call once. False when nothing was written: a stale lease. */
export async function saveToolResult(pool, { runId, turn, tool, argsSha, seq, result, leaseToken = null }) {
  const { rowCount } = await pool.query(
    `insert into brand_tool_result (run_id, turn, tool, args_sha256, seq, result)
     select $1::uuid, $2::int, $3::text, $4::text, $5::int, $6::jsonb
     where ${fenced(1, 7)}
     on conflict do nothing`,
    [runId, turn, tool, argsSha, seq, json(result), leaseToken]
  )
  return rowCount === 1
}
