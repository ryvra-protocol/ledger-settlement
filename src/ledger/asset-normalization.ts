import type { AssetId, Posting } from "../types.js";

export interface CanonicalAssetDefinition {
  canonical_asset_id: AssetId;
  decimals: number;
  aliases?: AssetId[];
}

export interface AssetNormalizationConfig {
  assets: CanonicalAssetDefinition[];
}

export type DecimalAmountInput = bigint | string;

export class AssetNormalizationError extends Error {}

export class AssetNormalizer {
  private readonly canonicalByAlias = new Map<AssetId, CanonicalAssetDefinition>();

  constructor(config: AssetNormalizationConfig) {
    for (const asset of config.assets) {
      if (!Number.isInteger(asset.decimals) || asset.decimals < 0) {
        throw new AssetNormalizationError(`invalid decimals for asset: ${asset.canonical_asset_id}`);
      }

      const canonical = normalizeAssetKey(asset.canonical_asset_id);
      const normalizedAsset: CanonicalAssetDefinition = {
        canonical_asset_id: canonical,
        decimals: asset.decimals,
        aliases: asset.aliases?.map(normalizeAssetKey) ?? []
      };

      this.registerAlias(normalizedAsset, canonical);
      for (const alias of normalizedAsset.aliases ?? []) {
        this.registerAlias(normalizedAsset, alias);
      }
    }
  }

  normalizeAssetId(assetId: AssetId): AssetId {
    const normalized = normalizeAssetKey(assetId);
    return this.canonicalByAlias.get(normalized)?.canonical_asset_id ?? normalized;
  }

  normalizePosting(posting: Posting): Posting {
    return {
      ...posting,
      asset_id: this.normalizeAssetId(posting.asset_id),
      amount_minor: this.normalizeMinorAmount(posting.amount_minor)
    };
  }

  normalizeMinorAmount(amountMinor: bigint): bigint {
    if (amountMinor < 0n) {
      throw new AssetNormalizationError("amount_minor must be non-negative");
    }
    return amountMinor;
  }

  majorToMinor(amount: DecimalAmountInput, assetId: AssetId): bigint {
    const canonicalAssetId = this.normalizeAssetId(assetId);
    const definition = this.canonicalByAlias.get(canonicalAssetId);
    if (!definition) {
      throw new AssetNormalizationError(`unknown asset_id: ${canonicalAssetId}`);
    }
    return decimalToMinorUnits(amount, definition.decimals);
  }

  private registerAlias(asset: CanonicalAssetDefinition, alias: AssetId): void {
    const existing = this.canonicalByAlias.get(alias);
    if (existing && existing.canonical_asset_id !== asset.canonical_asset_id) {
      throw new AssetNormalizationError(`asset alias collision: ${alias}`);
    }
    this.canonicalByAlias.set(alias, asset);
  }
}

function normalizeAssetKey(value: string): string {
  return value.trim().toUpperCase();
}

export function decimalToMinorUnits(amount: DecimalAmountInput, decimals: number): bigint {
  if (typeof amount === "bigint") {
    return amount;
  }

  const normalized = amount.trim();
  const decimalPattern = /^([+-]?)(\d+)(?:\.(\d+))?$/;
  const match = normalized.match(decimalPattern);
  if (!match) {
    throw new AssetNormalizationError(`invalid decimal amount: ${amount}`);
  }

  const [, sign, wholeRaw, fractionRaw = ""] = match;
  if (sign === "-") {
    throw new AssetNormalizationError("amount must be non-negative");
  }
  if (fractionRaw.length > decimals) {
    throw new AssetNormalizationError("amount exceeds supported precision for asset");
  }

  const whole = BigInt(wholeRaw);
  const paddedFraction = fractionRaw.padEnd(decimals, "0");
  const fraction = paddedFraction.length > 0 ? BigInt(paddedFraction) : 0n;
  return whole * 10n ** BigInt(decimals) + fraction;
}
