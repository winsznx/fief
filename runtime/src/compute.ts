/**
 * 0G Compute client: inference, receipt retrieval and local verification.
 *
 * The local verification here is the same check `RecordBook` performs on-chain,
 * run before we spend gas. It is deliberately NOT the SDK's `processResponse`:
 * that trusts the provider-returned `text` and only ecrecovers it, so a provider
 * signing over bytes it did not serve would pass. We recompute both hashes from
 * the actual request and response bytes (PRD v2 §4.4).
 */

import {ethers} from 'ethers';
import {createZGComputeNetworkBroker} from '@0gfoundation/0g-compute-ts-sdk';
import {recoverSigner, sha256Hex, signedText} from '@fief/reference';
import type {Address, Hex} from '@fief/reference';

import {MAX_TOKENS, ZG_MAINNET} from './config.js';

export interface Receipt {
  reqBody: string;
  respData: string;
  reqSha: Hex;
  respSha: Hex;
  signature: Hex;
  signerAddress: Address;
  providerText: string;
  chatId: string;
  finishReason: string | null;
  content: string | null;
}

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;

export class ComputeClient {
  private constructor(
    private readonly broker: Broker,
    readonly provider: Address,
    readonly model: string,
    private readonly endpoint: string,
  ) {}

  static async connect(privateKey: string, provider: Address): Promise<ComputeClient> {
    const rpc = new ethers.JsonRpcProvider(ZG_MAINNET.rpc);
    const wallet = new ethers.Wallet(privateKey, rpc);
    const broker = await createZGComputeNetworkBroker(wallet);
    const meta = await broker.inference.getServiceMetadata(provider);
    return new ComputeClient(broker, provider, meta.model, meta.endpoint);
  }

  /**
   * Build the exact request bytes, send them unmodified, and hash what we sent.
   *
   * The body is serialised once and passed as a string so fetch cannot
   * re-serialise it. If the bytes we hash differ by even one character from the
   * bytes the enclave hashes, the receipt never verifies, and that is precisely
   * the seam P0.2 proved holds on mainnet.
   */
  async infer(args: {commitLine: string; strategyPrompt: string; snapshotJson: string}): Promise<Receipt> {
    const body = {
      model: this.model,
      messages: [
        {role: 'system', content: `${args.strategyPrompt}\n${args.commitLine}`},
        {role: 'user', content: `Snapshot: ${args.snapshotJson}`},
      ],
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: false,
    };
    const reqBody = JSON.stringify(body);
    const reqSha = sha256Hex(reqBody);

    // `ServingRequestHeaders` is a sealed interface without an index signature,
    // so spread it through `unknown` rather than widening the SDK's type.
    const headers = (await this.broker.inference.getRequestHeaders(this.provider)) as unknown as Record<
      string,
      string
    >;
    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
      body: reqBody,
    });

    const respData = await res.text();
    const respSha = sha256Hex(respData);
    if (!res.ok) {
      throw new Error(`inference HTTP ${res.status}: ${respData.slice(0, 240)}`);
    }

    const parsed = JSON.parse(respData) as {
      id?: string;
      choices?: Array<{finish_reason?: string; message?: {content?: string}}>;
    };
    const chatId = res.headers.get('ZG-Res-Key') ?? parsed.id ?? '';
    const choice = parsed.choices?.[0];
    const finishReason = choice?.finish_reason ?? null;
    const content = choice?.message?.content ?? null;

    // A truncated response is a slot failure, never a decision. At a low token
    // budget a reasoning model returns finish_reason=length with a single
    // character of content, which looks exactly like the model refusing to
    // follow the output contract (PRD v2 §0.6.1 item 3).
    if (finishReason !== 'stop') {
      throw new Error(`inference finish_reason=${finishReason ?? 'null'}, not "stop"`);
    }

    const {signature, signerAddress, providerText} = await this.fetchReceipt(chatId);

    // The check the SDK does not do.
    const expectedText = signedText(reqSha, respSha);
    if (providerText !== expectedText) {
      throw new Error(
        `provider signed different bytes than it served:\n  ours: ${expectedText}\n  theirs: ${providerText}`,
      );
    }
    const recovered = recoverSigner(expectedText, signature);
    if (recovered.toLowerCase() !== signerAddress.toLowerCase()) {
      throw new Error(`recovered ${recovered} != advertised ${signerAddress}`);
    }

    return {
      reqBody,
      respData,
      reqSha,
      respSha,
      signature,
      signerAddress,
      providerText,
      chatId,
      finishReason,
      content,
    };
  }

  /** The signature can lag the response by a moment, so retry briefly. */
  private async fetchReceipt(
    chatId: string,
    attempts = 6,
  ): Promise<{signature: Hex; signerAddress: Address; providerText: string}> {
    const url = `${this.endpoint}/signature/${chatId}?model=${this.model}`;
    let lastErr = '';

    for (let i = 0; i < attempts; i += 1) {
      const res = await fetch(url);
      if (res.ok) {
        const j = (await res.json()) as {
          text: string;
          signature: string;
          signing_address: string;
          signing_algo?: string;
        };
        if (j.signing_algo !== undefined && j.signing_algo !== 'ecdsa') {
          throw new Error(`unexpected signing_algo ${j.signing_algo}`);
        }
        return {
          signature: (j.signature.startsWith('0x') ? j.signature : `0x${j.signature}`) as Hex,
          signerAddress: j.signing_address as Address,
          providerText: j.text,
        };
      }
      lastErr = `HTTP ${res.status}`;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
    throw new Error(`signature unavailable for chatId ${chatId}: ${lastErr}`);
  }
}
