//! Q64.64 price math shared by DBC (sqrt price) and DLMM (bin price).
//!
//! Every check here is conservative: when a value must be at least the floor, it is rounded
//! down; when it bounds the floor from above, it is rounded up. A bin that passes is never
//! priced below the floor.

pub const ONE: u128 = 1 << 64;
const BASIS_POINT_MAX: u128 = 10_000;

/// Full 256-bit product of two u128s as (hi, lo).
fn mul_wide(a: u128, b: u128) -> (u128, u128) {
    let (a1, a0) = (a >> 64, a & u64::MAX as u128);
    let (b1, b0) = (b >> 64, b & u64::MAX as u128);
    let p00 = a0 * b0;
    let p01 = a0 * b1;
    let p10 = a1 * b0;
    let p11 = a1 * b1;
    let mid = (p00 >> 64) + (p01 & u64::MAX as u128) + (p10 & u64::MAX as u128);
    let lo = (p00 & u64::MAX as u128) | (mid << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (hi, lo)
}

/// (a * b) >> 64, rounded down. None on overflow.
pub fn mul_shr64_down(a: u128, b: u128) -> Option<u128> {
    let (hi, lo) = mul_wide(a, b);
    if hi >> 64 != 0 {
        return None;
    }
    Some((hi << 64) | (lo >> 64))
}

/// (a * b) >> 64, rounded up. None on overflow.
pub fn mul_shr64_up(a: u128, b: u128) -> Option<u128> {
    let (hi, lo) = mul_wide(a, b);
    if hi >> 64 != 0 {
        return None;
    }
    let down = (hi << 64) | (lo >> 64);
    if lo & u64::MAX as u128 != 0 {
        down.checked_add(1)
    } else {
        Some(down)
    }
}

/// DLMM bin base: 1 + bin_step / 10_000 in Q64.64 (exact for the bin steps DLMM allows
/// up to rounding of the division, which we take in the requested direction).
fn bin_base(bin_step: u16, round_up: bool) -> u128 {
    let num = (bin_step as u128) << 64;
    let mut frac = num / BASIS_POINT_MAX;
    if round_up && num % BASIS_POINT_MAX != 0 {
        frac += 1;
    }
    ONE + frac
}

/// base^exp in Q64.64 by binary exponentiation, rounding every step the same direction.
fn pow_q64(base: u128, mut exp: u32, round_up: bool) -> Option<u128> {
    let mul = if round_up { mul_shr64_up } else { mul_shr64_down };
    let mut result = ONE;
    let mut b = base;
    while exp > 0 {
        if exp & 1 == 1 {
            result = mul(result, b)?;
        }
        exp >>= 1;
        if exp > 0 {
            b = mul(b, b)?;
        }
    }
    Some(result)
}

/// Graduation price in Q64.64 (quote per base, raw units) from DBC's migration sqrt price,
/// rounded up so the floor derived from it is never understated.
pub fn price_from_sqrt_up(sqrt_price_q64: u128) -> Option<u128> {
    mul_shr64_up(sqrt_price_q64, sqrt_price_q64)
}

/// Floor price = graduation price × floor_bps / 10_000, rounded up.
pub fn floor_price_up(graduation_price_q64: u128, floor_bps: u16) -> Option<u128> {
    let num = graduation_price_q64.checked_mul(floor_bps as u128)?;
    Some(num.div_ceil(BASIS_POINT_MAX))
}

/// True when DLMM bin `bin_id` (price = base^bin_id) is priced at or above `floor_q64`.
///
/// Positive ids: compare base^id (rounded down) against the floor.
/// Negative ids: price = 1 / base^|id|, so price ≥ floor ⇔ base^|id| × floor ≤ 1, computed
/// with both factors rounded up. No reciprocal needed.
pub fn bin_at_or_above_floor(bin_id: i32, bin_step: u16, floor_q64: u128) -> bool {
    if bin_id >= 0 {
        match pow_q64(bin_base(bin_step, false), bin_id as u32, false) {
            Some(price) => price >= floor_q64,
            None => true, // overflow: price is above anything a Q64.64 floor can express
        }
    } else {
        let Some(power) = pow_q64(bin_base(bin_step, true), bin_id.unsigned_abs(), true) else {
            return false; // price underflows to ~0
        };
        match mul_shr64_up(power, floor_q64) {
            Some(product) => product <= ONE,
            None => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn to_f64(q: u128) -> f64 {
        q as f64 / ONE as f64
    }

    fn from_f64(x: f64) -> u128 {
        (x * ONE as f64) as u128
    }

    #[test]
    fn mul_matches_f64() {
        let a = from_f64(1.2345);
        let b = from_f64(678.9);
        let r = to_f64(mul_shr64_down(a, b).unwrap());
        assert!((r - 1.2345 * 678.9).abs() < 1e-9);
        assert!(mul_shr64_up(a, b).unwrap() >= mul_shr64_down(a, b).unwrap());
    }

    #[test]
    fn bin_prices_match_dlmm_formula() {
        for &(bin_step, id) in &[(100u16, 0i32), (100, 1), (100, 70), (100, -500), (25, 1234), (100, -1323)] {
            let expected = (1.0 + bin_step as f64 / 10_000.0).powi(id);
            let floor = from_f64(expected * 0.999_999);
            assert!(bin_at_or_above_floor(id, bin_step, floor), "bin {id} step {bin_step} below 0.999999x");
            let above = from_f64(expected * 1.000_001);
            assert!(!bin_at_or_above_floor(id, bin_step, above), "bin {id} step {bin_step} above 1.000001x");
        }
    }

    #[test]
    fn floor_is_125_percent_of_graduation_price() {
        // CHRL on mainnet: graduation price ~2e-9 SOL per token = 2e-6 lamports per raw unit
        let grad = from_f64(2e-6);
        let floor = floor_price_up(grad, 12_500).unwrap();
        assert!((to_f64(floor) - 2.5e-6).abs() < 1e-15);
    }

    #[test]
    fn ladder_rule_on_a_real_shaped_pair() {
        // Graduation at 2e-6 raw; bin step 100 (1%). The 1.25x bin must pass, 1.2x must not.
        let step = 100u16;
        let grad = from_f64(2e-6);
        let floor = floor_price_up(grad, 12_500).unwrap();
        let bin_for = |price: f64| (price.ln() / (1.01f64).ln()).floor() as i32;
        let at_125 = bin_for(2e-6 * 1.25) + 1; // first bin at or above 1.25x
        let at_120 = bin_for(2e-6 * 1.20);
        assert!(bin_at_or_above_floor(at_125, step, floor));
        assert!(!bin_at_or_above_floor(at_120, step, floor));
        assert!(!bin_at_or_above_floor(at_125 - 1, step, floor));
    }

    #[test]
    fn sqrt_price_squares() {
        let sqrt = from_f64(0.001_414_213_562);
        let p = to_f64(price_from_sqrt_up(sqrt).unwrap());
        assert!((p - 2e-6).abs() < 1e-12);
    }
}
