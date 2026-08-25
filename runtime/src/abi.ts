/**
 * Minimal ABIs for the Fief contracts.
 *
 * Hand-written rather than imported from the Foundry artifacts so the runtime
 * has no build-order dependency on `contracts/out`. The Foundry suite is what
 * guarantees these signatures are right; a drift shows up immediately as a
 * decode failure on the first call.
 */

export const fiefAgentAbi = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      {name: 'strategyHash', type: 'bytes32'},
      {name: 'storageRoot', type: 'bytes32'},
      {name: 'domain', type: 'string'},
    ],
    outputs: [{name: 'agentId', type: 'uint256'}],
  },
  {
    type: 'function',
    name: 'setOperator',
    stateMutability: 'nonpayable',
    inputs: [{name: 'agentId', type: 'uint256'}, {name: 'operator', type: 'address'}],
    outputs: [],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{name: 'agentId', type: 'uint256'}],
    outputs: [{type: 'address'}],
  },
  {
    type: 'function',
    name: 'strategyHashOf',
    stateMutability: 'view',
    inputs: [{name: 'agentId', type: 'uint256'}],
    outputs: [{type: 'bytes32'}],
  },
  {
    type: 'function',
    name: 'nextAgentId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{type: 'uint256'}],
  },
] as const;

const epochSpecComponents = [
  {name: 'market', type: 'bytes32'},
  {name: 'cadenceSeconds', type: 'uint32'},
  {name: 'horizonSeconds', type: 'uint32'},
  {name: 'maxCommitDelay', type: 'uint32'},
  {name: 'disclosureDelay', type: 'uint32'},
  {name: 'startTime', type: 'uint64'},
  {name: 'slotCount', type: 'uint32'},
  {name: 'strategyHash', type: 'bytes32'},
  {name: 'providerSetHash', type: 'bytes32'},
] as const;

export const epochBookAbi = [
  {
    type: 'function',
    name: 'openEpoch',
    stateMutability: 'nonpayable',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'spec', type: 'tuple', components: epochSpecComponents},
      {name: 'providers', type: 'address[]'},
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pinProviders',
    stateMutability: 'nonpayable',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'providers', type: 'address[]'},
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'slotSnapshotTime',
    stateMutability: 'view',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'slot', type: 'uint32'},
    ],
    outputs: [{type: 'uint64'}],
  },
  {
    type: 'function',
    name: 'slotCommitDeadline',
    stateMutability: 'view',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'slot', type: 'uint32'},
    ],
    outputs: [{type: 'uint64'}],
  },
  {
    type: 'function',
    name: 'slotRevealOpen',
    stateMutability: 'view',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'slot', type: 'uint32'},
    ],
    outputs: [{type: 'uint64'}],
  },
  {
    type: 'function',
    name: 'finalizeAfter',
    stateMutability: 'view',
    inputs: [{name: 'agentId', type: 'uint256'}, {name: 'epochId', type: 'uint64'}],
    outputs: [{type: 'uint64'}],
  },
  {
    type: 'function',
    name: 'finalizeEpoch',
    stateMutability: 'nonpayable',
    inputs: [{name: 'agentId', type: 'uint256'}, {name: 'epochId', type: 'uint64'}],
    outputs: [
      {name: 'committed', type: 'uint32'},
      {name: 'revealed', type: 'uint32'},
      {name: 'missed', type: 'uint32'},
      {name: 'invalid', type: 'uint32'},
    ],
  },
  {
    type: 'function',
    name: 'completenessBps',
    stateMutability: 'view',
    inputs: [{name: 'agentId', type: 'uint256'}, {name: 'epochId', type: 'uint64'}],
    outputs: [{type: 'uint32'}],
  },
  {
    type: 'function',
    name: 'metaOf',
    stateMutability: 'view',
    inputs: [{name: 'agentId', type: 'uint256'}, {name: 'epochId', type: 'uint64'}],
    outputs: [
      {
        type: 'tuple',
        components: [
          {name: 'opened', type: 'bool'},
          {name: 'openedAt', type: 'uint64'},
          {name: 'abandonedAt', type: 'uint64'},
          {name: 'finalized', type: 'bool'},
          {name: 'committedCount', type: 'uint32'},
          {name: 'revealedCount', type: 'uint32'},
        ],
      },
    ],
  },
] as const;

export const recordBookAbi = [
  {
    type: 'function',
    name: 'commitDecision',
    stateMutability: 'nonpayable',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'slot', type: 'uint32'},
      {name: 'reqSha', type: 'bytes32'},
      {name: 'respSha', type: 'bytes32'},
      {name: 'receiptCommit', type: 'bytes32'},
      {name: 'provider', type: 'address'},
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revealDecision',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'a',
        type: 'tuple',
        components: [
          {name: 'agentId', type: 'uint256'},
          {name: 'epochId', type: 'uint64'},
          {name: 'slot', type: 'uint32'},
          {name: 'respData', type: 'bytes'},
          {name: 'signature', type: 'bytes'},
          {name: 'commitOffset', type: 'uint32'},
          {name: 'inputHash', type: 'bytes32'},
          {name: 'renter', type: 'address'},
          {name: 'salt', type: 'bytes32'},
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'revealDecisionStrict',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'a',
        type: 'tuple',
        components: [
          {name: 'agentId', type: 'uint256'},
          {name: 'epochId', type: 'uint64'},
          {name: 'slot', type: 'uint32'},
          {name: 'respData', type: 'bytes'},
          {name: 'signature', type: 'bytes'},
          {name: 'commitOffset', type: 'uint32'},
          {name: 'inputHash', type: 'bytes32'},
          {name: 'renter', type: 'address'},
          {name: 'salt', type: 'bytes32'},
        ],
      },
    ],
    outputs: [{name: 'ok', type: 'bool'}],
  },
  {
    type: 'function',
    name: 'expectedCommitBytes',
    stateMutability: 'view',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'slot', type: 'uint32'},
      {name: 'strategyHash', type: 'bytes32'},
      {name: 'inputHash', type: 'bytes32'},
      {name: 'renter', type: 'address'},
    ],
    outputs: [{type: 'bytes'}],
  },
  {
    type: 'function',
    name: 'expectedTeeSigner',
    stateMutability: 'view',
    inputs: [{name: 'provider', type: 'address'}],
    outputs: [{type: 'address'}],
  },
  {
    type: 'function',
    name: 'pinSigner',
    stateMutability: 'nonpayable',
    inputs: [
      {name: 'provider', type: 'address'},
      {name: 'signer', type: 'address'},
      {name: 'evidenceURI', type: 'string'},
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isRevealed',
    stateMutability: 'view',
    inputs: [
      {name: 'agentId', type: 'uint256'},
      {name: 'epochId', type: 'uint64'},
      {name: 'slot', type: 'uint32'},
    ],
    outputs: [{type: 'bool'}],
  },
  {type: 'error', name: 'SlotDeadlinePassed', inputs: []},
  {type: 'error', name: 'BadCommit', inputs: []},
  {type: 'error', name: 'BadReveal', inputs: []},
  {type: 'error', name: 'BadSigner', inputs: []},
  {type: 'error', name: 'BadHash', inputs: []},
  {type: 'error', name: 'RevealTooEarly', inputs: []},
  {type: 'error', name: 'NotOperator', inputs: []},
  {type: 'error', name: 'SlotAlreadyCommitted', inputs: []},
  {type: 'error', name: 'ProviderNotPinned', inputs: []},
  {type: 'error', name: 'NoCommit', inputs: []},
  {type: 'error', name: 'AlreadyRevealed', inputs: []},
] as const;
