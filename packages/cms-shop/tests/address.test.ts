import { describe, it, expect } from 'vitest';
import { validateAddress } from '../src/storefront/address';

describe('validateAddress', () => {
  it('passes a complete DK address', () => {
    const result = validateAddress({
      name: 'Christian',
      line1: 'Vej 1',
      postalCode: '9492',
      city: 'Blokhus',
      country: 'DK',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('flags missing required fields', () => {
    const result = validateAddress({});
    expect(result.valid).toBe(false);
    expect(Object.keys(result.errors)).toEqual(
      expect.arrayContaining([
        'name',
        'line1',
        'postalCode',
        'city',
        'country',
      ]),
    );
  });

  it('rejects invalid DK postal code', () => {
    const result = validateAddress({
      name: 'Christian',
      line1: 'Vej 1',
      postalCode: '94920',
      city: 'Blokhus',
      country: 'DK',
    });
    expect(result.valid).toBe(false);
    expect(result.errors['postalCode']).toMatch(/Invalid postal code/);
  });

  it('rejects invalid SE postal code (only 4 digits)', () => {
    const result = validateAddress({
      name: 'Sven',
      line1: 'Storgatan 1',
      postalCode: '1234',
      city: 'Stockholm',
      country: 'SE',
    });
    expect(result.valid).toBe(false);
  });

  it('accepts SE 5-digit with optional space', () => {
    const result = validateAddress({
      name: 'Sven',
      line1: 'Storgatan 1',
      postalCode: '123 45',
      city: 'Stockholm',
      country: 'SE',
    });
    expect(result.valid).toBe(true);
  });

  it('skips postal pattern check for unknown countries', () => {
    const result = validateAddress({
      name: 'Test',
      line1: '1',
      postalCode: 'whatever',
      city: 'X',
      country: 'ZZ',
    });
    expect(result.valid).toBe(true);
  });
});
