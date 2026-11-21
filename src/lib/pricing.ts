export interface SuggestedPriceInput {
  unitCost: number;
  targetMarginPct: number;
  extraFeePct: number;
}

export interface SuggestedPriceResult {
  valid: boolean;
  error: string | null;
  exactPrice: number;
  recommendedPrice: number;
  denominator: number;
  marginAmountPerUnit: number;
  extraFeeAmountPerUnit: number;
}

export interface BreakEvenInput {
  fixedCost: number;
  sellingPrice: number;
  unitCost: number;
  extraFeePct: number;
}

export interface BreakEvenResult {
  valid: boolean;
  error: string | null;
  profitPerUnit: number;
  netMarginPct: number;
  bepUnits: number;
  bepRevenue: number;
}

/**
 * Rumus Harga Saran (CONTEXT.md):
 * Harga = Biaya per Unit / (1 - Target Margin - % Biaya Tambahan)
 */
export function calculateSuggestedPrice(input: SuggestedPriceInput): SuggestedPriceResult {
  const unitCost = Number.isFinite(input.unitCost) ? Math.max(0, input.unitCost) : 0;
  const targetMargin = Number.isFinite(input.targetMarginPct) ? input.targetMarginPct / 100 : 0;
  const extraFee = Number.isFinite(input.extraFeePct) ? input.extraFeePct / 100 : 0;

  if (unitCost <= 0) {
    return {
      valid: false,
      error: 'Biaya modal per unit harus lebih besar dari Rp 0.',
      exactPrice: 0,
      recommendedPrice: 0,
      denominator: 1 - targetMargin - extraFee,
      marginAmountPerUnit: 0,
      extraFeeAmountPerUnit: 0,
    };
  }

  if (targetMargin < 0 || extraFee < 0) {
    return {
      valid: false,
      error: 'Target margin dan biaya tambahan tidak boleh bernilai negatif.',
      exactPrice: 0,
      recommendedPrice: 0,
      denominator: 1 - targetMargin - extraFee,
      marginAmountPerUnit: 0,
      extraFeeAmountPerUnit: 0,
    };
  }

  const denominator = 1 - targetMargin - extraFee;
  if (denominator <= 0.0001) {
    return {
      valid: false,
      error: 'Total Target Margin + % Biaya Tambahan harus kurang dari 100%.',
      exactPrice: 0,
      recommendedPrice: 0,
      denominator,
      marginAmountPerUnit: 0,
      extraFeeAmountPerUnit: 0,
    };
  }

  const exactPrice = unitCost / denominator;
  const recommendedPrice = Math.ceil(exactPrice / 500) * 500;
  const extraFeeAmountPerUnit = exactPrice * extraFee;
  const marginAmountPerUnit = exactPrice - unitCost - extraFeeAmountPerUnit;

  return {
    valid: true,
    error: null,
    exactPrice: Math.round(exactPrice),
    recommendedPrice,
    denominator: Number(denominator.toFixed(4)),
    marginAmountPerUnit: Math.round(marginAmountPerUnit),
    extraFeeAmountPerUnit: Math.round(extraFeeAmountPerUnit),
  };
}

export interface ProductNetMarginResult {
  valid: boolean;
  profitPerUnit: number;
  netMarginPct: number;
}

/**
 * Menghitung laba bersih dan persentase margin bersih per unit
 * berdasarkan biaya modal (cost) dan harga jual (selling price),
 * dengan opsional persentase biaya tambahan.
 */
export function calculateProductNetMargin(
  unitCost: number,
  sellingPrice: number,
  extraFeePct = 0
): ProductNetMarginResult {
  const safeCost = Number.isFinite(unitCost) ? Math.max(0, unitCost) : 0;
  const safePrice = Number.isFinite(sellingPrice) ? Math.max(0, sellingPrice) : 0;
  const extraFeeRate = Number.isFinite(extraFeePct) ? Math.max(0, extraFeePct) / 100 : 0;

  if (safePrice <= 0) {
    return {
      valid: false,
      profitPerUnit: 0,
      netMarginPct: 0,
    };
  }

  const extraFeePerUnit = safePrice * extraFeeRate;
  const profitPerUnit = safePrice - safeCost - extraFeePerUnit;
  const netMarginPct = (profitPerUnit / safePrice) * 100;

  return {
    valid: true,
    profitPerUnit: Math.round(profitPerUnit),
    netMarginPct: Number(netMarginPct.toFixed(1)),
  };
}

/**
 * Rumus BEP (CONTEXT.md):
 * Laba per Unit = Harga Jual - Biaya per Unit - (Harga Jual * % Biaya Tambahan)
 * BEP (Unit) = Biaya Tetap / Laba per Unit
 */
export function calculateBreakEvenPoint(input: BreakEvenInput): BreakEvenResult {
  const fixedCost = Number.isFinite(input.fixedCost) ? Math.max(0, input.fixedCost) : 0;
  const sellingPrice = Number.isFinite(input.sellingPrice) ? Math.max(0, input.sellingPrice) : 0;
  const margin = calculateProductNetMargin(input.unitCost, sellingPrice, input.extraFeePct);

  if (!margin.valid) {
    return {
      valid: false,
      error: 'Harga jual harus lebih besar dari Rp 0.',
      profitPerUnit: 0,
      netMarginPct: 0,
      bepUnits: 0,
      bepRevenue: 0,
    };
  }

  const safeCost = Number.isFinite(input.unitCost) ? Math.max(0, input.unitCost) : 0;
  const extraFeeRate = Number.isFinite(input.extraFeePct) ? Math.max(0, input.extraFeePct) / 100 : 0;
  const exactProfitPerUnit = sellingPrice - safeCost - sellingPrice * extraFeeRate;

  if (exactProfitPerUnit <= 0) {
    return {
      valid: false,
      error: 'Laba per unit masih nol atau rugi. Naikkan harga jual atau kurangi biaya modal.',
      profitPerUnit: margin.profitPerUnit,
      netMarginPct: margin.netMarginPct,
      bepUnits: 0,
      bepRevenue: 0,
    };
  }

  const bepUnits = fixedCost === 0 ? 0 : Math.ceil(fixedCost / exactProfitPerUnit);
  const bepRevenue = bepUnits * sellingPrice;

  return {
    valid: true,
    error: null,
    profitPerUnit: margin.profitPerUnit,
    netMarginPct: margin.netMarginPct,
    bepUnits,
    bepRevenue: Math.round(bepRevenue),
  };
}
