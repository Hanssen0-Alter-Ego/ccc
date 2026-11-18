// Read-only: group standard xUDT cells by their full type script.
// The original Playground example wallet has xUDT on TESTNET.
import { ccc } from "@ckb-ccc/ccc";
import { render, signer } from "@ckb-ccc/playground";

console.log("xUDT owner:", await signer.getRecommendedAddress());
const type = await ccc.Script.fromKnownScript(
  signer.client,
  ccc.KnownScript.XUdt,
  "0x",
);
const balances = new Map<
  string,
  { type: ccc.Script; amount: bigint; cells: number }
>();
let count = 0;
let truncated = false;
for await (const cell of signer.findCells({ script: type }, true)) {
  if (count >= 100) {
    truncated = true;
    break;
  }
  count++;
  const token = cell.cellOutput.type!;
  if (token.codeHash !== type.codeHash || token.hashType !== type.hashType)
    continue;
  if (ccc.bytesFrom(cell.outputData).length < 16) {
    console.log("Skipped malformed xUDT amount:", cell.outPoint);
    continue;
  }
  const key = token.hash();
  const group = balances.get(key) ?? {
    type: token,
    amount: BigInt(0),
    cells: 0,
  };
  group.amount += ccc.udtBalanceFrom(cell.outputData);
  group.cells++;
  balances.set(key, group);
}
for (const [typeHash, balance] of balances) {
  console.log({
    typeHash,
    rawAmount: balance.amount.toString(),
    cells: balance.cells,
  });
  await render(balance.type);
}
console.log(
  `${balances.size} xUDT token type(s), ${count} cells scanned${truncated ? " (partial: stopped at 100 cells)" : ""}.`,
);
console.log(
  "Amounts are raw integer units; token decimals/symbols are not inferred. This does not enumerate custom xUDT deployments.",
);
