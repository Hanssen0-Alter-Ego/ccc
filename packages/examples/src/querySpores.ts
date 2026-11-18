// Read-only standard Spore V2 inspection. No external content is executed.
import { ccc } from "@ckb-ccc/ccc";
import { render, signer } from "@ckb-ccc/playground";

const client = signer.client;
const scriptInfo = ccc.spore.getSporeScriptInfo(client);
console.log("Spore owner:", await signer.getRecommendedAddress());
let count = 0;
async function show(
  result: NonNullable<Awaited<ReturnType<typeof ccc.spore.findSpore>>>,
) {
  const { cell, sporeData } = result;
  console.log({
    id: cell.cellOutput.type?.args,
    contentType: sporeData.contentType,
    contentBytes: ccc.bytesFrom(sporeData.content).length,
    outPoint: cell.outPoint,
  });
  // Text preview only: no HTML, SVG, scripts, DOB renderer or remote URLs are executed.
  if (
    sporeData.contentType.startsWith("text/") ||
    sporeData.contentType === "dob/0" ||
    sporeData.contentType === "application/json"
  ) {
    console.log(
      "Content preview (max 2,000 bytes):",
      ccc.bytesTo(ccc.bytesFrom(sporeData.content).slice(0, 2000), "utf8"),
    );
  }
  await render(cell);
}
for await (const result of ccc.spore.findSporesBySigner({
  signer,
  scriptInfos: [scriptInfo],
  limit: 5,
})) {
  await show(result);
  if (++count >= 5) {
    break;
  }
}
console.log(`Displayed ${count} owned Spore V2 cell(s), at most 5.`);
if (count === 0 && client.addressPrefix === "ckt") {
  // Public TESTNET example, not owned by the selected wallet.
  // Verified live via the testnet indexer; may later be transferred or melted.
  // https://testnet.explorer.nervos.org/transaction/0xaf0e27b58f9131b1e6fd1080e680854794437ba08f9939c74de2cd42748dd395
  const id =
    "0xffffb305f0519f378389c5833fe4b001262e415e2336005e536555ce0f92e330";
  console.log(
    "No owned Spore V2 found. Reading a public TESTNET sample (not your asset):",
    id,
  );
  const sample = await ccc.spore.findSpore(client, id, [scriptInfo]);
  if (sample) {
    await show(sample);
  } else {
    console.log(
      "The public sample is no longer live. Replace its ID with a current testnet Spore V2.",
    );
  }
}
