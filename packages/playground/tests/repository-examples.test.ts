import { ccc } from "@ckb-ccc/connector-react";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RepositoryExamples } from "../src/app/components/RepositoryExamples";
import { EXAMPLES_REVISION, REPOSITORY_EXAMPLES } from "../src/app/examples";
import { execute } from "../src/app/execute";
import { MissingWalletError } from "../src/app/execute/wallet";

const pinnedBlobs: Record<string, string> = {
  "resolveDid.ts": "83190014bfcc63c9043cdc1f2a5570be4904e332",
  "didHistory.ts": "03132a1c94ea94e5f9e53c0c8cf09ae6785f896e",
  "queryBalance.ts": "c0ebbba6ca1cc41b84da4f40e88f8c33cc5e1240",
  "queryCells.ts": "0c6b821f039f72a5c3bf1711f1117be99b6713e6",
  "queryTransactions.ts": "6776b12008c05e48d8370fd9f48e0e8ef5ea46e3",
};
const script = ccc.Script.from({
  codeHash: `0x${"00".repeat(32)}`,
  hashType: "type",
  args: "0x",
});
const address = ccc.Address.from({ prefix: "ckt", script });
function fixture() {
  const client = {
    addressPrefix: "ckt",
    getBalanceSingle: vi.fn(async () => BigInt(100)),
    getBalance: vi.fn(async () => BigInt(100)),
    getKnownScript: vi.fn(async () => script),
    async *findCellsByLock() {},
    async *findCells() {},
    findSingletonCellByType: vi.fn(async () => undefined),
    async *findTransactionsByLock() {
      yield { txHash: `0x${"11".repeat(32)}`, blockNumber: BigInt(1) };
    },
    getTip: vi.fn(async () => BigInt(2)),
    getTipHeader: vi.fn(async () => ({
      hash: `0x${"22".repeat(32)}`,
      epoch: [BigInt(1), BigInt(0), BigInt(1)],
    })),
  } as unknown as ccc.Client;
  const signer = {
    client,
    getRecommendedAddress: vi.fn(async () => address.toString()),
    getRecommendedAddressObj: vi.fn(async () => address),
    getAddressObjs: vi.fn(async () => [address]),
    getBalance: vi.fn(async () => BigInt(100)),
    async *findCells() {},
  } as unknown as ccc.Signer;
  return { client, signer };
}

describe("maintained repository examples", () => {
  it.each(REPOSITORY_EXAMPLES)(
    "executes $file with read-only fixture APIs",
    async (example) => {
      const source = readFileSync(
        new URL(`../../examples/src/${example.file}`, import.meta.url),
        "utf8",
      );
      // Fail if the locally tested source drifts from the immutable served revision.
      expect(EXAMPLES_REVISION).toBe(
        "7095ccad564b94ea2e59284cb4a364aa3499252e",
      );
      expect(
        createHash("sha1")
          .update(`blob ${Buffer.byteLength(source)}\0`)
          .update(source)
          .digest("hex"),
      ).toBe(pinnedBlobs[example.file]);
      expect(example.sourceUrl).toContain(`/${EXAMPLES_REVISION}/`);
      expect(example.sourceUrl).toContain(
        `/packages/examples/src/${example.file}`,
      );
      const { client, signer } = fixture();
      const log = vi.fn();
      await execute(source, async () => {}, signer, log, client);
      expect(log).toHaveBeenCalled();
      expect(log.mock.calls.every(([level]) => level === "info")).toBe(true);
      await expect(
        execute(source, async () => {}, undefined, vi.fn(), client),
      ).rejects.toBeInstanceOf(MissingWalletError);
    },
  );
  it.each(["resolveDid.ts", "didHistory.ts"])(
    "executes %s with a real encoded DID fixture",
    async (file) => {
      const { client, signer } = fixture();
      const id = ccc.didCkb.didToArgs(
        "did:ckb:qq2m72a2vas4e5ovcpxoedscguuu4nba",
      );
      const cell = ccc.Cell.from({
        outPoint: { txHash: `0x${"33".repeat(32)}`, index: 0 },
        cellOutput: {
          capacity: ccc.fixedPointFrom(200),
          lock: script,
          type: { ...script, args: id },
        },
        outputData: ccc.hexFrom(
          ccc.didCkb.DidCkbData.fromV1({
            document: { id: "fixture" },
          }).toBytes(),
        ),
      });
      client.findSingletonCellByType = vi.fn(async () => cell);
      client.findCells = async function* () {
        yield cell;
      };
      client.getTransaction = vi.fn(async () =>
        ccc.ClientTransactionResponse.from({
          status: "committed",
          transaction: ccc.Transaction.from({
            outputs: [cell.cellOutput],
            outputsData: [cell.outputData],
          }),
          blockNumber: BigInt(1),
        }),
      );
      const source = readFileSync(
        new URL(`../../examples/src/${file}`, import.meta.url),
        "utf8",
      );
      const log = vi.fn();
      await execute(source, async () => {}, signer, log, client);
      const text = log.mock.calls.flat(2).map(String).join(" ");
      expect(text).toContain(
        file === "resolveDid.ts" ? "Address controls 1 DID" : "[CREATE]",
      );
      expect(log.mock.calls.every(([level]) => level === "info")).toBe(true);
    },
  );
  it("explains wallet/network and loading safety, disables repeated loads", () => {
    const html = renderToStaticMarkup(
      createElement(RepositoryExamples, { onLoad: vi.fn(), isLoading: true }),
    );
    expect(html).toContain("currently selected network");
    expect(html).toContain("do not sign or broadcast");
    expect(html).toContain("never runs code");
    expect(html.match(/disabled=""/g)).toHaveLength(REPOSITORY_EXAMPLES.length);
  });
});
