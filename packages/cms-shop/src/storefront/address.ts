/**
 * F136 Phase 1 — Address validation (DK-first).
 *
 * Light validation that catches the obvious mistakes without becoming
 * a full address-resolution dependency. Country-specific patterns can
 * be added by later phases (or replaced with DAWA / PostNord lookup).
 */
import type { ShopAddress } from '../types';

export interface AddressValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const POSTAL_PATTERNS: Record<string, RegExp> = {
  DK: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/,
  NO: /^\d{4}$/,
  DE: /^\d{5}$/,
  GB: /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i,
  US: /^\d{5}(-\d{4})?$/,
};

export function validateAddress(addr: Partial<ShopAddress>): AddressValidationResult {
  const errors: Record<string, string> = {};
  if (!addr.name?.trim()) errors['name'] = 'Name is required';
  if (!addr.line1?.trim()) errors['line1'] = 'Address is required';
  if (!addr.postalCode?.trim()) errors['postalCode'] = 'Postal code is required';
  if (!addr.city?.trim()) errors['city'] = 'City is required';
  if (!addr.country?.trim()) errors['country'] = 'Country is required';

  if (addr.country && addr.postalCode) {
    const pattern = POSTAL_PATTERNS[addr.country.toUpperCase()];
    if (pattern && !pattern.test(addr.postalCode.trim())) {
      errors['postalCode'] =
        `Invalid postal code for ${addr.country.toUpperCase()}`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Address autocomplete extension point. Phase 1 ships a no-op so the
 * import is stable; sites that need real lookup wire in DAWA (DK),
 * PostNord (SE/NO), or Google Places via this interface.
 */
export interface AddressAutocomplete {
  /** Look up suggestions from a partial address string. */
  suggest(query: string, country?: string): Promise<ShopAddress[]>;
}

export const noopAutocomplete: AddressAutocomplete = {
  async suggest() {
    return [];
  },
};
