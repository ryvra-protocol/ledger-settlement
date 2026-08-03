import test from "node:test";
import assert from "node:assert/strict";

import { AssetNormalizationError, AssetNormalizer, decimalToMinorUnits } from "../src/index.js";

test("AssetNormalizer canonicalizes aliases deterministically", () => {
  const normalizer = new AssetNormalizer({
    assets: [{ canonical_asset_id: "USD", decimals: 2, aliases: ["usd", " US Dollar "] }]
  });

  assert.equal(normalizer.normalizeAssetId(" usd "), "USD");
  assert.equal(normalizer.normalizeAssetId("US DOLLAR"), "USD");
  assert.equal(normalizer.normalizeAssetId(" US Dollar "), "USD");
});

test("decimalToMinorUnits converts decimal strings using asset decimals", () => {
  assert.equal(decimalToMinorUnits("12.34", 2), 1234n);
  assert.equal(decimalToMinorUnits("12", 2), 1200n);
  assert.equal(decimalToMinorUnits(5n, 2), 5n);
});

test("AssetNormalizer majorToMinor rejects unsupported precision", () => {
  const normalizer = new AssetNormalizer({
    assets: [{ canonical_asset_id: "USDC", decimals: 6 }]
  });

  assert.throws(() => normalizer.majorToMinor("0.0000001", "USDC"), AssetNormalizationError);
});
