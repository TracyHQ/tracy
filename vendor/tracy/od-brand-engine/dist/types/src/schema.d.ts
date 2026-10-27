import type { Brand as ContractBrand, BrandColor as ContractBrandColor, BrandSeedOverrides } from '@open-design/contracts';
export declare const ASSET_KINDS: readonly ["landing", "deck", "poster", "email", "newsletter", "form"];
export type AssetKind = (typeof ASSET_KINDS)[number];
export type BrandColor = ContractBrandColor;
export type Brand = ContractBrand;
export declare function sanitizeSeedOverrides(raw: unknown): BrandSeedOverrides | undefined;
