import { ccc } from "@ckb-ccc/ccc";
import { sporeA } from "@ckb-ccc/spore/advanced";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { execute } from "../src/app/execute";

const lock = ccc.Script.from({
  codeHash: `0x${"11".repeat(32)}`,
  hashType: "type",
  args: "0x",
});
const type = ccc.Script.from({
  codeHash: `0x${"22".repeat(32)}`,
  hashType: "type",
  args: `0x${"33".repeat(32)}`,
});
const cell = (data: string, script = type) =>
  ccc.Cell.from({
    outPoint: { txHash: `0x${"44".repeat(32)}`, index: 0 },
    cellOutput: { lock, type: script, capacity: ccc.fixedPointFrom(200) },
    outputData: data,
  });
function fixture(cells: ccc.Cell[], prefix = "ckt") {
  const client = {
    addressPrefix: prefix,
    getKnownScript: async () => type,
    findSingletonCellByType: vi.fn(async () => undefined),
  } as unknown as ccc.Client;
  const signer = {
    client,
    getRecommendedAddress: async () => "public fixture",
    async *findCells() {
      yield* cells;
    },
  } as unknown as ccc.Signer;
  return { client, signer };
}
async function run(file: string, cells: ccc.Cell[], prefix?: string) {
  const { client, signer } = fixture(cells, prefix);
  const log = vi.fn(),
    render = vi.fn(async (..._values: unknown[]) => {});
  await execute(
    readFileSync(
      new URL(`../../examples/src/${file}`, import.meta.url),
      "utf8",
    ),
    render,
    signer,
    log,
    client,
  );
  expect(log.mock.calls.every(([level]) => level === "info")).toBe(true);
  return {
    log,
    render,
    client,
    text: log.mock.calls.flat(2).map(String).join(" "),
  };
}
describe("read-only asset examples", () => {
  it("aggregates raw xUDT by complete type and renders each token script", async () => {
    const other = ccc.Script.from({ ...type, args: `0x${"55".repeat(32)}` });
    const { log } = await run("queryXudt.ts", [
      cell("0x" + "01" + "00".repeat(15)),
      cell("0x" + "02" + "00".repeat(15)),
      cell("0x" + "04" + "00".repeat(15), other),
    ]);
    expect(log.mock.calls.flat(2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rawAmount: "3", cells: 2 }),
        expect.objectContaining({ rawAmount: "4", cells: 1 }),
      ]),
    );
    expect(
      log.mock.calls.flat(2).filter((value) => value instanceof ccc.Script),
    ).toHaveLength(2);
  });
  it("handles empty balances, malformed data and the scan bound explicitly", async () => {
    expect((await run("queryXudt.ts", [])).text).toContain("0 xUDT token");
    expect((await run("queryXudt.ts", [cell("0x01")])).text).toContain(
      "Skipped malformed",
    );
    expect(
      (
        await run(
          "queryXudt.ts",
          Array.from({ length: 101 }, () =>
            cell("0x" + "01" + "00".repeat(15)),
          ),
        )
      ).text,
    ).toContain("partial: stopped at 100");
  });
  it("renders owned Spore data as text and a Cell, never HTML", async () => {
    const data = ccc.hexFrom(
      sporeA.packRawSporeData({
        contentType: "text/html",
        content: ccc.bytesFrom(
          "<script>throw Error('unsafe')</script>",
          "utf8",
        ),
      }),
    );
    const result = await run("querySpores.ts", [cell(data)]);
    expect(
      result.log.mock.calls
        .flat(2)
        .filter((value) => value instanceof ccc.Cell),
    ).toHaveLength(1);
    expect(result.text).toContain("<script>");
    expect(result.text).not.toContain("Reading a public TESTNET sample");
  });
  it("labels an unavailable public testnet sample and does not fallback on mainnet", async () => {
    expect((await run("querySpores.ts", [])).text).toContain(
      "sample is no longer live",
    );
    const result = await run("querySpores.ts", [], "ckb");
    expect(result.text).not.toContain("public TESTNET sample");
    expect(result.client.findSingletonCellByType).not.toHaveBeenCalled();
  });
});
