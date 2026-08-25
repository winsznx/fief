/**
 * Fief reference model (PRD v2 §11).
 *
 * Pure TypeScript, zero chain deps. This package is the specification until
 * execution disproves it: the Foundry suite imports the fixtures this package
 * generates and must never restate expected values inline.
 */

export * from './types.js';
export * from './commit.js';
export * from './receipt.js';
export * from './epoch.js';
export * from './recordbook.js';
export * from './rental.js';
export * from './score.js';
