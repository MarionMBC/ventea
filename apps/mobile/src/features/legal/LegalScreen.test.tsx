import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalScreen } from './LegalScreen';
import { legalText } from './legalContent';

describe('LegalScreen', () => {
  test('privacy policy names the brand, the operator and how to delete the account', () => {
    render(<LegalScreen doc="privacy" />);
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deleting your account' })).toBeInTheDocument();
    expect(screen.getAllByText(/Ventea/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'hola@ventea.tech' })).toBeInTheDocument();
  });

  test('terms of use render', () => {
    render(<LegalScreen doc="terms" />);
    expect(screen.getByRole('heading', { name: 'Terms of Use' })).toBeInTheDocument();
  });

  test('every placeholder is filled in both languages', () => {
    for (const language of ['en', 'es'] as const) {
      for (const doc of ['privacy', 'terms'] as const) {
        const text = legalText(doc, language, 'Carolina Hot Chicken');
        expect(JSON.stringify(text)).not.toMatch(/\{(brand|operator|email)\}/);
        expect(text.intro).toContain('Carolina Hot Chicken');
      }
    }
  });
});
