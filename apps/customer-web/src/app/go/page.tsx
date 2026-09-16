import { GoStoreClient } from './GoStoreClient';
import { fetchOnboardingPricing } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function GoStorePage() {
  let pricingData;
  try {
    pricingData = await fetchOnboardingPricing();
  } catch (e) {
    pricingData = {
      items: [
        { itemKey: 'platform_100k', title: 'Platforma 100k-RYCOS', description: 'Wysokowydajny silnik zamówień (100k/min), KDS, POS, Master SaaS', monthlyPricePln: 199, discount6mPercent: 10, discount12mPercent: 20 },
        { itemKey: 'rycos_pf', title: 'SBR Pełna (POS + Kasa fiskalna + SoftPOS)', description: 'Wszystko w jednym na terminalu SBR: sprzedaż, e-paragony i płatności zbliżeniowe', monthlyPricePln: 89, discount6mPercent: 10, discount12mPercent: 20 },
        { itemKey: 'rycos_f', title: 'SBR Fiskalna (Aplikasa)', description: 'Wirtualna kasa fiskalna zintegrowana z Centralnym Repozytorium Kas (MF)', monthlyPricePln: 49, discount6mPercent: 10, discount12mPercent: 20 },
        { itemKey: 'rycos_p', title: 'SBR Płatnicza (SoftPOS)', description: 'Akceptacja płatności kartami VISA / MasterCard / Apple Pay / Google Pay (PIN-on-Glass)', monthlyPricePln: 39, discount6mPercent: 10, discount12mPercent: 20 },
        { itemKey: 'rycos_0', title: 'SBR Podstawowa (POS)', description: 'Stanowisko kelnerskie / mobilny terminal zamówień POS', monthlyPricePln: 19, discount6mPercent: 10, discount12mPercent: 20 },
      ],
      discounts: {
        '1m': 0,
        '6m': 10,
        '12m': 20,
      },
      vat_rate: 0.23,
      currency: 'PLN',
    };
  }

  return <GoStoreClient initialPricing={pricingData} />;
}
