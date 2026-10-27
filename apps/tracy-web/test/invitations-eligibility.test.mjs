import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluateEligibility } from '../src/invitations/eligibility.js'

const NOW = '2026-10-08T12:00:00.000Z'
const SOURCES = ['membership', 'marketingBasis', 'amember', 'sendy', 'tracy']

function input() {
  const values = {
    membership: { eligible: true, expiresAt: '2026-10-09T12:00:00.000Z', lifetime: false },
    marketingBasis: 'allowed',
    amember: { globalUnsubscribed: false },
    sendy: { state: 'clear', coverage: ['list-a', 'list-b'] },
    tracy: { suppressed: false }
  }
  return {
    candidate: {
      normalizedEmail: 'fixture@example.test',
      identities: [{ source: 'amember', memberId: 'member-a' }],
      sourceGroup: 'group-a',
      suggestedGroup: null,
      state: 'recheck',
      negativeAssertions: { globalUnsubscribed: false, internal: false },
      personalization: { first_name: 'Fixture' }
    },
    currentFacts: Object.fromEntries(
      SOURCES.map((source) => [
        source,
        {
          status: 'known',
          value: values[source],
          sourceVersion: `${source}-v1`,
          asOf: '2026-10-08T11:55:00.000Z',
          checkedAt: '2026-10-08T11:59:00.000Z',
          validUntil: '2026-10-08T12:20:00.000Z',
          evidenceRefs: [`evidence-${source}`],
          memberIds: ['member-a']
        }
      ])
    ),
    knownSuppressions: [],
    policy: { version: 'fixture-v1', maxAgeMs: 600_000, requiredSendyCoverage: ['list-a', 'list-b'] },
    now: NOW
  }
}

test('complete current evidence allows eligibility only until its earliest deadline', () => {
  const result = evaluateEligibility(input())
  assert.deepEqual(result, {
    state: 'ready',
    reasons: [],
    policyVersion: 'fixture-v1',
    sourceVersions: {
      membership: 'membership-v1',
      marketingBasis: 'marketingBasis-v1',
      amember: 'amember-v1',
      sendy: 'sendy-v1',
      tracy: 'tracy-v1'
    },
    checkedAt: NOW,
    validUntil: '2026-10-08T12:05:00.000Z',
    evidenceRefs: [
      'evidence-amember',
      'evidence-marketingBasis',
      'evidence-membership',
      'evidence-sendy',
      'evidence-tracy'
    ]
  })
})

for (const source of SOURCES) {
  for (const [issue, change] of [
    [
      'missing',
      (facts) => {
        delete facts[source]
      }
    ],
    [
      'unknown',
      (facts) => {
        facts[source].status = 'unknown'
      }
    ],
    [
      'stale asOf',
      (facts) => {
        facts[source].asOf = '2026-10-08T11:50:00.000Z'
      }
    ],
    [
      'stale checkedAt',
      (facts) => {
        facts[source].asOf = facts[source].checkedAt = '2026-10-08T11:49:00.000Z'
      }
    ],
    [
      'future',
      (facts) => {
        facts[source].checkedAt = '2026-10-08T12:01:00.000Z'
      }
    ],
    [
      'reversed time',
      (facts) => {
        facts[source].asOf = NOW
      }
    ],
    [
      'expired deadline',
      (facts) => {
        facts[source].validUntil = NOW
      }
    ],
    [
      'non UTC',
      (facts) => {
        facts[source].asOf = '2026-10-08T11:55:00+00:00'
      }
    ],
    [
      'impossible date',
      (facts) => {
        facts[source].asOf = '2026-02-30T11:55:00.000Z'
      }
    ],
    [
      'missing source version',
      (facts) => {
        delete facts[source].sourceVersion
      }
    ],
    [
      'missing evidence',
      (facts) => {
        facts[source].evidenceRefs = []
      }
    ],
    [
      'member coverage',
      (facts) => {
        facts[source].memberIds = []
      }
    ]
  ]) {
    test(`${source} ${issue} evidence cannot authorize readiness`, () => {
      const data = input()
      change(data.currentFacts)
      assert.equal(evaluateEligibility(data).state, 'recheck')
    })
  }
}

for (const [source, value] of [
  ['membership', { eligible: 'true', expiresAt: null, lifetime: true }],
  ['membership', { eligible: true, expiresAt: null, lifetime: false }],
  ['membership', { eligible: true, expiresAt: 'invalid', lifetime: false }],
  ['membership', { paid: true, expiresAt: '2026-10-09T12:00:00.000Z', lifetime: false }],
  ['marketingBasis', 'unknown'],
  ['marketingBasis', 'yes'],
  ['amember', {}],
  ['sendy', { state: 'unknown', coverage: ['list-a', 'list-b'] }],
  ['sendy', { state: 'clear', coverage: ['list-a'] }],
  ['sendy', { state: 'clear', coverage: 'list-a' }],
  ['tracy', {}]
]) {
  test(`${source} value ${JSON.stringify(value)} cannot authorize readiness`, () => {
    const data = input()
    data.currentFacts[source].value = value
    assert.equal(evaluateEligibility(data).state, 'recheck')
  })
}

for (const [source, value, reason] of [
  ['marketingBasis', 'denied', 'MARKETING_BASIS_DENIED'],
  ['amember', { globalUnsubscribed: true }, 'AMEMBER_GLOBAL_UNSUBSCRIBED'],
  ['sendy', { state: 'unsubscribed', coverage: [] }, 'SENDY_UNSUBSCRIBED'],
  ['sendy', { state: 'bounced', coverage: [] }, 'SENDY_BOUNCED'],
  ['sendy', { state: 'complained', coverage: [] }, 'SENDY_COMPLAINED'],
  ['tracy', { suppressed: true }, 'TRACY_SUPPRESSED']
]) {
  test(`known ${source} negative survives stale incomplete evidence`, () => {
    const data = input()
    data.currentFacts[source].value = value
    data.currentFacts[source].asOf = '2025-10-08T12:00:00.000Z'
    data.currentFacts[source].memberIds = []
    data.currentFacts.membership.value.eligible = false
    const result = evaluateEligibility(data)
    assert.equal(result.state, 'suppressed')
    assert.ok(result.reasons.includes(reason))
    assert.equal(result.validUntil, null)
  })
}

test('previously known recipient suppression outranks all clear facts', () => {
  const data = input()
  data.knownSuppressions = [{ reason: 'prior opt-out fixture', evidenceRef: 'historic-evidence' }]
  const result = evaluateEligibility(data)
  assert.equal(result.state, 'suppressed')
  assert.ok(result.evidenceRefs.includes('historic-evidence'))
  assert.ok(!JSON.stringify(result.reasons).includes('prior opt-out fixture'))
})

for (const flag of ['globalUnsubscribed', 'internal']) {
  test(`preview ${flag} assertion survives fresh clear facts`, () => {
    const data = input()
    data.candidate.negativeAssertions[flag] = true
    assert.equal(evaluateEligibility(data).state, 'suppressed')
  })
}

test('known ineligibility outranks missing evidence', () => {
  const data = input()
  data.currentFacts.membership.value.eligible = false
  delete data.currentFacts.sendy
  assert.equal(evaluateEligibility(data).state, 'ineligible')
})

test('membership expires at the supplied clock boundary', () => {
  const data = input()
  data.currentFacts.membership.value.expiresAt = NOW
  assert.equal(evaluateEligibility(data).state, 'ineligible')
  data.currentFacts.membership.value.expiresAt = '2026-10-08T12:00:01.000Z'
  const result = evaluateEligibility(data)
  assert.equal(result.state, 'ready')
  assert.equal(result.validUntil, '2026-10-08T12:00:01.000Z')
})

test('explicit lifetime membership permits null expiry', () => {
  const data = input()
  data.currentFacts.membership.value = { eligible: true, lifetime: true, expiresAt: null }
  assert.equal(evaluateEligibility(data).state, 'ready')
})

test('each fact must cover every member identity sharing a recipient', () => {
  for (const source of SOURCES) {
    const data = input()
    data.candidate.identities.push({ source: 'amember', memberId: 'member-b' })
    for (const fact of Object.values(data.currentFacts)) fact.memberIds.push('member-b')
    data.currentFacts[source].memberIds = ['member-a']
    assert.equal(evaluateEligibility(data).state, 'recheck', source)
  }
})

for (const [issue, change] of [
  [
    'missing candidate',
    (data) => {
      delete data.candidate
    }
  ],
  [
    'missing suppression ledger',
    (data) => {
      delete data.knownSuppressions
    }
  ],
  [
    'malformed suppression ledger',
    (data) => {
      data.knownSuppressions = [{}]
    }
  ],
  [
    'missing facts',
    (data) => {
      delete data.currentFacts
    }
  ],
  [
    'missing identity',
    (data) => {
      data.candidate.identities = []
    }
  ],
  [
    'malformed identity',
    (data) => {
      data.candidate.identities = [{ source: 'amember' }]
    }
  ],
  [
    'email not normalized',
    (data) => {
      data.candidate.normalizedEmail = ' FIXTURE@example.test '
    }
  ],
  [
    'missing preview assertions',
    (data) => {
      delete data.candidate.negativeAssertions
    }
  ],
  [
    'candidate conflict',
    (data) => {
      data.candidate.state = 'conflict'
    }
  ],
  [
    'previous candidate suppression',
    (data) => {
      data.candidate.state = 'suppressed'
    }
  ],
  [
    'candidate review flag',
    (data) => {
      data.candidate.needsReview = true
    }
  ],
  [
    'invalid candidate review flag',
    (data) => {
      data.candidate.needsReview = 'false'
    }
  ]
]) {
  test(`${issue} cannot silently become ready`, () => {
    const data = input()
    change(data)
    assert.ok(['recheck', 'suppressed'].includes(evaluateEligibility(data).state))
  })
}

test('an unresolved source group requires review even when evidence is complete', () => {
  const data = input()
  data.candidate.sourceGroup = null
  const result = evaluateEligibility(data)
  assert.equal(result.state, 'recheck')
  assert.ok(result.reasons.includes('CANDIDATE_GROUP_MISSING'))
})

for (const email of [
  'fi,xture@example.test',
  'fixture\u0000@example.test',
  'fixture\u007f@example.test',
  'fixture<name@example.test',
  'fixture;name@example.test',
  'fixture@example.c',
  'fixture@example.123'
]) {
  test('malformed recipient envelope cannot become ready', () => {
    const data = input()
    data.candidate.normalizedEmail = email
    assert.equal(evaluateEligibility(data).state, 'recheck')
  })
}

test('a suggested group never silently replaces an operator decision', () => {
  const data = input()
  data.candidate.suggestedGroup = 'other-group'
  assert.equal(evaluateEligibility(data).state, 'recheck')
})

for (const [issue, change] of [
  [
    'identity',
    (data) => {
      data.candidate.identities = Array(1)
    }
  ],
  [
    'evidence',
    (data) => {
      data.currentFacts.tracy.evidenceRefs = Array(1)
    }
  ],
  [
    'policy',
    (data) => {
      data.policy.requiredSendyCoverage = Array(1)
    }
  ]
]) {
  test(`sparse ${issue} array does not count as supplied evidence`, () => {
    const data = input()
    change(data)
    if (issue === 'policy') assert.throws(() => evaluateEligibility(data), { code: 'INVALID_POLICY' })
    else assert.equal(evaluateEligibility(data).state, 'recheck')
  })
}

test('known suppression remains decisive when candidate and source timestamps are malformed', () => {
  const data = input()
  delete data.candidate
  data.currentFacts.sendy.value = { state: 'complained' }
  data.currentFacts.sendy.asOf = 'invalid'
  assert.equal(evaluateEligibility(data).state, 'suppressed')
})

test('invalid unknown-status negatives remain unknown until confirmed', () => {
  const data = input()
  data.currentFacts.amember.status = 'unknown'
  data.currentFacts.amember.value.globalUnsubscribed = true
  assert.equal(evaluateEligibility(data).state, 'recheck')
})

test('ready TTL respects every source deadline', () => {
  for (const source of SOURCES) {
    const data = input()
    data.currentFacts[source].validUntil = '2026-10-08T12:02:00.000Z'
    assert.equal(evaluateEligibility(data).validUntil, '2026-10-08T12:02:00.000Z')
  }
})

for (const change of [
  (data) => {
    delete data.policy
  },
  (data) => {
    data.policy.version = ''
  },
  (data) => {
    data.policy.maxAgeMs = 0
  },
  (data) => {
    data.policy.maxAgeMs = Infinity
  },
  (data) => {
    data.policy.maxAgeMs = '600000'
  },
  (data) => {
    data.policy.requiredSendyCoverage = []
  },
  (data) => {
    data.policy.requiredSendyCoverage = ['list-a', 'list-a']
  },
  (data) => {
    data.policy.requiredSendyCoverage = ['']
  }
]) {
  test('invalid policy fails explicitly without leaking recipient information', () => {
    const data = input()
    change(data)
    assert.throws(() => evaluateEligibility(data), { code: 'INVALID_POLICY', message: 'INVALID_POLICY' })
  })
}

for (const now of [
  undefined,
  0,
  'invalid',
  '2026-02-30T12:00:00.000Z',
  '2026-10-08T24:00:00.000Z',
  '2026-10-08T12:00:00+00:00'
]) {
  test(`invalid clock ${String(now)} fails explicitly`, () => {
    const data = input()
    data.now = now
    assert.throws(() => evaluateEligibility(data), { code: 'INVALID_CLOCK', message: 'INVALID_CLOCK' })
  })
}

test('submillisecond freshness cannot produce readiness with a serialized expired deadline', () => {
  const data = input()
  data.policy.maxAgeMs = 0.5
  for (const fact of Object.values(data.currentFacts)) {
    fact.asOf = NOW
    fact.checkedAt = NOW
  }
  const result = evaluateEligibility(data)
  assert.equal(result.state, 'recheck')
  assert.ok(result.reasons.includes('VALIDITY_WINDOW_EXPIRED'))
  assert.equal(result.validUntil, null)
})

test('evaluation is deterministic and leaves frozen inputs untouched', () => {
  const data = input()
  const snapshot = structuredClone(data)
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze)
      Object.freeze(value)
    }
  }
  freeze(data)
  assert.deepEqual(evaluateEligibility(data), evaluateEligibility(data))
  assert.deepEqual(data, snapshot)
})
