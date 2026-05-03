(function attachAddressSources(root, factory) {
  root.MultiPageAddressSources = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createAddressSourcesModule() {
  const COUNTRY_ALIASES = {
    AU: ['au', 'aus', 'australia', '澳大利亚'],
    DE: ['de', 'deu', 'germany', 'deutschland', '德国'],
    FR: ['fr', 'fra', 'france', '法国'],
    ID: ['id', 'indonesia', '印度尼西亚', '印尼'],
    JP: ['jp', 'jpn', 'japan', '日本', '日本国'],
    KR: ['kr', 'kor', 'korea', 'south korea', '韩国', '대한민국'],
    US: ['us', 'usa', 'united states', 'united states of america', 'america', '美国'],
  };

  const ADDRESS_SEEDS = {
    AU: [
      {
        query: 'New South Wales',
        suggestionIndex: 1,
        fallback: {
          address1: 'Thyne Reid Drive',
          city: 'Thredbo',
          region: 'New South Wales',
          postalCode: '2625',
        },
      },
      {
        query: 'Sydney NSW',
        suggestionIndex: 1,
        fallback: {
          address1: 'George Street',
          city: 'Sydney',
          region: 'New South Wales',
          postalCode: '2000',
        },
      },
    ],
    DE: [
      {
        query: 'Berlin Mitte',
        suggestionIndex: 1,
        fallback: {
          address1: 'Unter den Linden',
          city: 'Berlin',
          region: 'Berlin',
          postalCode: '10117',
        },
      },
      {
        query: 'Munich Altstadt',
        suggestionIndex: 1,
        fallback: {
          address1: 'Marienplatz',
          city: 'Munich',
          region: 'Bavaria',
          postalCode: '80331',
        },
      },
    ],
    FR: [
      {
        query: 'Paris France',
        suggestionIndex: 1,
        fallback: {
          address1: 'Rue de Rivoli',
          city: 'Paris',
          region: 'Ile-de-France',
          postalCode: '75001',
        },
      },
      {
        query: 'Lyon France',
        suggestionIndex: 1,
        fallback: {
          address1: 'Rue de la Republique',
          city: 'Lyon',
          region: 'Auvergne-Rhone-Alpes',
          postalCode: '69002',
        },
      },
    ],
    ID: [
      {
        query: 'Jakarta Indonesia',
        suggestionIndex: 1,
        fallback: {
          address1: 'Jalan M.H. Thamrin No. 1',
          city: 'Jakarta',
          region: 'DKI Jakarta',
          postalCode: '10310',
        },
      },
      {
        query: 'Jakarta Selatan',
        suggestionIndex: 1,
        fallback: {
          address1: 'Jalan Jenderal Sudirman Kav. 52-53',
          city: 'Jakarta',
          region: 'DKI Jakarta',
          postalCode: '12190',
        },
      },
    ],
    JP: [
      {
        query: 'Tokyo Marunouchi',
        suggestionIndex: 1,
        fallback: {
          address1: 'Marunouchi 1-1',
          city: 'Chiyoda-ku',
          region: 'Tokyo',
          postalCode: '100-0005',
        },
      },
      {
        query: 'Osaka Umeda',
        suggestionIndex: 1,
        fallback: {
          address1: 'Umeda 3-1',
          city: 'Kita-ku',
          region: 'Osaka',
          postalCode: '530-0001',
        },
      },
    ],
    KR: [
      {
        query: 'Seoul Jung-gu',
        suggestionIndex: 1,
        fallback: {
          address1: 'Sejong-daero 110',
          city: 'Jung-gu',
          region: 'Seoul',
          postalCode: '04524',
        },
      },
      {
        query: 'Seoul Gangnam-gu',
        suggestionIndex: 1,
        fallback: {
          address1: 'Teheran-ro 152',
          city: 'Gangnam-gu',
          region: 'Seoul',
          postalCode: '06236',
        },
      },
    ],
    US: [
      {
        query: 'New York NY',
        suggestionIndex: 1,
        fallback: {
          address1: 'Broadway',
          city: 'New York',
          region: 'New York',
          postalCode: '10007',
        },
      },
    ],
  };

  function normalizeCountryCode(value = '') {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return '';
    }

    for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
      if (aliases.some((alias) => normalized === alias || normalized.includes(alias))) {
        return code;
      }
    }

    const compact = normalized.replace(/[^a-z]/g, '').toUpperCase();
    return ADDRESS_SEEDS[compact] ? compact : '';
  }

  function getAddressSeedForCountry(countryValue = '', options = {}) {
    const fallbackCountry = normalizeCountryCode(options.fallbackCountry || 'DE') || 'DE';
    const countryCode = normalizeCountryCode(countryValue) || fallbackCountry;
    const candidates = ADDRESS_SEEDS[countryCode] || ADDRESS_SEEDS[fallbackCountry] || [];
    const seed = candidates[0] || null;
    if (!seed) {
      return null;
    }
    return {
      countryCode,
      query: seed.query,
      suggestionIndex: Math.max(0, Math.floor(Number(seed.suggestionIndex) || 0)),
      fallback: { ...(seed.fallback || {}) },
    };
  }

  return {
    ADDRESS_SEEDS,
    getAddressSeedForCountry,
    normalizeCountryCode,
  };
});
