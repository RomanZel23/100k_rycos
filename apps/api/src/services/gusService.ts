import { env } from '../config/env.js';

export interface GusCompanyData {
  nip: string;
  regon: string;
  name: string;
  street?: string;
  propertyNumber?: string;
  apartmentNumber?: string;
  city: string;
  postalCode: string;
  voivodeship?: string;
  formattedAddress: string;
  statusNip?: string;
}

export class GusService {
  private getServiceUrl(): string {
    if (env.GUS_TEST_MODE) {
      return 'https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
    }
    return 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc';
  }

  private getUserKey(): string {
    return env.GUS_USER_KEY || 'abcde12345abcde12345';
  }

  /**
   * Log into GUS BIR service and return session ID (sid)
   */
  private async login(serviceUrl: string, userKey: string): Promise<string> {
    const soapEnvelope = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
<wsa:To>${serviceUrl}</wsa:To>
<wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>
</soap:Header>
<soap:Body>
<ns:Zaloguj>
<ns:pKluczUzytkownika>${userKey}</ns:pKluczUzytkownika>
</ns:Zaloguj>
</soap:Body>
</soap:Envelope>`;

    const res = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
      },
      body: soapEnvelope,
    });

    if (!res.ok) {
      throw new Error(`GUS HTTP error during login: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    const sidMatch = text.match(/<ZalogujResult>(.*?)<\/ZalogujResult>/);
    const sid = sidMatch ? sidMatch[1].trim() : '';

    if (!sid) {
      throw new Error('GUS: Nieprawidłowy klucz użytkownika lub błąd logowania (pusty identyfikator sesji)');
    }

    return sid;
  }

  /**
   * Search company by NIP
   */
  async searchByNip(nipInput: string): Promise<GusCompanyData | null> {
    const cleanNip = nipInput.replace(/^PL/i, '').replace(/[^0-9]/g, '');
    if (cleanNip.length !== 10) {
      throw new Error('Wymagany jest poprawny 10-cyfrowy NIP');
    }

    const serviceUrl = this.getServiceUrl();
    const userKey = this.getUserKey();

    const sid = await this.login(serviceUrl, userKey);

    const searchSoap = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07" xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
<wsa:To>${serviceUrl}</wsa:To>
<wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty</wsa:Action>
</soap:Header>
<soap:Body>
<ns:DaneSzukajPodmioty>
<ns:pParametryWyszukiwania>
<dat:Nip>${cleanNip}</dat:Nip>
</ns:pParametryWyszukiwania>
</ns:DaneSzukajPodmioty>
</soap:Body>
</soap:Envelope>`;

    const res = await fetch(serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml;charset=UTF-8',
        sid,
      },
      body: searchSoap,
    });

    if (!res.ok) {
      throw new Error(`GUS HTTP error during search: ${res.status} ${res.statusText}`);
    }

    const rawResponse = await res.text();

    // Extract DaneSzukajPodmiotyResult which contains escaped XML
    const resultMatch = rawResponse.match(/<DaneSzukajPodmiotyResult>([\s\S]*?)<\/DaneSzukajPodmiotyResult>/);
    if (!resultMatch || !resultMatch[1] || resultMatch[1].trim() === '') {
      return null;
    }

    let unescapedXml = resultMatch[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#xD;/g, '');

    // Check if empty or error
    if (!unescapedXml.includes('<dane>') || unescapedXml.includes('<ErrorCode>')) {
      return null;
    }

    const extractTag = (xml: string, tag: string): string => {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const m = xml.match(regex);
      return m ? m[1].trim() : '';
    };

    const regon = extractTag(unescapedXml, 'Regon');
    const nip = extractTag(unescapedXml, 'Nip') || cleanNip;
    const name = extractTag(unescapedXml, 'Nazwa');
    const street = extractTag(unescapedXml, 'Ulica');
    const propertyNumber = extractTag(unescapedXml, 'NrNieruchomosci');
    const apartmentNumber = extractTag(unescapedXml, 'NrLokalu');
    const city = extractTag(unescapedXml, 'Miejscowosc');
    const postalCode = extractTag(unescapedXml, 'KodPocztowy');
    const voivodeship = extractTag(unescapedXml, 'Wojewodztwo');
    const statusNip = extractTag(unescapedXml, 'StatusNip');

    // Build human-friendly formatted address
    let streetAddress = '';
    if (street) {
      streetAddress = street;
      if (propertyNumber) streetAddress += ` ${propertyNumber}`;
      if (apartmentNumber) streetAddress += `/${apartmentNumber}`;
    } else if (propertyNumber) {
      streetAddress = `${city} ${propertyNumber}`;
      if (apartmentNumber) streetAddress += `/${apartmentNumber}`;
    }

    const parts = [];
    if (streetAddress) parts.push(streetAddress);
    if (postalCode || city) {
      parts.push(`${postalCode ? postalCode + ' ' : ''}${city}`.trim());
    }

    const formattedAddress = parts.join(', ');

    return {
      nip,
      regon,
      name,
      street: street || undefined,
      propertyNumber: propertyNumber || undefined,
      apartmentNumber: apartmentNumber || undefined,
      city,
      postalCode,
      voivodeship: voivodeship || undefined,
      formattedAddress,
      statusNip: statusNip || undefined,
    };
  }
}

export const gusService = new GusService();
