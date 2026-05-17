(function yydsMailProviderModule(root, factory) {
  root.MultiPageBackgroundYydsMailProvider = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createYydsMailProviderModule() {
  function createYydsMailProvider(deps = {}) {
    const {
      addLog = async () => {},
      buildYydsMailHeaders,
      DEFAULT_YYDS_MAIL_BASE_URL = 'https://maliapi.215.im/v1',
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      getState = async () => ({}),
      joinYydsMailUrl,
      normalizeYydsMailAddress,
      normalizeYydsMailApiKey,
      normalizeYydsMailBaseUrl,
      normalizeYydsMailCurrentInbox,
      normalizeYydsMailInbox,
      normalizeYydsMailMessageDetail,
      normalizeYydsMailMessages,
      persistRegistrationEmailState = null,
      pickVerificationMessageWithTimeFallback,
      setEmailState = async () => {},
      setState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
      YYDS_MAIL_PROVIDER = 'yyds-mail',
    } = deps;

    async function persistResolvedEmailState(state = null, email, options = {}) {
      if (typeof persistRegistrationEmailState === 'function') {
        await persistRegistrationEmailState(state, email, options);
        return;
      }
      await setEmailState(email, options);
    }

    function getYydsMailConfig(state = {}) {
      return {
        apiKey: normalizeYydsMailApiKey(state.yydsMailApiKey),
        baseUrl: normalizeYydsMailBaseUrl(state.yydsMailBaseUrl || DEFAULT_YYDS_MAIL_BASE_URL),
        currentInbox: normalizeYydsMailCurrentInbox(state.currentYydsMailInbox),
      };
    }

    function ensureYydsMailConfig(state = {}, options = {}) {
      const { requireApiKey = false, requireInbox = false } = options;
      const config = getYydsMailConfig(state);
      if (!config.baseUrl) {
        throw new Error('YYDS Mail API 地址为空或格式无效。');
      }
      if (requireApiKey && !config.apiKey) {
        throw new Error('YYDS Mail API Key 为空，请先在侧边栏填写。');
      }
      if (requireInbox && (!config.currentInbox?.address || !config.currentInbox?.token)) {
        throw new Error('YYDS Mail 当前没有可用邮箱，请先获取邮箱。');
      }
      return config;
    }

    async function requestYydsMailJson(config, path, options = {}) {
      if (!fetchImpl) {
        throw new Error('YYDS Mail 当前运行环境不支持 fetch。');
      }
      const {
        method = 'GET',
        payload,
        params,
        timeoutMs = 20000,
        auth = 'temp',
      } = options;
      const url = joinYydsMailUrl(config.baseUrl, path, params);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: buildYydsMailHeaders(config, {
            apiKey: auth === 'apiKey' ? config.apiKey : '',
            tempToken: auth === 'temp' ? config.currentInbox?.token : '',
            includeConfigApiKey: auth === 'apiKey',
            json: payload !== undefined,
          }),
          body: payload !== undefined ? JSON.stringify(payload || {}) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        const errorMessage = err?.name === 'AbortError'
          ? `YYDS Mail 请求超时（>${Math.round(timeoutMs / 1000)} 秒）`
          : `YYDS Mail 请求失败：${err.message}`;
        throw new Error(errorMessage);
      } finally {
        clearTimeout(timeoutId);
      }

      const text = await response.text();
      let parsed = {};
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        const payloadError = parsed && typeof parsed === 'object'
          ? (parsed.error || parsed.message || parsed.msg || parsed.errorCode)
          : '';
        throw new Error(`YYDS Mail 请求失败：${payloadError || text || `HTTP ${response.status}`}`);
      }

      if (parsed && typeof parsed === 'object' && parsed.success === false) {
        throw new Error(`YYDS Mail 业务错误：${parsed.error || parsed.message || parsed.errorCode || 'unknown_error'}`);
      }

      if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'data')) {
        return parsed.data;
      }
      return parsed;
    }

    function generateYydsMailLocalPart() {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      const digits = '0123456789';
      const chars = [];
      for (let i = 0; i < 6; i += 1) chars.push(letters[Math.floor(Math.random() * letters.length)]);
      for (let i = 0; i < 4; i += 1) chars.push(digits[Math.floor(Math.random() * digits.length)]);
      for (let i = chars.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      return chars.join('');
    }

    async function fetchYydsMailAddress(state, options = {}) {
      throwIfStopped();
      const latestState = state || await getState();
      const config = ensureYydsMailConfig(latestState, { requireApiKey: true });
      const localPart = String(options.localPart || options.name || '').trim().toLowerCase()
        || generateYydsMailLocalPart();
      const data = await requestYydsMailJson(config, '/accounts', {
        method: 'POST',
        auth: 'apiKey',
        payload: { localPart },
      });
      const inbox = normalizeYydsMailInbox(data);
      if (!inbox.address || !inbox.token) {
        throw new Error('YYDS Mail 创建邮箱成功，但未返回可用 address/token。');
      }

      await setState({ currentYydsMailInbox: inbox });
      await persistResolvedEmailState(latestState, inbox.address, {
        source: `generated:${YYDS_MAIL_PROVIDER}`,
        preserveAccountIdentity: Boolean(options?.preserveAccountIdentity),
      });
      await addLog(`YYDS Mail：已创建邮箱 ${inbox.address}`, 'ok');
      return inbox.address;
    }

    function resolveYydsMailInbox(state = {}) {
      const config = getYydsMailConfig(state);
      if (config.currentInbox?.address && config.currentInbox?.token) {
        return config.currentInbox;
      }
      return null;
    }

    function resolveYydsMailPollTargetEmail(state = {}, pollPayload = {}) {
      return normalizeYydsMailAddress(pollPayload.targetEmail)
        || resolveYydsMailInbox(state)?.address
        || normalizeYydsMailAddress(state.email);
    }

    async function listYydsMailMessages(state, options = {}) {
      const latestState = state || await getState();
      const inbox = resolveYydsMailInbox(latestState);
      const config = {
        ...ensureYydsMailConfig(latestState, { requireInbox: true }),
        currentInbox: inbox,
      };
      const address = normalizeYydsMailAddress(options.address) || inbox.address;
      const payload = await requestYydsMailJson(config, '/messages', {
        method: 'GET',
        auth: 'temp',
        params: {
          address,
          limit: Number(options.limit) || 20,
        },
      });
      return {
        config,
        messages: normalizeYydsMailMessages(payload),
      };
    }

    async function getYydsMailMessageDetail(state, messageId, options = {}) {
      const latestState = state || await getState();
      const inbox = resolveYydsMailInbox(latestState);
      const config = {
        ...ensureYydsMailConfig(latestState, { requireInbox: true }),
        currentInbox: inbox,
      };
      const address = normalizeYydsMailAddress(options.address) || inbox.address;
      const payload = await requestYydsMailJson(config, `/messages/${encodeURIComponent(messageId)}`, {
        method: 'GET',
        auth: 'temp',
        params: { address },
      });
      return normalizeYydsMailMessageDetail(payload);
    }

    function summarizeYydsMailMessagesForLog(messages) {
      return (messages || [])
        .slice()
        .sort((left, right) => {
          const leftTime = Date.parse(left.receivedDateTime || '') || 0;
          const rightTime = Date.parse(right.receivedDateTime || '') || 0;
          return rightTime - leftTime;
        })
        .slice(0, 3)
        .map((message) => {
          const receivedAt = message?.receivedDateTime || '未知时间';
          const sender = message?.from?.emailAddress?.address || '未知发件人';
          const subject = message?.subject || '（无主题）';
          const preview = String(message?.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 80);
          return `${receivedAt} | ${sender} | ${subject} | ${preview}`;
        })
        .join(' || ');
    }

    async function hydrateYydsMailMessageDetails(state, messages, address) {
      const details = [];
      for (const message of (messages || []).slice(0, 8)) {
        throwIfStopped();
        if (!message?.id) {
          details.push(message);
          continue;
        }
        try {
          details.push(await getYydsMailMessageDetail(state, message.id, { address }));
        } catch (err) {
          await addLog(`YYDS Mail：读取邮件详情 ${message.id} 失败：${err.message}`, 'warn');
          details.push(message);
        }
      }
      return details.filter(Boolean);
    }

    async function pollYydsMailVerificationCode(step, state, pollPayload = {}) {
      const latestState = state || await getState();
      const targetEmail = resolveYydsMailPollTargetEmail(latestState, pollPayload);
      if (!targetEmail) {
        throw new Error('YYDS Mail 轮询前缺少目标邮箱地址，请先获取邮箱。');
      }

      await addLog(`步骤 ${step}：正在轮询 YYDS Mail 邮件（${targetEmail}）...`, 'info');
      const maxAttempts = Number(pollPayload.maxAttempts) || 5;
      const intervalMs = Number(pollPayload.intervalMs) || 3000;
      let lastError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        throwIfStopped();
        try {
          const { messages } = await listYydsMailMessages(latestState, {
            address: targetEmail,
            limit: pollPayload.limit || 20,
          });
          const detailedMessages = await hydrateYydsMailMessageDetails(latestState, messages, targetEmail);
          const matchResult = pickVerificationMessageWithTimeFallback(detailedMessages, {
            afterTimestamp: pollPayload.filterAfterTimestamp || 0,
            senderFilters: pollPayload.senderFilters || [],
            subjectFilters: pollPayload.subjectFilters || [],
            requiredKeywords: pollPayload.requiredKeywords || [],
            codePatterns: pollPayload.codePatterns || [],
            excludeCodes: pollPayload.excludeCodes || [],
          });
          const match = matchResult.match;
          if (match?.code) {
            if (matchResult.usedRelaxedFilters) {
              const fallbackLabel = matchResult.usedTimeFallback ? '宽松匹配 + 时间回退' : '宽松匹配';
              await addLog(`步骤 ${step}：严格规则未命中，已改用 ${fallbackLabel} 并命中 YYDS Mail 验证码。`, 'warn');
            }
            return {
              ok: true,
              code: match.code,
              emailTimestamp: match.receivedAt || Date.now(),
              mailId: match.message?.id || '',
            };
          }

          lastError = new Error(`步骤 ${step}：暂未在 YYDS Mail 中找到匹配验证码（${attempt}/${maxAttempts}）。`);
          await addLog(lastError.message, attempt === maxAttempts ? 'warn' : 'info');
          const sample = summarizeYydsMailMessagesForLog(detailedMessages.length ? detailedMessages : messages);
          if (sample) {
            await addLog(`步骤 ${step}：最近邮件样本：${sample}`, 'info');
          }
        } catch (err) {
          lastError = err;
          await addLog(`步骤 ${step}：YYDS Mail 轮询失败：${err.message}`, 'warn');
        }
        if (attempt < maxAttempts) {
          await sleepWithStop(intervalMs);
        }
      }

      throw lastError || new Error(`步骤 ${step}：未在 YYDS Mail 中找到新的匹配验证码。`);
    }

    async function clearYydsMailRuntimeState(options = {}) {
      await setState({
        currentYydsMailInbox: null,
        ...(options.clearEmail ? { email: null } : {}),
      });
    }

    return {
      clearYydsMailRuntimeState,
      ensureYydsMailConfig,
      fetchYydsMailAddress,
      getYydsMailConfig,
      getYydsMailMessageDetail,
      listYydsMailMessages,
      pollYydsMailVerificationCode,
      requestYydsMailJson,
      resolveYydsMailPollTargetEmail,
    };
  }

  return {
    createYydsMailProvider,
  };
});
