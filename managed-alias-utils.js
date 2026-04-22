(function attachManagedAliasUtils(root, factory) {
  root.MultiPageManagedAliasUtils = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createManagedAliasUtilsModule() {
  const GMAIL_PROVIDER = 'gmail';
  const MAIL_2925_PROVIDER = '2925';
  const MAIL_2925_MODE_PROVIDE = 'provide';
  const MAIL_2925_MODE_RECEIVE = 'receive';
  const DEFAULT_MAIL_2925_MODE = MAIL_2925_MODE_PROVIDE;

  const PROVIDER_CONFIGS = {
    [GMAIL_PROVIDER]: {
      baseLabel: 'Gmail 原邮箱',
      basePlaceholder: '例如 yourname@gmail.com',
      label: 'Gmail +tag 邮箱',
      parseBaseEmail(rawValue = '') {
        const value = String(rawValue || '').trim().toLowerCase();
        const match = value.match(/^([^@\s+]+)@((?:gmail|googlemail)\.com)$/i);
        if (!match) return null;
        return {
          localPart: match[1],
          domain: match[2].toLowerCase(),
        };
      },
      matchesProviderDomain(domain = '') {
        return /^(?:gmail|googlemail)\.com$/i.test(String(domain || '').trim());
      },
      matchesAliasLocalPart(baseLocalPart = '', candidateLocalPart = '') {
        return String(candidateLocalPart || '').split('+')[0] === String(baseLocalPart || '');
      },
      buildAlias(parsedBaseEmail, tag) {
        return `${parsedBaseEmail.localPart}+${tag}@${parsedBaseEmail.domain}`;
      },
      generationHint: '先填写 Gmail 原邮箱后点“生成”，也可以直接手动填写完整的 Gmail 邮箱。',
      registrationPlaceholder: '点击生成 Gmail +tag 邮箱，或手动填写完整邮箱',
    },
    [MAIL_2925_PROVIDER]: {
      baseLabel: '2925 基邮箱',
      basePlaceholder: '例如 yourname@2925.com',
      label: '2925 邮箱',
      parseBaseEmail(rawValue = '') {
        const value = String(rawValue || '').trim().toLowerCase();
        const match = value.match(/^([^@\s+]+)@(2925\.com)$/i);
        if (!match) return null;
        return {
          localPart: match[1],
          domain: match[2].toLowerCase(),
        };
      },
      matchesProviderDomain(domain = '') {
        return String(domain || '').trim().toLowerCase() === '2925.com';
      },
      matchesAliasLocalPart(baseLocalPart = '', candidateLocalPart = '') {
        const normalizedBaseLocalPart = String(baseLocalPart || '');
        const normalizedCandidateLocalPart = String(candidateLocalPart || '');
        return normalizedCandidateLocalPart === normalizedBaseLocalPart
          || normalizedCandidateLocalPart.startsWith(normalizedBaseLocalPart);
      },
      buildAlias(parsedBaseEmail, tag) {
        return `${parsedBaseEmail.localPart}${tag}@${parsedBaseEmail.domain}`;
      },
      generationHint: '先填写 2925 基邮箱后点“生成”，也可以直接手动填写完整的 2925 邮箱。',
      registrationPlaceholder: '点击生成 2925 邮箱，或手动填写完整邮箱',
    },
  };

  function getManagedAliasProviderConfig(provider = '') {
    return PROVIDER_CONFIGS[String(provider || '').trim().toLowerCase()] || null;
  }

  function normalizeMail2925Mode(value = '') {
    return String(value || '').trim().toLowerCase() === MAIL_2925_MODE_RECEIVE
      ? MAIL_2925_MODE_RECEIVE
      : DEFAULT_MAIL_2925_MODE;
  }

  function isManagedAliasProvider(provider = '') {
    return Boolean(getManagedAliasProviderConfig(provider));
  }

  function usesManagedAliasGeneration(provider = '', options = {}) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!isManagedAliasProvider(normalizedProvider)) {
      return false;
    }
    if (normalizedProvider !== MAIL_2925_PROVIDER) {
      return true;
    }

    const mail2925Mode = typeof options === 'string'
      ? options
      : options?.mail2925Mode;
    return normalizeMail2925Mode(mail2925Mode) === MAIL_2925_MODE_PROVIDE;
  }

  function parseEmailParts(rawValue = '') {
    const value = String(rawValue || '').trim().toLowerCase();
    const match = value.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
    if (!match) return null;
    return {
      localPart: match[1],
      domain: match[2],
    };
  }

  function parseManagedAliasBaseEmail(rawValue, provider = '') {
    const config = getManagedAliasProviderConfig(provider);
    return config?.parseBaseEmail(rawValue) || null;
  }

  function isManagedAliasEmail(value, provider = '', baseEmail = '') {
    const config = getManagedAliasProviderConfig(provider);
    if (!config) return false;

    const parsedEmail = parseEmailParts(value);
    if (!parsedEmail || !config.matchesProviderDomain(parsedEmail.domain)) {
      return false;
    }

    const parsedBaseEmail = parseManagedAliasBaseEmail(baseEmail, provider);
    if (!parsedBaseEmail) {
      return true;
    }

    return parsedEmail.domain === parsedBaseEmail.domain
      && config.matchesAliasLocalPart(parsedBaseEmail.localPart, parsedEmail.localPart);
  }

  function buildManagedAliasEmail(provider = '', baseEmail = '', tag = '') {
    const config = getManagedAliasProviderConfig(provider);
    if (!config) {
      throw new Error(`Unsupported managed alias provider: ${provider}`);
    }

    const parsedBaseEmail = parseManagedAliasBaseEmail(baseEmail, provider);
    if (!parsedBaseEmail) {
      throw new Error(`${config.baseLabel}格式不正确`);
    }

    const normalizedTag = String(tag || '').trim();
    if (!normalizedTag) {
      throw new Error(`${config.label}生成标签为空`);
    }

    return config.buildAlias(parsedBaseEmail, normalizedTag);
  }

  function getManagedAliasProviderUiCopy(provider = '') {
    const config = getManagedAliasProviderConfig(provider);
    if (!config) return null;
    return {
      baseLabel: config.baseLabel,
      basePlaceholder: config.basePlaceholder,
      buttonLabel: '生成',
      successVerb: '生成',
      label: config.label,
      placeholder: config.registrationPlaceholder,
      hint: config.generationHint,
    };
  }

  return {
    buildManagedAliasEmail,
    DEFAULT_MAIL_2925_MODE,
    getManagedAliasProviderConfig,
    getManagedAliasProviderUiCopy,
    isManagedAliasEmail,
    isManagedAliasProvider,
    MAIL_2925_MODE_PROVIDE,
    MAIL_2925_MODE_RECEIVE,
    normalizeMail2925Mode,
    parseEmailParts,
    parseManagedAliasBaseEmail,
    usesManagedAliasGeneration,
  };
});
