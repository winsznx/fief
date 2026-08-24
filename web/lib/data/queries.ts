'use client';

import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { getDataSource } from './source';
import type { EntriesPage, ListingInput, MintInput, ResealInput } from './types';

/**
 * TanStack Query hooks over the DataSource (handoff §2: "no direct fetch in
 * components"). Every client-side read goes through here so swapping in
 * LiveDataSource requires no component changes.
 */

export const qk = {
  agents: ['agents'] as const,
  agent: (tokenId: string) => ['agent', tokenId] as const,
  entries: (tokenId: string) => ['entries', tokenId] as const,
  /** Keyed on txHash (v1.1 Q1) — a rejected entry has no index to key on. */
  entry: (txHash: string) => ['entry', txHash] as const,
  listing: (tokenId: string) => ['listing', tokenId] as const,
  ownerAgents: (address?: string) => ['owner-agents', address ?? null] as const,
  renterGrants: (address?: string) => ['renter-grants', address ?? null] as const,
  settlements: (tokenId: string) => ['settlements', tokenId] as const,
  auditGrants: (tokenId: string) => ['audit-grants', tokenId] as const,
  verify: (txHash: string) => ['verify', txHash] as const,
};

export function useAgents() {
  return useQuery({ queryKey: qk.agents, queryFn: () => getDataSource().listAgents() });
}

export function useAgent(tokenId: string) {
  return useQuery({
    queryKey: qk.agent(tokenId),
    queryFn: () => getDataSource().getAgent(tokenId),
  });
}

export function useListing(tokenId: string) {
  return useQuery({
    queryKey: qk.listing(tokenId),
    queryFn: () => getDataSource().getListing(tokenId),
  });
}

/** Paginated ledger reads. Page size is generous because rows are virtualized. */
export function useEntriesPage(tokenId: string, limit = 500) {
  return useInfiniteQuery<EntriesPage, Error, EntriesPage[], readonly unknown[], number>({
    queryKey: qk.entries(tokenId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getDataSource().getEntriesPage(tokenId, { limit, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages,
  });
}

export function useEntry(txHash: string) {
  return useQuery({
    queryKey: qk.entry(txHash),
    queryFn: () => getDataSource().getEntry(txHash),
  });
}

export function useOwnerAgents(address?: `0x${string}`) {
  return useQuery({
    queryKey: qk.ownerAgents(address),
    queryFn: () => (address ? getDataSource().getAgentsForOwner(address) : Promise.resolve([])),
    enabled: address !== undefined,
  });
}

export function useRenterGrants(address?: `0x${string}`) {
  return useQuery({
    queryKey: qk.renterGrants(address),
    queryFn: () => (address ? getDataSource().getGrantsForRenter(address) : Promise.resolve([])),
    enabled: address !== undefined,
  });
}

export function useSettlements(tokenId: string) {
  return useQuery({
    queryKey: qk.settlements(tokenId),
    queryFn: () => getDataSource().getSettlements(tokenId),
  });
}

export function useAuditGrants(tokenId: string) {
  return useQuery({
    queryKey: qk.auditGrants(tokenId),
    queryFn: () => getDataSource().getAuditGrants(tokenId),
  });
}

/* ── Stubbed mutations ────────────────────────────────────────────────────
   These call the mock DataSource actions. Wallet writes are the owner's half
   (handoff §11) — no component touches a contract.
   ------------------------------------------------------------------------ */

export function useRent(tokenId: string) {
  return useMutation({
    mutationFn: (escrowWei: string) => getDataSource().rent(tokenId, escrowWei),
  });
}

export function useMintAgent() {
  return useMutation({ mutationFn: (input: MintInput) => getDataSource().mintAgent(input) });
}

export function useSetOperator(tokenId: string) {
  return useMutation({
    mutationFn: (operator: `0x${string}`) => getDataSource().setOperator(tokenId, operator),
  });
}

export function useReseal(tokenId: string) {
  return useMutation({
    mutationFn: (input: ResealInput) => getDataSource().reseal(tokenId, input),
  });
}

export function useSetListing(tokenId: string) {
  return useMutation({
    mutationFn: (input: ListingInput) => getDataSource().setListing(tokenId, input),
  });
}

export function useSettle(tokenId: string) {
  return useMutation({
    mutationFn: (entryIndices: number[]) => getDataSource().settle(tokenId, entryIndices),
  });
}

export function useGrantAudit(tokenId: string) {
  return useMutation({
    mutationFn: (auditor: `0x${string}`) => getDataSource().grantAudit(tokenId, auditor),
  });
}

export function useRevokeAudit(tokenId: string) {
  return useMutation({
    mutationFn: (auditor: `0x${string}`) => getDataSource().revokeAudit(tokenId, auditor),
  });
}
