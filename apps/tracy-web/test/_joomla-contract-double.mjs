/** Site state needed by the real plugin validator, shared by every Apply-door double. */
import { readFileSync } from 'node:fs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { applyContractWrite } from './_joomla-plugin-validator.mjs'

/** @param {{ contractRefusals?: any[], contractRows?: Record<string, any>, contractFiles?: Record<string, string> }} seen @param {(message: string) => void} fail */
export function contractDouble(seen, fail) {
  const states = new Map()
  const stateOf = (key) => {
    if (!states.has(key))
      states.set(key, {
        slots: null,
        files: { ...seen.contractFiles },
        rows: structuredClone(seen.contractRows ?? {})
      })
    return states.get(key)
  }
  const remember = (state, kind, row) => {
    if (row && row.id !== undefined) {
      const key = `${kind}-${row.id}`
      state.rows[key] = { ...state.rows[key], ...row }
    }
  }
  const validate = (state, params, inspect = false) => {
    let result
    try {
      result = applyContractWrite({
        slots: state.slots,
        params,
        files: state.files,
        rows: state.rows,
        inspect
      })
    } catch (error) {
      fail(error.message)
      throw error
    }
    const { errors } = result
    if (!errors.length) return { rows: result.rows }
    if (seen.contractRefusals) seen.contractRefusals.push(...errors)
    else fail(errors.map((error) => `${error.code}: ${error.message}`).join('; '))
    return {
      refused: {
        ok: false,
        error: 'contract_failed',
        message: errors.map((error) => error.message).join('; '),
        errors
      }
    }
  }
  return async (apply, call) => {
    const state = stateOf(call.siteKey ?? '')
    const { action, params = {} } = call
    let writtenRows
    if (action === 'content.contract' && params.operation === 'apply' && state.slots) {
      const result = validate(state, params)
      if (result.refused) return result.refused
      writtenRows = result.rows
    }
    const answer = await apply(call)
    if (!answer?.ok) return answer
    if (writtenRows) state.rows = writtenRows
    if (action === 'content.contract' && params.operation === 'inspect') {
      const joomla =
        /(?:^|\/)j\d(?:\/|$)/.test(answer.contract ?? '') ||
        answer.slots?.some((slot) => /^(module|menuItem|article)-/.test(slot.entity ?? slot.key))
      if (joomla && Array.isArray(answer.slots)) {
        if (!state.slots) {
          const id = String(answer.contract ?? '')
          const cut = id.lastIndexOf('/')
          const contract = contractFor(defaultContracts(), id.slice(0, cut), id.slice(cut + 1))
          if (contract) {
            const lock = JSON.parse(readFileSync(`${contract.dir}/presentation-lock.json`, 'utf8'))
            for (const [key, row] of Object.entries(lock.entities ?? {}))
              state.rows[key] = { ...row, ...state.rows[key] }
          }
        }
        state.slots = answer.slots
        const result = validate(state, {}, true)
        if (result.refused) return result.refused
      }
    }
    if (action === 'media.upload' && params.path && params.content_b64)
      state.files[params.path] = params.content_b64
    if (action === 'content.get') remember(state, params.kind, answer.item)
    if (action === 'content.list') for (const row of answer.items ?? []) remember(state, params.kind, row)
    if (action === 'content.update') remember(state, params.kind, { id: params.id, ...params.fields })
    if (action === 'content.batch')
      for (const op of params.operations ?? []) remember(state, op.kind, { id: op.id, ...op.fields })
    return answer
  }
}
