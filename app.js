    const statusEl = document.getElementById('status');
    const loadBtn = document.getElementById('loadBtn');
    const usernameEl = document.getElementById('username');
    const rpcSelect = document.getElementById('rpc');
    const rpcSelectWrap = document.querySelector('.rpc-select-wrap');
    const rpcToggleEl = document.getElementById('rpcToggle');
    const customRpcEl = document.getElementById('customRpc');
    const voteSlider = document.getElementById('voteSlider');
    const analyticsPills = Array.from(document.querySelectorAll('.pill.toggle'));
    const avatarPlaceholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const HIVE_IMAGE_PROXY = 'https://images.hive.blog';
    const rpcDotEl = document.getElementById('rpcDot');
    let lastRpcChoice = rpcSelect?.value || '';
    if (lastRpcChoice === 'custom') {
      lastRpcChoice = rpcSelect?.options?.[0]?.value || '';
    }
    let hasLoaded = false;
    let activeLoadId = 0;
    let lastRewardFund = null;
    let lastPriceFeed = null;
    let lastAccount = null;
    let lastDgp = null;
    let lastRcAccount = null;
    let lastProfile = null;
    let lastTotals = null;
    let lastPendingAuthorHp = null;
    let pendingAuthorRows = [];
    let lastPendingCurationHp = null;
    let pendingCurationRows = [];
    let pendingCurationEligibleVoteCount = 0;
    let pendingCurationProcessedVoteCount = 0;
    let analyticsRange = 7;
    let growthChart = null;
    let earnedChart = null;
    let lastChartBuckets = null;
    let lastChartDays = null;
    const HISTORY_FILTER_LOW = ((1n << 51n) | (1n << 52n)).toString();
    const HISTORY_FILTER_HIGH = (1n << 0n).toString();
    const VOTE_FILTER_LOW = (1n << 0n).toString();
    const VOTE_FILTER_HIGH = '0';
    const PENDING_CURATION_LOOKBACK_DAYS = 10;

    function isStale(requestId) {
      return requestId !== activeLoadId;
    }

    function getSelectedRpcValue() {
      return rpcSelect.value === 'custom' ? customRpcEl.value.trim() : rpcSelect.value;
    }

    function getHiveProxyAvatar(username, rawAvatar) {
      const name = typeof username === 'string' ? username.replace(/^@/, '').trim() : '';
      const avatar = typeof rawAvatar === 'string' ? rawAvatar.trim() : '';
      if (!name) return avatar;
      if (!avatar) {
        return `${HIVE_IMAGE_PROXY}/u/${name}/avatar`;
      }
      if (avatar.startsWith(HIVE_IMAGE_PROXY)) {
        return avatar;
      }
      if (/^https?:\/\//i.test(avatar)) {
        return `${HIVE_IMAGE_PROXY}/0x0/${avatar}`;
      }
      return `${HIVE_IMAGE_PROXY}/u/${name}/avatar`;
    }

    function validateRpcUrl(raw) {
      if (!raw) {
        return { ok: false, error: 'Choose an RPC endpoint.' };
      }
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'https:') {
          return { ok: false, error: 'RPC must use https://' };
        }
        if (!parsed.hostname) {
          return { ok: false, error: 'RPC URL is invalid.' };
        }
        return { ok: true, url: parsed.toString() };
      } catch (err) {
        return { ok: false, error: 'RPC URL is invalid.' };
      }
    }

    rpcSelect.addEventListener('change', () => {
      const useCustom = rpcSelect.value === 'custom';
      if (useCustom) {
        setCustomMode(true);
      } else {
        lastRpcChoice = rpcSelect.value;
        setCustomMode(false);
      }
      saveRpcPreference();
      setRpcDot('', 'Not connected');
      setStatus('');
    });

    loadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleLoad();
    });

    voteSlider.addEventListener('input', () => {
      updateVoteDisplay();
    });
    voteSlider.addEventListener('change', () => {
      updateVoteDisplay();
    });
    customRpcEl.addEventListener('change', () => {
      saveRpcPreference();
      setRpcDot('', 'Not connected');
    });
    if (rpcToggleEl) {
      rpcToggleEl.addEventListener('click', () => {
        const fallback = lastRpcChoice || rpcSelect.options[0]?.value || '';
        if (fallback) {
          rpcSelect.value = fallback;
          lastRpcChoice = fallback;
        }
        setCustomMode(false);
        saveRpcPreference();
        setRpcDot('', 'Not connected');
        setStatus('');
      });
    }
    loadRpcPreference();
    setRpcDot('', 'Not connected');
    setStatus('');

    analyticsPills.forEach(pill => {
      pill.addEventListener('click', () => {
        analyticsRange = Number(pill.dataset.range || 7);
        analyticsPills.forEach(p => p.classList.toggle('active', p === pill));
        updateAnalytics(lastTotals, lastPriceFeed, lastAccount, lastDgp);
        if (lastChartBuckets && lastChartDays) {
          renderCharts(lastChartBuckets, lastChartDays, lastPriceFeed, analyticsRange, lastAccount, lastDgp);
        }
      });
    });

    usernameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleLoad();
      }
    });

    function bindCollapse(btnId, bodyId) {
      const btn = document.getElementById(btnId);
      const body = document.getElementById(bodyId);
      if (!btn || !body) return;
      btn.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
        btn.textContent = isHidden ? 'Collapse' : 'Expand';
      });
    }
    bindCollapse('pendingAuthorToggle', 'pendingAuthorBodyWrap');
    bindCollapse('pendingCurationToggle', 'pendingCurationBodyWrap');

    function loadRpcPreference() {
      try {
        const saved = localStorage.getItem('hivelytics.rpc');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.value === 'custom' && parsed.custom) {
            rpcSelect.value = 'custom';
            customRpcEl.value = parsed.custom;
            setCustomMode(true);
          } else if (parsed.value) {
            rpcSelect.value = parsed.value;
            lastRpcChoice = parsed.value;
          }
        }
      } catch (err) {
        console.warn('failed to load rpc pref', err);
      }
      if (rpcSelect.value === 'custom') {
        if (!lastRpcChoice || lastRpcChoice === 'custom') {
          lastRpcChoice = rpcSelect.options[0]?.value || '';
        }
        setCustomMode(true);
      } else {
        lastRpcChoice = rpcSelect.value || lastRpcChoice;
        setCustomMode(false);
      }
    }

    function saveRpcPreference() {
      try {
        const value = rpcSelect.value;
        let custom = customRpcEl.value.trim();
        if (value === 'custom') {
          const validation = validateRpcUrl(custom);
          custom = validation.ok ? validation.url : '';
        } else {
          custom = '';
        }
        localStorage.setItem('hivelytics.rpc', JSON.stringify({ value, custom }));
      } catch (err) {
        console.warn('failed to save rpc pref', err);
      }
    }

    function setStatus(text, isError = false) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.classList.toggle('error', isError);
    }

    function setCustomMode(isCustom) {
      if (!rpcSelectWrap) return;
      rpcSelectWrap.classList.toggle('is-custom', isCustom);
      if (isCustom && customRpcEl) {
        customRpcEl.focus();
      }
    }

    function setRpcDot(state, title = '') {
      if (!rpcDotEl) return;
      rpcDotEl.classList.remove('connected', 'loading', 'error');
      if (state) rpcDotEl.classList.add(state);
      rpcDotEl.title = title;
    }

    function formatRpcLabel(rpc) {
      if (!rpc) return '';
      try {
        const url = new URL(rpc);
        return url.host || rpc;
      } catch (err) {
        return rpc;
      }
    }

    function setRewardsLoading() {
      const tbody = document.getElementById('rewardsTableBody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
      const aprPill = document.getElementById('curationAprPill');
      if (aprPill) aprPill.textContent = 'Curation APR —';
      lastPendingAuthorHp = null;
      pendingAuthorRows = [];
      lastPendingCurationHp = null;
      pendingCurationRows = [];
      setPendingAuthorLoading();
      setPendingCurationLoading();
      clearCharts();
      lastChartBuckets = null;
      lastChartDays = null;
    }

    function parseAssetFloat(asset) {
      if (!asset) return 0;
      return parseFloat(asset.split(' ')[0]);
    }

    function parseAsset(asset) {
      if (!asset || typeof asset !== 'string') {
        return { amountBigInt: 0n, symbol: '', decimals: 0 };
      }
      const parts = asset.trim().split(/\s+/);
      const amountPart = parts[0] || '0';
      const symbol = parts[1] || '';
      const neg = amountPart.startsWith('-');
      const clean = neg ? amountPart.slice(1) : amountPart;
      const [whole = '0', frac = ''] = clean.split('.');
      const decimals = frac.length;
      const digits = `${whole}${frac}` || '0';
      let amountBigInt = BigInt(digits);
      if (neg) amountBigInt = -amountBigInt;
      return { amountBigInt, symbol, decimals };
    }

    function toBigIntSafe(value) {
      if (value === null || value === undefined) return null;
      if (typeof value === 'bigint') return value;
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return BigInt(Math.trunc(value));
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        if (/^[+-]?\d+$/.test(trimmed)) return BigInt(trimmed);
      }
      return null;
    }

    function absBigInt(value) {
      return value < 0n ? -value : value;
    }

    function gcdBigInt(a, b) {
      let x = absBigInt(a);
      let y = absBigInt(b);
      while (y !== 0n) {
        const t = x % y;
        x = y;
        y = t;
      }
      return x;
    }

    function reduceRational(r) {
      if (!r || r.d === 0n) return { n: 0n, d: 1n };
      let n = r.n;
      let d = r.d;
      if (d < 0n) {
        n = -n;
        d = -d;
      }
      const g = gcdBigInt(n, d);
      return { n: n / g, d: d / g };
    }

    function makeRational(n, d = 1n) {
      return reduceRational({ n, d });
    }

    function mulRational(a, b) {
      return reduceRational({ n: a.n * b.n, d: a.d * b.d });
    }

    function divRational(a, b) {
      if (!b || b.n === 0n) return { n: 0n, d: 1n };
      return reduceRational({ n: a.n * b.d, d: a.d * b.n });
    }

    function compareRational(a, b) {
      return a.n * b.d - b.n * a.d;
    }

    function pow10BigInt(exp) {
      if (exp <= 0) return 1n;
      return 10n ** BigInt(exp);
    }

    function assetToRational(asset) {
      const parsed = parseAsset(asset);
      const denom = pow10BigInt(parsed.decimals);
      return makeRational(parsed.amountBigInt, denom);
    }

    function rationalFromNumber(value, decimals = 6) {
      if (value === null || value === undefined || !Number.isFinite(value)) {
        return makeRational(0n, 1n);
      }
      const scale = 10n ** BigInt(decimals);
      const scaled = BigInt(Math.round(value * Number(scale)));
      return makeRational(scaled, scale);
    }

    function formatRationalFixed(r, decimals = 3) {
      if (!r || r.d === 0n) return `0.${'0'.repeat(decimals)}`;
      const neg = r.n < 0n;
      const n = neg ? -r.n : r.n;
      const scale = 10n ** BigInt(decimals);
      const scaled = (n * scale + r.d / 2n) / r.d;
      const whole = scaled / scale;
      const frac = scaled % scale;
      return `${neg ? '-' : ''}${whole.toString()}.${frac.toString().padStart(decimals, '0')}`;
    }

    function rationalToNumber(r) {
      if (!r || r.d === 0n) return 0;
      return Number(r.n) / Number(r.d);
    }

    function format(num, digits = 2) {
      if (num === null || num === undefined || isNaN(num)) return '—';
      return Number(num).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
    }

    function formatCompact(num) {
      if (num === null || num === undefined || isNaN(num)) return '—';
      const abs = Math.abs(num);
      if (abs >= 1e12) return format(num / 1e12, 2) + 'T';
      if (abs >= 1e9) return format(num / 1e9, 2) + 'B';
      if (abs >= 1e6) return format(num / 1e6, 2) + 'M';
      if (abs >= 1e3) return format(num / 1e3, 2) + 'K';
      return format(num, 0);
    }

    function formatDuration(ms) {
      if (!ms || !isFinite(ms) || ms <= 0) return '—';
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      if (days >= 1) return `${days}d`;
      if (hours >= 1) return `${hours}h`;
      return `${Math.max(1, minutes)}m`;
    }

    function parseHiveTime(val) {
      if (!val) return null;
      const iso = val.endsWith('Z') ? val : `${val}Z`;
      const ms = Date.parse(iso);
      return isNaN(ms) ? null : ms;
    }

    function parseTime(val) {
      return parseHiveTime(val);
    }

    function renderPendingAuthor(priceFeed, pendingHp = lastPendingAuthorHp) {}

    function setPendingAuthorLoading() {
      const tableBody = document.getElementById('pendingAuthorBody');
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
      const titleCell = document.getElementById('authSummaryTitle');
      const valCell = document.getElementById('authSummaryValue');
      const hpCell = document.getElementById('authSummaryHp');
      if (titleCell) titleCell.textContent = 'Loading…';
      if (valCell) valCell.textContent = '';
      if (hpCell) hpCell.textContent = '';
    }

    function setPendingAuthorValue(hp, priceFeed) {
      lastPendingAuthorHp = hp;
      if (hp === null || hp === undefined) {
        const tableBody = document.getElementById('pendingAuthorBody');
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="6" class="muted">No data</td></tr>';
        const titleCell = document.getElementById('authSummaryTitle');
        const valCell = document.getElementById('authSummaryValue');
        const hpCell = document.getElementById('authSummaryHp');
        if (titleCell) titleCell.textContent = '—';
        if (valCell) valCell.textContent = '';
        if (hpCell) hpCell.textContent = '';
        return;
      }
      renderPendingAuthor(priceFeed, hp);
    }

    function renderPendingCuration(priceFeed, pendingHp = lastPendingCurationHp) {}

    function setPendingCurationLoading() {
      const tableBody = document.getElementById('pendingCurationBody');
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" class="muted">Loading…</td></tr>';
      const titleCell = document.getElementById('curSummaryTitle');
      const effCell = document.getElementById('curSummaryEff');
      const valCell = document.getElementById('curSummaryValue');
      const hpCell = document.getElementById('curSummaryHp');
      if (titleCell) titleCell.textContent = 'Loading…';
      if (effCell) effCell.textContent = '';
      if (valCell) valCell.textContent = '';
      if (hpCell) hpCell.textContent = '';
    }

    function setPendingCurationValue(hp, priceFeed) {
      lastPendingCurationHp = hp;
      if (hp === null || hp === undefined) {
        const tableBody = document.getElementById('pendingCurationBody');
        if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" class="muted">No data</td></tr>';
        const titleCell = document.getElementById('curSummaryTitle');
        const effCell = document.getElementById('curSummaryEff');
        const valCell = document.getElementById('curSummaryValue');
        const hpCell = document.getElementById('curSummaryHp');
        if (titleCell) titleCell.textContent = '—';
        if (effCell) effCell.textContent = '';
        if (valCell) valCell.textContent = '';
        if (hpCell) hpCell.textContent = '';
        return;
      }
      renderPendingCuration(priceFeed, hp);
    }

    function isHivemindUnsupported(err) {
      const msg = ((err && err.message) || (err && err.jse_shortmsg) || '').toLowerCase();
      return msg.includes('hivemind');
    }

    async function fetchAccountVotes(client, username) {
      const votes = [];
      await fetchHistoryWindow(
        client,
        username,
        PENDING_CURATION_LOOKBACK_DAYS,
        (newOps) => {
          for (const [, item] of newOps) {
            const [opName, op] = item.op || [];
            if (opName === 'vote') {
              if (!op || op.voter !== username) continue;
              votes.push({
                voter: op.voter,
                author: op.author,
                permlink: op.permlink,
                weight: op.weight,
                percent: op.weight,
                rshares: Number(op.rshares || 0),
                timestamp: item.timestamp
              });
            }
          }
        },
        1000,
        true,
        VOTE_FILTER_LOW,
        VOTE_FILTER_HIGH
      );
      return votes;
    }

    async function fetchPendingAuthor(client, username, priceFeed, requestId = activeLoadId) {
      setPendingAuthorLoading();
      lastPendingAuthorHp = null;
      pendingAuthorRows = [];
      if (!client) {
        if (isStale(requestId)) return;
        setPendingAuthorValue(null, priceFeed || lastPriceFeed);
        return;
      }
      try {
        const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const rows = [];
        const seen = new Set();
        let totalHbd = 0;

        const collect = (p) => {
          if (!p || !p.author || !p.permlink) return;
          const key = `${p.author}/${p.permlink}`;
          if (seen.has(key)) return;
          const createdMs = parseHiveTime(p.created || p.posted || p.created_at);
          if (createdMs && createdMs < cutoffMs) return;
          const cashoutStr = p.cashout_time || p.payout_at || p.payout_time || '';
          const cashout = parseHiveTime(cashoutStr);
          if (!cashout || isNaN(cashout) || cashout <= Date.now()) return;
          const maxPayout = parseAssetFloat(p.max_accepted_payout || p.max_accepted_payout_value || '0');
          if (maxPayout === 0) return;
          const pending = parseAssetFloat(p.pending_payout_value || '0');
          if (p.is_paidout === true) return;
          const beneficiaries = Array.isArray(p.beneficiaries) ? p.beneficiaries : [];
          const beneCut = beneficiaries.reduce((acc, b) => acc + (Number(b.weight) || 0), 0) / 10000;
          const authorShare = Math.max(0, Math.min(1, 1 - beneCut));
          seen.add(key);
          totalHbd += pending * authorShare;
          rows.push({
            author: p.author,
            permlink: p.permlink,
            title: p.title,
            isComment: !!p.parent_author,
            payoutMs: cashout - Date.now(),
            hbd: pending * authorShare,
            hpEq: null,
            beneficiaryCut: beneCut
          });
        };

        const fetchBridge = async (sort) => {
          const limit = 20;
          const maxPages = 30;
          let start_author = null;
          let start_permlink = null;
          for (let page = 0; page < maxPages; page++) {
            const params = { sort, account: username, observer: username, limit, start_author, start_permlink };
            const res = await client.call('bridge', 'get_account_posts', [params]);
            if (!Array.isArray(res) || !res.length) break;
            res.forEach(collect);
            const last = res[res.length - 1];
            const lastCreated = parseHiveTime(last?.created || last?.posted || last?.created_at);
            start_author = last?.author || null;
            start_permlink = last?.permlink || null;
            if ((res.length < limit) || !start_author || !start_permlink) break;
            if (lastCreated && lastCreated < cutoffMs) break;
          }
        };

        try {
          await fetchBridge('posts');
          await fetchBridge('comments');
        } catch (err) {
          console.warn('bridge fetch failed', err);
        }

        rows.sort((a, b) => (a?.payoutMs || 0) - (b?.payoutMs || 0));

        const price = priceFeed
          ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
          : (lastPriceFeed ? (parseAssetFloat(lastPriceFeed.base) / parseAssetFloat(lastPriceFeed.quote || '1.000 HIVE')) : 0);
        const hpEq = price ? (totalHbd / price) : 0;
        if (price) {
          rows.forEach(r => { r.hpEq = (r.hbd || 0) / price; });
        }
        if (isStale(requestId)) return;
        pendingAuthorRows = rows;
        renderPendingAuthorTable(rows, priceFeed || lastPriceFeed);
        setPendingAuthorValue(hpEq, priceFeed || lastPriceFeed);
      } catch (err) {
        console.error(err);
        if (!isStale(requestId)) {
          setPendingAuthorValue(null, priceFeed || lastPriceFeed);
        }
      }
    }

    async function fetchPendingCuration(client, username, priceFeed, rewardFund = lastRewardFund, dgp = lastDgp, requestId = activeLoadId) {
      setPendingCurationLoading();
      lastPendingCurationHp = null;
      pendingCurationRows = [];
      pendingCurationEligibleVoteCount = 0;
      pendingCurationProcessedVoteCount = 0;
      if (!client) {
        if (isStale(requestId)) return;
        setPendingCurationValue(null, priceFeed || lastPriceFeed);
        return;
      }
      try {
        let rf = rewardFund || lastRewardFund;
        let pf = priceFeed || lastPriceFeed;
        let dgpData = dgp || lastDgp;
        if (!pf) {
          pf = await client.call('condenser_api', 'get_current_median_history_price', []).catch(() => null);
        }
        if (!dgpData) {
          dgpData = await client.call('condenser_api', 'get_dynamic_global_properties', []).catch(() => null);
        }

        const votes = await fetchAccountVotes(client, username);
        const cutoff = Date.now() - PENDING_CURATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
        const latestByTarget = new Map();
        for (const v of votes) {
          const ts = parseHiveTime(v.timestamp);
          if (!ts || isNaN(ts) || ts < cutoff) continue;
          const { author, permlink } = parseAuthorPerm(v);
          if (!author || !permlink) continue;
          const key = `${author}/${permlink}`;
          const prev = latestByTarget.get(key);
          if (!prev || ts > prev.ts) {
            latestByTarget.set(key, { v, ts });
          }
        }
        const filtered = Array.from(latestByTarget.values())
          .sort((a, b) => b.ts - a.ts)
          .map(item => item.v);
        pendingCurationEligibleVoteCount = filtered.length;
        if (!filtered.length) {
          if (isStale(requestId)) return;
          setPendingCurationValue(0, pf);
          renderPendingCurationTable([], pf);
          return;
        }

        const candidates = filtered;
        pendingCurationProcessedVoteCount = candidates.length;
        const results = [];
        const batchSize = 6;
        for (let i = 0; i < candidates.length; i += batchSize) {
          const batch = candidates.slice(i, i + batchSize).map(v =>
            estimateVoteCuration(client, v, username, rf, pf, dgpData)
          );
          const batchResults = await Promise.all(batch);
          batchResults.forEach(res => {
            if (res && res.hp) results.push(res);
          });
        }

        const validResults = results.filter(r => r && r.payoutMs > 0);
        validResults.sort((a, b) => (a?.payoutMs || 0) - (b?.payoutMs || 0));
        if (isStale(requestId)) return;
        pendingCurationRows = validResults;
        const totalHp = validResults.reduce((acc, r) => acc + (r.hp || 0), 0);
        setPendingCurationValue(totalHp, pf);
        renderPendingCurationTable(validResults, pf);
      } catch (err) {
        console.error(err);
        if (!isStale(requestId)) {
          setPendingCurationValue(null, priceFeed || lastPriceFeed);
        }
      }
    }

    function repScore(raw) {
      if (raw === null || raw === undefined) return 0;
      const rep = parseFloat(raw);
      if (isNaN(rep)) return 0;
      const neg = rep < 0;
      let level = Math.log10(Math.abs(rep));
      level = Math.max(level - 9, 0);
      level = (neg ? -1 : 1) * level;
      level = level * 9 + 25;
      return level.toFixed(2);
    }

    function vestsToHp(vests, dgp) {
      const vestNum = typeof vests === 'string' ? parseAssetFloat(vests) : vests;
      const tf = parseAssetFloat(dgp.total_vesting_fund_hive);
      const ts = parseAssetFloat(dgp.total_vesting_shares);
      if (!ts) return 0;
      return vestNum * tf / ts;
    }

    function getEffectiveHp(account, dgp) {
      if (!account || !dgp) return 0;
      const vesting = parseAssetFloat(account.vesting_shares);
      const delegatedOut = parseAssetFloat(account.delegated_vesting_shares);
      const receivedVests = parseAssetFloat(account.received_vesting_shares);
      const effectiveVests = vesting - delegatedOut + receivedVests;
      return vestsToHp(effectiveVests, dgp);
    }

    function getOwnedHp(account, dgp) {
      if (!account || !dgp) return 0;
      const vesting = parseAssetFloat(account.vesting_shares);
      return vestsToHp(vesting, dgp);
    }

    function computeManabar(mana, max, lastUpdate) {
      const regenSeconds = 5 * 24 * 60 * 60;
      const now = Math.floor(Date.now() / 1000);
      const delta = Math.max(now - lastUpdate, 0);
      const regenerated = max * delta / regenSeconds;
      const current = Math.min(max, mana + regenerated);
      const pct = max ? (current / max) * 100 : 0;
      return { current, percent: pct };
    }

    function updateCurationApr(totals, dgp, account) {
      const pill = document.getElementById('curationAprPill');
      if (!pill) return;
      const acct = account || lastAccount;
      const dgpVal = dgp || lastDgp;
      if (!totals || (!totals['7'] && !totals['30']) || !acct || !dgpVal) {
        pill.textContent = 'Curation APR —';
        return;
      }
      const vesting = parseAssetFloat(acct.vesting_shares);
      const delegatedOut = parseAssetFloat(acct.delegated_vesting_shares);
      const receivedVests = parseAssetFloat(acct.received_vesting_shares);
      const effectiveVests = vesting - delegatedOut + receivedVests;
      const effectiveHp = vestsToHp(effectiveVests, dgpVal);
      const curation30 = totals['30']?.curation?.hp || 0;
      const curation7 = totals['7']?.curation?.hp || 0;
      const windowHp = curation30 || curation7;
      const windowDays = curation30 ? 30 : (curation7 ? 7 : 0);
      if (!effectiveHp || effectiveHp <= 0 || !windowHp || !windowDays) {
        pill.textContent = 'Curation APR —';
        return;
      }
      const apr = (windowHp * (365 / windowDays) / effectiveHp) * 100;
      pill.textContent = `Curation APR ${format(apr, 2)}%`;
    }

    function updateAnalytics(totals, priceFeed, account, dgp) {
      const price = priceFeed
        ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
        : (lastPriceFeed ? (parseAssetFloat(lastPriceFeed.base) / parseAssetFloat(lastPriceFeed.quote || '1.000 HIVE')) : 1);

      const setVal = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };

      lastTotals = totals || null;

      if (!totals) {
        setVal('analyticsAuthor', '—');
        setVal('analyticsCuration', '—');
        setVal('analyticsWitness', '—');
        setVal('analyticsInterest', '—');
        return;
      }

      const rangeKey = analyticsRange === 30 ? '30' : '7';
      const bucket = totals[rangeKey] || null;
      const formatHpUsd = (asset) => {
        if (!asset) return '—';
        const hp = asset.hp || 0;
        const hive = asset.hive || 0;
        const hbd = asset.hbd || 0;
        const hpEq = hp + hive + (price ? (hbd / price) : 0);
        const usd = hpEq * price;
        return `${format(hpEq, 3)} HP ~$${format(usd, 2)}`;
      };

      setVal('analyticsAuthor', formatHpUsd(bucket?.author));
      setVal('analyticsCuration', formatHpUsd(bucket?.curation));
      setVal('analyticsWitness', formatHpUsd(bucket?.witness));

      const acct = account || lastAccount;
      const dgpVal = dgp || lastDgp;
      const rateRaw = dgpVal
        ? (dgpVal.current_hbd_interest_rate ?? dgpVal.hbd_interest_rate ?? 0)
        : 0;
      const interestRate = (parseFloat(rateRaw) || 0) / 10000;
      const hbdBalance = acct ? (parseAssetFloat(acct.hbd_balance) + parseAssetFloat(acct.savings_hbd_balance)) : 0;
      if (!acct || !interestRate || !hbdBalance) {
        setVal('analyticsInterest', '—');
      } else {
        const interestDays = analyticsRange === 30 ? 30 : 7;
        const interestHbd = hbdBalance * interestRate * (interestDays / 365);
        setVal('analyticsInterest', `${format(interestHbd, 3)} HBD`);
      }
    }

    async function handleLoad() {
      const requestId = ++activeLoadId;
      const username = usernameEl.value.trim().replace(/^@/, '');
      const rpcValidation = validateRpcUrl(getSelectedRpcValue());
      const hiveLib = window.dhive;
      if (!hiveLib) {
        setStatus('Hive JS library failed to load.', true);
        setRpcDot('error', 'Hive JS library failed to load.');
        return;
      }

      if (!username) {
        setStatus('Enter an account name.', true);
        return;
      }
      if (!rpcValidation.ok) {
        setStatus(rpcValidation.error, true);
        setRpcDot('error', rpcValidation.error);
        return;
      }
      const rpc = rpcValidation.url;

      const rpcLabel = formatRpcLabel(rpc);
      setRewardsLoading();
      if (!hasLoaded) {
        setStatus('Connecting…');
      }
      setRpcDot('loading', `Connecting to ${rpcLabel}`);
      loadBtn.disabled = true;
      loadBtn.textContent = 'Loading…';

      try {
        const client = new hiveLib.Client(rpc, { timeout: 8000 });
        const [account] = await client.database.getAccounts([username]);
        if (!account) {
          throw new Error('Account not found');
        }

        const [dgp, rewardFund, priceFeed, rcRes, profileRes] = await Promise.all([
            client.database.getDynamicGlobalProperties(),
            client.call('condenser_api', 'get_reward_fund', ['post']),
            client.call('condenser_api', 'get_current_median_history_price', []),
            client.call('condenser_api', 'find_rc_accounts', [[username]]).catch(() => []),
            client.call('bridge', 'get_profile', [{ account: username, observer: username }]).catch(() => null)
          ]);
        const rcAccount = Array.isArray(rcRes) ? rcRes[0] : (rcRes?.rc_accounts?.[0] || null);
        const profile = profileRes?.profile || profileRes || null;

        if (isStale(requestId)) return;
        lastRewardFund = rewardFund;
        lastPriceFeed = priceFeed;
        lastAccount = account;
        lastDgp = dgp;
        lastRcAccount = rcAccount || null;
        lastProfile = profile || null;

        renderAccount(account, dgp, rewardFund, priceFeed, rcAccount, profile);

        fetchPendingAuthor(client, username, priceFeed, requestId);
        fetchPendingCuration(client, username, priceFeed, rewardFund, dgp, requestId);
        fetchRewards(client, username, dgp, priceFeed, account, requestId);

        syncUrlUsername(username);
        setStatus('');
        setRpcDot('connected', `Connected to ${rpcLabel}`);
        hasLoaded = true;
        document.getElementById('dataWrap').style.display = 'block';
        updateVoteDisplay();
      } catch (err) {
        console.error(err);
        if (!isStale(requestId)) {
          const message = err.message || 'Failed to load';
          setStatus(message, true);
          setRpcDot('error', message);
          resetData();
          if (!hasLoaded) {
            document.getElementById('dataWrap').style.display = 'none';
          }
        }
      } finally {
        if (!isStale(requestId)) {
          loadBtn.disabled = false;
          loadBtn.textContent = 'Load account';
        }
      }
    }

    function resetData() {
      document.getElementById('accountReputation').textContent = '—';
      document.getElementById('accountAvatar').src = avatarPlaceholder;
      document.getElementById('accountName').textContent = '—';
      document.getElementById('accountMeta').textContent = 'Ready.';
      document.getElementById('accountBio').textContent = '—';
      document.getElementById('voteValue').textContent = 'Vote @100%: —';
      document.getElementById('statEffectiveHp').textContent = '—';
      document.getElementById('statHivePower').textContent = '—';
      document.getElementById('statReceivedDel').textContent = '—';
      document.getElementById('statSentDel').textContent = '—';
      document.getElementById('statPowerDown').textContent = '—';
      document.getElementById('statRc').textContent = '—';
      const aprPill = document.getElementById('curationAprPill');
      if (aprPill) aprPill.textContent = 'Curation APR —';
      document.getElementById('analyticsAuthor').textContent = '—';
      document.getElementById('analyticsCuration').textContent = '—';
      document.getElementById('analyticsWitness').textContent = '—';
      document.getElementById('analyticsInterest').textContent = '—';
      voteSlider.value = 100;
      clearCharts();
      lastChartBuckets = null;
      lastChartDays = null;
      lastAccount = null;
      lastDgp = null;
      lastRewardFund = null;
      lastPriceFeed = null;
      lastRcAccount = null;
      lastProfile = null;
      lastTotals = null;
      setPendingAuthorValue(null, null);
      setPendingCurationValue(null, null);
      lastPendingCurationHp = null;
      pendingCurationRows = [];
      const authBody = document.getElementById('pendingAuthorBody');
      if (authBody) authBody.innerHTML = '<tr><td colspan="6" class="muted">No data</td></tr>';
      const curBody = document.getElementById('pendingCurationBody');
      if (curBody) curBody.innerHTML = '<tr><td colspan="8" class="muted">No data</td></tr>';
      const titleCell = document.getElementById('curSummaryTitle');
      const effCell = document.getElementById('curSummaryEff');
      const valCell = document.getElementById('curSummaryValue');
      const hpCell = document.getElementById('curSummaryHp');
      if (titleCell) titleCell.textContent = '—';
      if (effCell) effCell.textContent = '';
      if (valCell) valCell.textContent = '';
      if (hpCell) hpCell.textContent = '';
      document.getElementById('rewardsTableBody').innerHTML = '<tr><td colspan="5" class="muted">No data</td></tr>';
      if (!hasLoaded) {
        document.getElementById('dataWrap').style.display = 'none';
      }
    }

    function renderAccount(account, dgp, rewardFund, priceFeed, rcAccount = null, profile = null) {
      lastAccount = account;
      lastDgp = dgp;
      const ownVests = parseAssetFloat(account.vesting_shares);
      const delegatedOut = parseAssetFloat(account.delegated_vesting_shares);
      const received = parseAssetFloat(account.received_vesting_shares);
      const ownHp = vestsToHp(ownVests - delegatedOut, dgp);
      const receivedHp = vestsToHp(received, dgp);
      const delegatedHp = vestsToHp(delegatedOut, dgp);
      const netHp = ownHp + receivedHp;
      const rep = (profile && profile.reputation !== undefined && profile.reputation !== null)
        ? format(parseFloat(profile.reputation), 2)
        : repScore(account.reputation);

      document.getElementById('accountReputation').textContent = 'Reputation ' + rep;
      const parsedProfile = parseProfile(account);
      const avatarUrl = getHiveProxyAvatar(account.name, parsedProfile.avatar);
      const bio = parsedProfile.bio;
      document.getElementById('accountAvatar').src = avatarUrl || avatarPlaceholder;
      document.getElementById('accountAvatar').alt = account.name + ' avatar';
      document.getElementById('accountName').textContent = account.name;
      document.getElementById('accountMeta').textContent = `Created ${new Date(account.created).toLocaleDateString()} • ${format(account.post_count, 0)} posts`;
      document.getElementById('accountBio').textContent = bio || '—';
      updateVoteDisplay(account, dgp, rewardFund, priceFeed);

      renderStakeStats(account, dgp, rcAccount || lastRcAccount);
    }

    function renderStakeStats(account, dgp, rcAccount = null) {
      const vesting = parseAssetFloat(account.vesting_shares);
      const delegatedOut = parseAssetFloat(account.delegated_vesting_shares);
      const receivedVests = parseAssetFloat(account.received_vesting_shares);
      const effectiveVests = vesting - delegatedOut + receivedVests;
      const totalHp = vestsToHp(vesting, dgp);
      const effectiveHp = vestsToHp(effectiveVests, dgp);
      const receivedHp = vestsToHp(receivedVests, dgp);
      const delegatedHp = vestsToHp(delegatedOut, dgp);
      const powerDownHp = vestsToHp(parseAssetFloat(account.vesting_withdraw_rate), dgp);

      const rcSource = rcAccount || {};
      const rcMana = rcSource.rc_manabar || {};
      const rcFallback = Math.max(0, effectiveVests * 1e6);
      const maxRc = Number((rcSource && rcSource.max_rc) || rcFallback);
      const rcCurrentBase = rcMana && rcMana.current_mana !== undefined ? Number(rcMana.current_mana) : rcFallback;
      const rcCurrent = maxRc ? Math.min(maxRc, rcCurrentBase) : rcCurrentBase;
      const rc = computeManabar(rcCurrent, maxRc, Number(rcMana.last_update_time || 0));
      const rcText = maxRc ? `${format(rc.percent, 1)}% (${formatCompact(rc.current)}/${formatCompact(maxRc)})` : '—';

      document.getElementById('statEffectiveHp').textContent = `${format(effectiveHp, 3)} HP`;
      document.getElementById('statHivePower').textContent = `${format(totalHp, 3)} HP`;
      document.getElementById('statReceivedDel').textContent = `${format(receivedHp, 3)} HP`;
      document.getElementById('statSentDel').textContent = `${format(delegatedHp, 3)} HP`;
      document.getElementById('statPowerDown').textContent = powerDownHp ? `${format(powerDownHp, 3)} HP / wk` : '—';
      document.getElementById('statRc').textContent = rcText;
    }

    async function fetchRewards(client, username, dgp, priceFeed, account, requestId = activeLoadId) {
      try {
        const now = new Date();
        const nowMs = now.getTime();
        const msInDay = 24 * 60 * 60 * 1000;
        const todayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const rangeCutoffs = {
          todayStart: todayStartUtc,
          tomorrowStart: todayStartUtc + msInDay,
          yesterdayStart: todayStartUtc - msInDay,
          sevenDayStart: todayStartUtc - 6 * msInDay,
          thirtyDayStart: todayStartUtc - 29 * msInDay,
        };
        const price = priceFeed ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE')) : 1;
        const dayInfo = buildDayBuckets();
        const dayKeySet = new Set(dayInfo.map(d => d.key));
        const totals = initRewardBuckets(dayInfo);
        const chartDays = buildChartDays(30);
        const chartDaySet = new Set(chartDays.map(d => d.key));
        const chartBuckets = initChartMap(chartDays);
        const acct = account || lastAccount;
        if (acct) {
          const postHp = (acct.posting_rewards || 0) / 1000;
          const curHp = (acct.curation_rewards || 0) / 1000;
          totals.all.author.hp += postHp;
          totals.all.curation.hp += curHp;
          totals.all.total.hp += postHp + curHp;
          totals.all.totalUSD = totals.all.total.hbd + (totals.all.total.hive * price) + (totals.all.total.hp * price);
        }

        const processItem = (item) => {
          const ts = parseHiveTime(item.timestamp);
          if (!ts) return;
          const ageDays = (nowMs - ts) / msInDay;
          if (ageDays > 30) return;
          const dayName = new Date(ts).toLocaleDateString('en', { weekday: 'short' });
          const [type, op] = item.op;

          if (type === 'author_reward') {
            const hp = vestsToHp(parseAssetFloat(op.vesting_payout), dgp);
            const hive = parseAssetFloat(op.hive_payout);
            const hbd = parseAssetFloat(op.hbd_payout);
            addRewardBucket(totals, 'author', ageDays, ts, dayName, hive, hbd, hp, price, dayKeySet, rangeCutoffs);
            addChartBucket(chartBuckets, chartDaySet, ts, hive, hbd, hp, 'author');
          } else if (type === 'curation_reward') {
            const hp = vestsToHp(parseAssetFloat(op.reward), dgp);
            addRewardBucket(totals, 'curation', ageDays, ts, dayName, 0, 0, hp, price, dayKeySet, rangeCutoffs);
            addChartBucket(chartBuckets, chartDaySet, ts, 0, 0, hp, 'curation');
          } else if (type === 'producer_reward') {
            const hp = vestsToHp(parseAssetFloat(op.vesting_shares), dgp);
            addRewardBucket(totals, 'witness', ageDays, ts, dayName, 0, 0, hp, price, dayKeySet, rangeCutoffs);
            addChartBucket(chartBuckets, chartDaySet, ts, 0, 0, hp, 'witness');
          } else if (type === 'transfer_to_vesting') {
            if (op.to === username) {
              const hiveAmt = parseAssetFloat(op.amount);
              addHpDelta(chartBuckets, chartDaySet, ts, hiveAmt);
            }
          } else if (type === 'fill_vesting_withdraw') {
            if (op.from_account === username) {
              const withdrawnVests = parseAssetFloat(op.withdrawn);
              const hpDown = -vestsToHp(withdrawnVests, dgp);
              addHpDelta(chartBuckets, chartDaySet, ts, hpDown);
              if (op.to_account && op.to_account !== username) {
                addPowerDownTo(chartBuckets, chartDaySet, ts, Math.abs(hpDown));
              }
            }
          } else if (type === 'return_vesting_delegation') {
            if (op.account === username) {
              const hpGain = vestsToHp(parseAssetFloat(op.vesting_shares), dgp);
              addHpDelta(chartBuckets, chartDaySet, ts, hpGain);
            }
          } else if (type === 'comment_benefactor_reward') {
            if (op.benefactor === username) {
              const hp = vestsToHp(parseAssetFloat(op.vesting_payout), dgp);
              addChartBucket(chartBuckets, chartDaySet, ts, 0, 0, hp, 'benefactor');
            }
          }
        };

        await fetchHistoryWindow(client, username, 30, (newOps) => {
          if (isStale(requestId)) return;
          for (const [, item] of newOps) {
            processItem(item);
          }
          renderRewardsTableFromTotals(totals, priceFeed || lastPriceFeed, acct, dayInfo, dgp);
        }, 1000, false);

        if (isStale(requestId)) return;
        lastChartBuckets = chartBuckets;
        lastChartDays = chartDays;
        renderRewardsTableFromTotals(totals, priceFeed || lastPriceFeed, acct, dayInfo, dgp);
        renderCharts(chartBuckets, chartDays, priceFeed || lastPriceFeed, analyticsRange, acct || lastAccount, dgp || lastDgp);
      } catch (err) {
        console.error(err);
      }
    }

    function parseAuthorPerm(vote) {
      if (!vote) return { author: '', permlink: '' };
      if (vote.author && vote.permlink) {
        return { author: vote.author, permlink: vote.permlink };
      }
      if (vote.authorperm) {
        const [author, ...rest] = vote.authorperm.split('/');
        return { author, permlink: rest.join('/') };
      }
      return { author: '', permlink: '' };
    }

    function buildZeroCurationEstimate() {
      return {
        estimated_vests: '0.000 VESTS',
        estimated_hp: '0.000 HP',
        share_numer: '0',
        share_denom: '1',
        rshares_share_numer: '0',
        rshares_share_denom: '1',
        curation_pool_hive: '0.000000 HIVE',
        post_payout_hive: '0.000000 HIVE'
      };
    }

    async function estimatePendingCurationReward(params) {
      const {
        rpc,
        author,
        permlink,
        curator,
        hiveHbdPriceOverride,
        rewardFund = null,
        priceFeed = null,
        dgp = null,
        content: contentOverride = null,
        activeVotes: votesOverride = null
      } = params || {};

      if (!rpc || !author || !permlink || !curator) return buildZeroCurationEstimate();

      const content = contentOverride || await rpc.call('condenser_api', 'get_content', [author, permlink]);
      if (!content) return buildZeroCurationEstimate();
      if (content.allow_curation_rewards === false) return buildZeroCurationEstimate();

      const cashoutMs = parseTime(content.cashout_time);
      if (!cashoutMs || cashoutMs <= Date.now()) return buildZeroCurationEstimate();

      const maxPayout = parseAsset(content.max_accepted_payout);
      if (maxPayout.amountBigInt <= 0n) return buildZeroCurationEstimate();

      const activeVotes = (Array.isArray(content.active_votes) && content.active_votes.length)
        ? content.active_votes
        : (votesOverride || await rpc.call('condenser_api', 'get_active_votes', [author, permlink]));

      if (!Array.isArray(activeVotes) || !activeVotes.length) return buildZeroCurationEstimate();

      const curatorVote = activeVotes.find(v => v.voter === curator);
      const curatorRshares = toBigIntSafe(curatorVote?.rshares);
      if (!curatorRshares || curatorRshares <= 0n) return buildZeroCurationEstimate();

      let priceRat = null;
      if (typeof hiveHbdPriceOverride === 'number' && Number.isFinite(hiveHbdPriceOverride) && hiveHbdPriceOverride > 0) {
        priceRat = rationalFromNumber(hiveHbdPriceOverride, 6);
      } else {
        const pf = priceFeed || await rpc.call('condenser_api', 'get_current_median_history_price', []);
        if (pf?.base) {
          const baseRat = assetToRational(pf.base);
          const quoteRat = assetToRational(pf.quote || '1.000 HIVE');
          priceRat = divRational(baseRat, quoteRat);
        }
      }
      if (!priceRat || priceRat.n <= 0n) return buildZeroCurationEstimate();

      let rewardWeightBps = toBigIntSafe(content.reward_weight);
      if (rewardWeightBps === null) rewardWeightBps = 10000n;
      if (rewardWeightBps <= 0n) return buildZeroCurationEstimate();

      const pendingPayoutRat = assetToRational(content.pending_payout_value || '0');
      if (pendingPayoutRat.n <= 0n) return buildZeroCurationEstimate();

      const curationBps = toBigIntSafe(rewardFund?.percent_curation_rewards) ?? 5000n;
      const curationPoolHbd = mulRational(pendingPayoutRat, makeRational(curationBps, 10000n));

      let totalPositiveRshares = 0n;
      for (const vote of activeVotes) {
        const rs = toBigIntSafe(vote?.rshares);
        if (rs && rs > 0n) totalPositiveRshares += rs;
      }

      const voteWeight = toBigIntSafe(curatorVote?.weight);
      const totalVoteWeight = toBigIntSafe(content.total_vote_weight);
      let share = makeRational(0n, 1n);
      if (voteWeight && voteWeight > 0n && totalVoteWeight && totalVoteWeight > 0n) {
        share = makeRational(voteWeight, totalVoteWeight);
      } else {
        if (totalPositiveRshares <= 0n) return buildZeroCurationEstimate();
        share = makeRational(curatorRshares, totalPositiveRshares);
      }

      if (share.n <= 0n || share.d <= 0n) return buildZeroCurationEstimate();

      const estCurationHbd = mulRational(curationPoolHbd, share);
      const estCurationHive = divRational(estCurationHbd, priceRat);

      const dgpData = dgp || await rpc.call('condenser_api', 'get_dynamic_global_properties', []);
      if (!dgpData) return buildZeroCurationEstimate();

      const totalVestingFund = assetToRational(dgpData.total_vesting_fund_hive);
      const totalVestingShares = assetToRational(dgpData.total_vesting_shares);
      const hivePerVest = divRational(totalVestingFund, totalVestingShares);
      const estVests = divRational(estCurationHive, hivePerVest);
      const estHp = mulRational(estVests, hivePerVest);

      const rsharesShare = totalPositiveRshares > 0n ? makeRational(curatorRshares, totalPositiveRshares) : makeRational(0n, 1n);

      const payoutHive = divRational(pendingPayoutRat, priceRat);
      const curationPoolHive = divRational(curationPoolHbd, priceRat);
      const output = {
        estimated_vests: `${formatRationalFixed(estVests, 3)} VESTS`,
        estimated_hp: `${formatRationalFixed(estHp, 3)} HP`,
        share_numer: share.n.toString(),
        share_denom: share.d.toString(),
        rshares_share_numer: rsharesShare.n.toString(),
        rshares_share_denom: rsharesShare.d.toString(),
        curation_pool_hive: `${formatRationalFixed(curationPoolHive, 6)} HIVE`,
        post_payout_hive: `${formatRationalFixed(payoutHive, 6)} HIVE`,
        curator_rshares: curatorRshares.toString(),
        reward_weight_bps: rewardWeightBps.toString(),
        curation_bps: curationBps.toString()
      };

      output.estimated_hbd = `${formatRationalFixed(estCurationHbd, 3)} HBD`;

      return output;
    }

    async function fetchActualCurationReward(params) {
      const {
        rpc,
        author,
        permlink,
        curator,
        dgp = null,
        maxLookbackDays = 30
      } = params || {};

      if (!rpc || !author || !permlink || !curator) return null;

      const content = await rpc.call('condenser_api', 'get_content', [author, permlink]);
      if (!content) return null;
      const cashoutMs = parseTime(content.cashout_time);
      if (!cashoutMs || cashoutMs > Date.now()) return null;

      const cutoff = maxLookbackDays ? (Date.now() - maxLookbackDays * 24 * 60 * 60 * 1000) : null;
      const filterLow = (1n << 52n).toString();
      const filterHigh = '0';
      const limit = 1000;
      let start = -1;
      let pages = 0;
      let found = null;

      while (pages < 20 && start >= -1) {
        const chunk = await rpc.call('condenser_api', 'get_account_history', [curator, start, limit, filterLow, filterHigh]);
        if (!chunk || !chunk.length) break;
        for (let i = chunk.length - 1; i >= 0; i -= 1) {
          const [, item] = chunk[i];
          const ts = parseTime(item?.timestamp);
          if (cutoff && ts && ts < cutoff) {
            pages = 999;
            break;
          }
          const opEntry = item?.op;
          const type = Array.isArray(opEntry) ? opEntry[0] : null;
          const op = Array.isArray(opEntry) ? opEntry[1] : opEntry;
          if (type !== 'curation_reward' || !op) continue;
          if (op.comment_author === author && op.comment_permlink === permlink) {
            found = { op, timestamp: item.timestamp };
            break;
          }
        }
        if (found || chunk[0][0] <= 0) break;
        start = chunk[0][0] - 1;
        pages += 1;
      }

      if (!found) return null;

      const dgpData = dgp || await rpc.call('condenser_api', 'get_dynamic_global_properties', []);
      if (!dgpData) return null;

      const rewardVests = assetToRational(found.op.reward);
      const totalVestingFund = assetToRational(dgpData.total_vesting_fund_hive);
      const totalVestingShares = assetToRational(dgpData.total_vesting_shares);
      const hivePerVest = divRational(totalVestingFund, totalVestingShares);
      const rewardHp = mulRational(rewardVests, hivePerVest);

      return {
        reward_vests: `${formatRationalFixed(rewardVests, 3)} VESTS`,
        reward_hp: `${formatRationalFixed(rewardHp, 3)} HP`,
        reward_raw: found.op.reward,
        timestamp: found.timestamp,
        author,
        permlink,
        curator
      };
    }

    async function estimateVoteCuration(client, vote, username, rewardFund, priceFeed, dgp) {
      if (!vote) return 0;
      if ((vote.percent || 0) <= 0) return 0;
      try {
        const { author, permlink } = parseAuthorPerm(vote);
        if (!author || !permlink) return 0;
        const content = await client.call('condenser_api', 'get_content', [author, permlink]);
        if (!content) return 0;
        if (content.allow_curation_rewards === false) return 0;
        const maxPayout = parseAsset(content.max_accepted_payout);
        if (maxPayout.amountBigInt <= 0n) return 0;
        const cashout = parseTime(content.cashout_time);
        if (!cashout || isNaN(cashout) || cashout <= Date.now()) return 0;

        const activeVotes = (Array.isArray(content.active_votes) && content.active_votes.length)
          ? content.active_votes
          : await client.call('condenser_api', 'get_active_votes', [author, permlink]);

        const estimate = await estimatePendingCurationReward({
          rpc: client,
          author,
          permlink,
          curator: username,
          rewardFund,
          priceFeed,
          dgp,
          content,
          activeVotes
        });

        const hpVal = parseAssetFloat(estimate.estimated_hp);
        if (!hpVal || hpVal <= 0) return 0;
        const hbdVal = estimate.estimated_hbd ? parseAssetFloat(estimate.estimated_hbd) : 0;

        const createdMs = parseTime(content.created) || null;
        const voteInfo = Array.isArray(activeVotes) ? activeVotes.find(v => v.voter === username) : null;
        const voteTimeMs = voteInfo?.time ? parseTime(voteInfo.time) : (vote.timestamp ? parseTime(vote.timestamp) : null);
        const votedAfterMs = createdMs && voteTimeMs ? Math.max(0, voteTimeMs - createdMs) : null;

        let votePercent = Number(vote.weight || vote.percent || 0);
        if (voteInfo && voteInfo.percent !== undefined && voteInfo.percent !== null) {
          votePercent = Number(voteInfo.percent);
        }

        let efficiency = null;
        const shareNumer = toBigIntSafe(estimate.share_numer);
        const shareDenom = toBigIntSafe(estimate.share_denom);
        const baseNumer = toBigIntSafe(estimate.rshares_share_numer);
        const baseDenom = toBigIntSafe(estimate.rshares_share_denom);
        if (shareNumer && shareDenom && shareDenom > 0n) {
          if (baseNumer && baseDenom && baseDenom > 0n) {
            const effRat = divRational(makeRational(shareNumer, shareDenom), makeRational(baseNumer, baseDenom));
            efficiency = rationalToNumber(mulRational(effRat, makeRational(100n, 1n)));
          } else {
            efficiency = 100;
          }
        }

        return {
          hp: hpVal,
          hbd: hbdVal,
          author,
          permlink,
          title: content.title || `${author}/${permlink}`,
          payoutMs: cashout - Date.now(),
          votedAfterMs,
          weightPct: (votePercent || 0) / 100,
          efficiency,
          isComment: !!content.parent_author
        };
      } catch (err) {
        if (isHivemindUnsupported(err)) {
          throw err;
        }
        return 0;
      }
    }

    async function fetchHistoryWindow(client, username, days, onChunk, pageSize = 1000, useFilter = true, filterLow = HISTORY_FILTER_LOW, filterHigh = HISTORY_FILTER_HIGH) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const limit = pageSize;
      const seen = new Map();
      let useFilterFlag = useFilter;

      const fetchChunk = async (s) => {
        const params = useFilterFlag
          ? [username, s, limit, filterLow, filterHigh]
          : [username, s, limit];
        return client.call('condenser_api', 'get_account_history', params);
      };

      const fetchWithFallback = async (s) => {
        try {
          return await fetchChunk(s);
        } catch (err) {
          if (useFilterFlag) {
            useFilterFlag = false;
            return fetchChunk(s);
          }
          throw err;
        }
      };

      const processChunk = (chunk) => {
        if (!chunk || !chunk.length) return Number.MAX_VALUE;
        const newOps = [];
        for (const [seq, op] of chunk) {
          if (!seen.has(seq)) {
            seen.set(seq, [seq, op]);
            newOps.push([seq, op]);
          }
        }
        if (onChunk && newOps.length) onChunk(newOps);
        const oldest = parseHiveTime(chunk[0]?.[1]?.timestamp);
        return oldest === null ? Number.MAX_VALUE : oldest;
      };

      const headChunk = await fetchWithFallback(-1);
      if (!headChunk.length) return [];
      let oldestTs = processChunk(headChunk);
      if (oldestTs <= cutoff) {
        return Array.from(seen.values()).sort((a, b) => a[0] - b[0]);
      }

      let nextStart = headChunk[0][0] - 1;
      while (oldestTs > cutoff && nextStart >= 0) {
        const chunk = await fetchWithFallback(nextStart);
        if (!chunk || !chunk.length) break;
        const ts = processChunk(chunk);
        if (ts < oldestTs) oldestTs = ts;
        nextStart = chunk[0][0] - 1;
      }

      return Array.from(seen.values()).sort((a, b) => a[0] - b[0]);
    }

    function computeVoteValue(account, dgp, rewardFund, priceFeed, weightPct = 100) {
      if (!account || !dgp || !rewardFund || !priceFeed) return null;
      try {
        const VOTE_REGEN_SECONDS = 5 * 24 * 60 * 60;
        const weight = weightPct * 100;

        const effectiveVests = parseAssetFloat(account.vesting_shares) - parseAssetFloat(account.delegated_vesting_shares) + parseAssetFloat(account.received_vesting_shares);
        const fallbackMaxMana = effectiveVests * 1e6;
        const maxMana = Number(account.voting_manabar?.max_mana) || fallbackMaxMana;
        const currentManaBase = Number(account.voting_manabar?.current_mana) || maxMana;
        const lastUpdate = Number(account.voting_manabar?.last_update_time) || 0;
        const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - lastUpdate);
        const regenerated = (maxMana * elapsed) / VOTE_REGEN_SECONDS;
        const currentMana = Math.min(maxMana, currentManaBase + regenerated);

        const neededMana = maxMana * 0.02 * (weight / 10000);
        const lowMana = currentMana < neededMana;

        const rshares = maxMana * 0.02 * (weight / 10000);

        const rewardBalance = parseAssetFloat(rewardFund.reward_balance);
        const recentClaims = typeof rewardFund.recent_claims === 'string' ? parseFloat(rewardFund.recent_claims) : rewardFund.recent_claims;
        if (!recentClaims || !rewardBalance) return null;
        const hiveValue = (rshares / recentClaims) * rewardBalance;

        const price = parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE');
        const hbdValue = hiveValue * price;

        return { hive: format(hiveValue, 3), hbd: format(hbdValue, 3), lowMana, weight: weightPct };
      } catch (e) {
        return null;
      }
    }

    function renderRewardsTable(history, dgp, priceFeed, account) {
      const tbody = document.getElementById('rewardsTableBody');
      if (!history || !history.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">No data</td></tr>';
        updateCurationApr(null, dgp, account || lastAccount);
        updateAnalytics(null, priceFeed, account || lastAccount);
        lastTotals = null;
        return;
      }
      const price = priceFeed ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE')) : 1;
      const now = new Date();
      const nowMs = now.getTime();
      const msInDay = 24 * 60 * 60 * 1000;
      const todayStartUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const rangeCutoffs = {
        todayStart: todayStartUtc,
        tomorrowStart: todayStartUtc + msInDay,
        yesterdayStart: todayStartUtc - msInDay,
        sevenDayStart: todayStartUtc - 6 * msInDay,
        thirtyDayStart: todayStartUtc - 29 * msInDay,
      };
      const dayInfo = buildDayBuckets();
      const dayKeySet = new Set(dayInfo.map(d => d.key));
      const totals = initRewardBuckets(dayInfo);
      if (account) {
        const postHp = (account.posting_rewards || 0) / 1000;
        const curHp = (account.curation_rewards || 0) / 1000;
        totals.all.author.hp += postHp;
        totals.all.curation.hp += curHp;
        totals.all.total.hp += postHp + curHp;
        totals.all.totalUSD = totals.all.total.hbd + (totals.all.total.hive * price) + (totals.all.total.hp * price);
      }
      for (const [, item] of history) {
        const ts = parseHiveTime(item.timestamp);
        if (!ts) continue;
        const ageDays = (nowMs - ts) / msInDay;
        const dayName = new Date(ts).toLocaleDateString('en', { weekday: 'short' });
        const [type, op] = item.op;

        if (type === 'author_reward') {
          const hp = vestsToHp(parseAssetFloat(op.vesting_payout), dgp);
          const hive = parseAssetFloat(op.hive_payout);
          const hbd = parseAssetFloat(op.hbd_payout);
          addRewardBucket(totals, 'author', ageDays, ts, dayName, hive, hbd, hp, price, dayKeySet, rangeCutoffs);
        } else if (type === 'curation_reward') {
          const hp = vestsToHp(parseAssetFloat(op.reward), dgp);
          addRewardBucket(totals, 'curation', ageDays, ts, dayName, 0, 0, hp, price, dayKeySet, rangeCutoffs);
        } else if (type === 'producer_reward') {
          const hp = vestsToHp(parseAssetFloat(op.vesting_shares), dgp);
          addRewardBucket(totals, 'witness', ageDays, ts, dayName, 0, 0, hp, price, dayKeySet, rangeCutoffs);
        }
      }

      updateCurationApr(totals, dgp, account);
      updateAnalytics(totals, priceFeed, account, dgp);
      const dayOrder = buildDayOrder(dayInfo);
      const rows = [
        ['All Time', totals.all],
        ['7 Days', totals['7']],
        ['30 Days', totals['30']],
        ['Today', totals.today],
        ['Yesterday', totals.yesterday],
        ...dayOrder.map(d => [d.label, totals[d.key] || initRewardBuckets(dayInfo).all]),
      ];

      tbody.innerHTML = rows.map(([label, data]) => `
        <tr>
          <td>${label}</td>
          <td>${formatRewardCell(data.author)}</td>
          <td>${formatRewardCell(data.curation)}</td>
          <td>${formatRewardCell(data.witness, null, label === 'All Time')}</td>
          <td>${formatRewardCell(data.total, data.totalUSD)}</td>
        </tr>
      `).join('');
    }

    function renderRewardsTableFromTotals(totals, priceFeed, account, dayInfo, dgp) {
      const tbody = document.getElementById('rewardsTableBody');
      if (!totals) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">No data</td></tr>';
        updateCurationApr(null, dgp, account || lastAccount);
        updateAnalytics(null, priceFeed, account || lastAccount, dgp);
        return;
      }
      const dayOrder = buildDayOrder(dayInfo);
      const rows = [
        ['All Time', totals.all],
        ['7 Days', totals['7']],
        ['30 Days', totals['30']],
        ['Today', totals.today],
        ['Yesterday', totals.yesterday],
        ...dayOrder.map(d => [d.label, totals[d.key] || initRewardBuckets(dayInfo).all]),
      ];

      tbody.innerHTML = rows.map(([label, data]) => `
        <tr>
          <td>${label}</td>
          <td>${formatRewardCell(data.author)}</td>
          <td>${formatRewardCell(data.curation)}</td>
          <td>${formatRewardCell(data.witness, null, label === 'All Time')}</td>
          <td>${formatRewardCell(data.total, data.totalUSD)}</td>
        </tr>
      `).join('');
      updateCurationApr(totals, dgp, account || lastAccount);
      lastTotals = totals;
      updateAnalytics(totals, priceFeed, account || lastAccount, dgp);
    }

    function initRewardBuckets(dayInfo) {
      const base = () => ({
        author: { hive: 0, hbd: 0, hp: 0 },
        curation: { hive: 0, hbd: 0, hp: 0 },
        witness: { hive: 0, hbd: 0, hp: 0 },
        total: { hive: 0, hbd: 0, hp: 0 },
        totalUSD: 0
      });
      const buckets = {
        all: base(),
        '7': base(),
        '30': base(),
        today: base(),
        yesterday: base(),
      };
      if (dayInfo && Array.isArray(dayInfo)) {
        dayInfo.forEach(d => { buckets[d.key] = base(); });
      }
      return buckets;
    }

    function addRewardBucket(buckets, category, ageDays, ts, dayName, hive, hbd, hp, price, dayKeySet, rangeCutoffs) {
      const keys = [];
      if (category === 'witness') keys.push('all');

      const now = new Date();
      const msInDay = 24 * 60 * 60 * 1000;
      const todayStart = rangeCutoffs?.todayStart ?? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const tomorrowStart = rangeCutoffs?.tomorrowStart ?? (todayStart + msInDay);
      const yesterdayStart = rangeCutoffs?.yesterdayStart ?? (todayStart - msInDay);
      const within7 = rangeCutoffs ? ts >= rangeCutoffs.sevenDayStart : ageDays < 7;
      const within30 = rangeCutoffs ? ts >= rangeCutoffs.thirtyDayStart : ageDays < 30;

      if (within7) keys.push('7');
      if (within30) keys.push('30');

      const date = new Date(ts);
      const isToday = ts >= todayStart && ts < tomorrowStart;
      const isYesterday = ts >= yesterdayStart && ts < todayStart;
      if (isToday) keys.push('today');
      if (isYesterday) keys.push('yesterday');

      const dateKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10);
      if (dayKeySet && dayKeySet.has(dateKey)) keys.push(dateKey);

      for (const key of keys) {
        const bucket = buckets[key];
        bucket[category].hive += hive;
        bucket[category].hbd += hbd;
        bucket[category].hp += hp;
        bucket.total.hive += hive;
        bucket.total.hbd += hbd;
        bucket.total.hp += hp;
        bucket.totalUSD = bucket.total.hbd + (bucket.total.hive * price) + (bucket.total.hp * price);
      }
    }

    function formatRewardCell(asset, usd = null, suppressHp = false) {
      const lines = [];
      const eps = 1e-6;
      if (Math.abs(asset.hive) > eps) lines.push(`${format(asset.hive, 3)} HIVE`);
      if (Math.abs(asset.hbd) > eps) lines.push(`${format(asset.hbd, 3)} HBD`);
      if (!suppressHp) lines.push(`${format(asset.hp, 3)} HP`);
      if (usd !== null && usd !== undefined) {
        lines.push(`<span class="muted">~$${format(usd, 2)}</span>`);
      }
      return lines.join('<br>');
    }

    function safeHiveUrl(author, permlink) {
      const cleanAuthor = typeof author === 'string' ? author.replace(/[^A-Za-z0-9.-]/g, '') : '';
      const cleanPerm = typeof permlink === 'string' ? permlink.replace(/[^A-Za-z0-9._-]/g, '') : '';
      if (!cleanAuthor || !cleanPerm) return '#';
      try {
        return `https://hive.blog/@${encodeURIComponent(cleanAuthor)}/${encodeURIComponent(cleanPerm)}`;
      } catch (e) {
        return '#';
      }
    }

    function renderPendingAuthorTable(rows, priceFeed) {
      const tbody = document.getElementById('pendingAuthorBody');
      if (!tbody) return;
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">No pending payouts</td></tr>';
        renderPendingAuthorSummary([], priceFeed);
        return;
      }
      const sorted = [...rows].sort((a, b) => (b.hbd || 0) - (a.hbd || 0));
      const price = priceFeed
        ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
        : (lastPriceFeed ? (parseAssetFloat(lastPriceFeed.base) / parseAssetFloat(lastPriceFeed.quote || '1.000 HIVE')) : 0);
      tbody.innerHTML = '';
      sorted.forEach(row => {
        const payoutIn = formatDuration(row.payoutMs);
        const url = safeHiveUrl(row.author, row.permlink);
        const typeIcon = row.isComment ? '💬' : '📝';
        const hpVal = row.hpEq ?? (price ? row.hbd * (1 / price) : 0);

        const tr = document.createElement('tr');

        const iconTd = document.createElement('td');
        iconTd.className = 'pending-icon';
        iconTd.textContent = typeIcon;
        tr.appendChild(iconTd);

        const titleTd = document.createElement('td');
        titleTd.className = 'pending-title';
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = row.title || `${row.author || ''}/${row.permlink || ''}`;
        titleTd.appendChild(link);
        tr.appendChild(titleTd);

        const payoutTd = document.createElement('td');
        payoutTd.className = 'numeric';
        payoutTd.textContent = payoutIn;
        tr.appendChild(payoutTd);

        const hbdTd = document.createElement('td');
        hbdTd.className = 'numeric';
        hbdTd.textContent = `${format(row.hbd || 0, 3)} HBD`;
        tr.appendChild(hbdTd);

        const hpTd = document.createElement('td');
        hpTd.className = 'numeric';
        hpTd.textContent = `${format(hpVal || 0, 3)} HP`;
        tr.appendChild(hpTd);

        const beneTd = document.createElement('td');
        beneTd.className = 'numeric';
        beneTd.textContent = `${format((row.beneficiaryCut || 0) * 100, 2)}%`;
        tr.appendChild(beneTd);

        tbody.appendChild(tr);
      });
      renderPendingAuthorSummary(sorted, priceFeed);
    }

    function renderPendingAuthorSummary(rows, priceFeed) {
      const titleCell = document.getElementById('authSummaryTitle');
      const valCell = document.getElementById('authSummaryValue');
      const hpCell = document.getElementById('authSummaryHp');
      if (!titleCell || !valCell || !hpCell) return;
      if (!rows || !rows.length) {
        titleCell.textContent = '—';
        valCell.textContent = '';
        hpCell.textContent = '';
        return;
      }
      const price = priceFeed
        ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
        : (lastPriceFeed ? (parseAssetFloat(lastPriceFeed.base) / parseAssetFloat(lastPriceFeed.quote || '1.000 HIVE')) : 0);
      const posts = rows.filter(r => !r.isComment).length;
      const comments = rows.length - posts;
      const totalHbd = rows.reduce((acc, r) => acc + (r.hbd || 0), 0);
      const totalHp = rows.reduce((acc, r) => {
        if (typeof r.hpEq === 'number') return acc + r.hpEq;
        if (price) return acc + ((r.hbd || 0) / price);
        return acc;
      }, 0);

      titleCell.textContent = `${format(posts, 0)} Posts + ${format(comments, 0)} Comments`;
      valCell.textContent = `${format(totalHbd, 3)} HBD`;
      hpCell.textContent = `${format(totalHp, 3)} HP`;
    }

    function renderPendingCurationTable(rows, priceFeed) {
      const tbody = document.getElementById('pendingCurationBody');
      if (!tbody) return;
      if ((!rows || !rows.length) && lastPendingCurationHp === null) {
        return;
      }
      if (!rows || !rows.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="muted">No pending curation rewards</td></tr>';
        renderPendingCurationSummary([], priceFeed);
        return;
      }
      const price = priceFeed
        ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
        : (lastPriceFeed ? (parseAssetFloat(lastPriceFeed.base) / parseAssetFloat(lastPriceFeed.quote || '1.000 HIVE')) : 0);
      tbody.innerHTML = '';
      rows.forEach(row => {
        const payoutIn = formatDuration(row.payoutMs);
        const url = safeHiveUrl(row.author, row.permlink);
        const typeIcon = row.isComment ? '💬' : '📝';
        const hpVal = row.hp ?? (price ? (row.hbd || 0) / price : 0);
        const voteWeight = row.weightPct !== undefined && row.weightPct !== null ? `${format(row.weightPct, 1)}%` : '—';
        const voteDelay = row.votedAfterMs ? formatDuration(row.votedAfterMs) : '—';
        const efficiency = row.efficiency !== undefined && row.efficiency !== null ? `${format(row.efficiency, 1)}%` : '—';

        const tr = document.createElement('tr');

        const iconTd = document.createElement('td');
        iconTd.className = 'pending-icon';
        iconTd.textContent = typeIcon;
        tr.appendChild(iconTd);

        const titleTd = document.createElement('td');
        titleTd.className = 'pending-title';
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = row.title || `${row.author || ''}/${row.permlink || ''}`;
        titleTd.appendChild(link);
        tr.appendChild(titleTd);

        const payoutTd = document.createElement('td');
        payoutTd.className = 'numeric';
        payoutTd.textContent = payoutIn;
        tr.appendChild(payoutTd);

        const votedAfterTd = document.createElement('td');
        votedAfterTd.className = 'numeric';
        votedAfterTd.textContent = voteDelay;
        tr.appendChild(votedAfterTd);

        const weightTd = document.createElement('td');
        weightTd.className = 'numeric';
        weightTd.textContent = voteWeight;
        tr.appendChild(weightTd);

        const effTd = document.createElement('td');
        effTd.className = 'numeric';
        effTd.textContent = efficiency;
        tr.appendChild(effTd);

        const hbdTd = document.createElement('td');
        hbdTd.className = 'numeric';
        hbdTd.textContent = `${format(row.hbd || 0, 3)} HBD`;
        tr.appendChild(hbdTd);

        const hpTd = document.createElement('td');
        hpTd.className = 'numeric';
        hpTd.textContent = `${format(hpVal || 0, 3)} HP`;
        tr.appendChild(hpTd);

        tbody.appendChild(tr);
      });
      renderPendingCurationSummary(rows, priceFeed);
    }

    function renderPendingCurationSummary(rows, priceFeed) {
      const titleCell = document.getElementById('curSummaryTitle');
      const effCell = document.getElementById('curSummaryEff');
      const valCell = document.getElementById('curSummaryValue');
      const hpCell = document.getElementById('curSummaryHp');
      if (!titleCell || !effCell || !valCell || !hpCell) return;
      if (!rows || !rows.length) {
        titleCell.textContent = '—';
        effCell.textContent = '';
        valCell.textContent = '';
        hpCell.textContent = '';
        return;
      }
      const price = priceFeed
        ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
        : (lastPriceFeed ? (parseAssetFloat(lastPriceFeed.base) / parseAssetFloat(lastPriceFeed.quote || '1.000 HIVE')) : 0);
      const posts = rows.filter(r => !r.isComment).length;
      const comments = rows.length - posts;
      const totalHbd = rows.reduce((acc, r) => acc + (r.hbd || 0), 0);
      const totalHp = rows.reduce((acc, r) => {
        if (typeof r.hp === 'number') return acc + r.hp;
        if (price) return acc + ((r.hbd || 0) / price);
        return acc;
      }, 0);
      const weight = rows.reduce((acc, r) => acc + (r.hbd || 0), 0);
      const effSum = rows.reduce((acc, r) => acc + ((r.efficiency || 0) * (r.hbd || 0)), 0);
      const avgEff = weight ? (effSum / weight) : (rows.reduce((acc, r) => acc + (r.efficiency || 0), 0) / rows.length);

      titleCell.textContent = `${format(posts, 0)} Posts + ${format(comments, 0)} Comments`;
      effCell.textContent = `${format(avgEff, 2)}%`;
      valCell.textContent = `${format(totalHbd, 3)} HBD`;
      hpCell.textContent = `${format(totalHp, 3)} HP`;
    }

    function buildDayBuckets() {
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const today = new Date();
      const buckets = [];
      for (let offset = 2; offset <= 6; offset++) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
        const label = days[d.getUTCDay()];
        const key = d.toISOString().slice(0,10);
        buckets.push({ key, label });
      }
      return buckets;
    }

    function buildChartDays(days = 30) {
      const today = new Date();
      const buckets = [];
      for (let offset = days - 1; offset >= 0; offset--) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - offset));
        const key = d.toISOString().slice(0,10);
        const label = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
        buckets.push({ key, label });
      }
      return buckets;
    }

    function initChartMap(chartDays) {
      const base = () => ({ hive: 0, hbd: 0, hp: 0 });
      const map = {};
      chartDays.forEach(d => {
        map[d.key] = {
          hive: 0, hbd: 0, hp: 0,
          author: base(),
          curation: base(),
          witness: base(),
          benefactor: base(),
          hpDelta: 0,
          powerUp: 0,
          powerDown: 0,
          powerDownTo: 0
        };
      });
      return map;
    }

    function addChartBucket(chartMap, keySet, ts, hive, hbd, hp, category = 'other') {
      const date = new Date(ts);
      const dateKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10);
      if (!keySet.has(dateKey)) return;
      const bucket = chartMap[dateKey];
      bucket.hive += hive;
      bucket.hbd += hbd;
      bucket.hp += hp;
      bucket.hpDelta += hp;
      if (bucket[category]) {
        bucket[category].hive += hive;
        bucket[category].hbd += hbd;
        bucket[category].hp += hp;
      }
    }

    function addHpDelta(chartMap, keySet, ts, hpDelta) {
      const date = new Date(ts);
      const dateKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10);
      if (!keySet.has(dateKey)) return;
      const bucket = chartMap[dateKey];
      bucket.hpDelta += hpDelta;
      if (hpDelta > 0) {
        bucket.powerUp += hpDelta;
      } else if (hpDelta < 0) {
        bucket.powerDown += Math.abs(hpDelta);
      }
    }

    function addPowerDownTo(chartMap, keySet, ts, hpAmount) {
      const date = new Date(ts);
      const dateKey = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0,10);
      if (!keySet.has(dateKey)) return;
      const bucket = chartMap[dateKey];
      bucket.powerDownTo += hpAmount;
    }

    function clearCharts() {
      if (growthChart) {
        growthChart.destroy();
        growthChart = null;
      }
      if (earnedChart) {
        earnedChart.destroy();
        earnedChart = null;
      }
      const growthEl = document.getElementById('growthChart');
      const earnedEl = document.getElementById('earnedChart');
      if (growthEl?.getContext) growthEl.getContext('2d').clearRect(0,0,growthEl.width,growthEl.height);
      if (earnedEl?.getContext) earnedEl.getContext('2d').clearRect(0,0,earnedEl.width,earnedEl.height);
    }

    function renderCharts(chartMap, chartDays, priceFeed, rangeDays = 30, account = null, dgp = null) {
      if (!window.Chart) return;
      const price = priceFeed
        ? (parseAssetFloat(priceFeed.base) / parseAssetFloat(priceFeed.quote || '1.000 HIVE'))
        : 1;
      const sliceDays = chartDays.slice(-Math.max(1, rangeDays));
      const labels = sliceDays.map(d => d.label);
      const acct = account || lastAccount;
      const dgpVal = dgp || lastDgp;
      const effectiveHpNow = getOwnedHp(acct, dgpVal);

      const totalHpDeltaWindow = sliceDays.reduce((acc, d) => {
        const b = chartMap[d.key] || { hpDelta: 0 };
        return acc + (b.hpDelta || 0);
      }, 0);
      const startHp = Math.max(0, effectiveHpNow - totalHpDeltaWindow);

      let cumulativeHpEq = startHp;
      const growthData = sliceDays.map(d => {
        const b = chartMap[d.key] || { hpDelta: 0 };
        const hpEq = b.hpDelta || 0;
        cumulativeHpEq += hpEq;
        return Number(cumulativeHpEq.toFixed(3));
      });
      const earnedAuthor = [];
      const earnedCuration = [];
      const earnedWitness = [];
      const earnedBenefactor = [];
      const rewardHpArr = [];
      const witnessHpArr = [];
      const powerUpArr = [];
      const powerDownArr = [];
      const powerDownToArr = [];
      const benefactorHpArr = [];
      sliceDays.forEach(d => {
        const b = chartMap[d.key] || { hive: 0, hbd: 0, hp: 0, author: {}, curation: {}, witness: {}, benefactor: {}, powerUp: 0, powerDown: 0, powerDownTo: 0 };
        const cat = b;
        const toUsd = (hive, hbd, hp) => (hbd || 0) + (hive || 0) * price + (hp || 0) * price;
        earnedAuthor.push(Number(toUsd(cat.author?.hive, cat.author?.hbd, cat.author?.hp).toFixed(3)));
        earnedCuration.push(Number(toUsd(cat.curation?.hive, cat.curation?.hbd, cat.curation?.hp).toFixed(3)));
        earnedWitness.push(Number(toUsd(cat.witness?.hive, cat.witness?.hbd, cat.witness?.hp).toFixed(3)));
        earnedBenefactor.push(Number(toUsd(cat.benefactor?.hive, cat.benefactor?.hbd, cat.benefactor?.hp).toFixed(3)));
        const rewardHpVal = (cat.author?.hp || 0) + (cat.curation?.hp || 0);
        rewardHpArr.push(Number(rewardHpVal.toFixed(3)));
        witnessHpArr.push(Number((cat.witness?.hp || 0).toFixed(3)));
        powerUpArr.push(Number((cat.powerUp || 0).toFixed(3)));
        powerDownArr.push(Number((cat.powerDown || 0).toFixed(3)));
        powerDownToArr.push(Number((cat.powerDownTo || 0).toFixed(3)));
        benefactorHpArr.push(Number((cat.benefactor?.hp || 0).toFixed(3)));
      });

      const growthCtx = document.getElementById('growthChart').getContext('2d');
      const earnedCtx = document.getElementById('earnedChart').getContext('2d');
      clearCharts();

      const commonOptions = (forceZero = false) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#a9b3c1', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: forceZero, ticks: { color: '#a9b3c1' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      });

      const minLine = Math.min(...growthData);
      const maxLine = Math.max(...growthData);
      const pad = Math.max(1, (maxLine - minLine) * 0.05);
      const yMin = Math.max(0, minLine - pad);
      const yMax = maxLine + pad;

      const barAll = [
        ...powerUpArr,
        ...powerDownArr.map(v => -v),
        ...powerDownToArr,
        ...witnessHpArr,
        ...rewardHpArr,
        ...benefactorHpArr
      ];
      const barMinRaw = barAll.length ? Math.min(...barAll, 0) : 0;
      const barMaxRaw = barAll.length ? Math.max(...barAll, 0) : 0;
      const barPad = Math.max(0.5, (barMaxRaw - barMinRaw) * 0.1);
      const yBarsMin = barMinRaw - barPad;
      const yBarsMax = barMaxRaw + barPad;

      growthChart = new Chart(growthCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              type: 'line',
              label: 'Account HP',
              data: growthData,
              borderColor: '#22c55e',
              backgroundColor: 'rgba(34,197,94,0.15)',
              fill: false,
              tension: 0.2,
              borderWidth: 2,
              yAxisID: 'y'
            },
            {
              label: 'Power Up (HP)',
              data: powerUpArr,
              backgroundColor: 'rgba(34,197,94,0.35)',
              stack: 'hp',
              yAxisID: 'yBars'
            },
            {
              label: 'Power Down (HP)',
              data: powerDownArr.map(v => -v),
              backgroundColor: 'rgba(239,68,68,0.5)',
              stack: 'hp',
              yAxisID: 'yBars'
            },
            {
              label: 'Power Downed To (HP)',
              data: powerDownToArr,
              backgroundColor: 'rgba(250,204,21,0.7)',
              stack: 'hp',
              yAxisID: 'yBars'
            },
            {
              label: 'Witness Reward (HP)',
              data: witnessHpArr,
              backgroundColor: 'rgba(167,139,250,0.7)',
              stack: 'hp',
              yAxisID: 'yBars'
            },
            {
              label: 'Reward (HP)',
              data: rewardHpArr,
              backgroundColor: 'rgba(125,211,252,0.6)',
              stack: 'hp',
              yAxisID: 'yBars'
            },
            {
              label: 'Benefactor Reward (HP)',
              data: benefactorHpArr,
              backgroundColor: 'rgba(251,146,60,0.8)',
              stack: 'hp',
              yAxisID: 'yBars'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { color: '#e5e7eb' } } },
          scales: {
            x: { stacked: true, ticks: { color: '#a9b3c1', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
            y: { stacked: false, ticks: { color: '#a9b3c1' }, grid: { color: 'rgba(255,255,255,0.06)' }, min: yMin, max: yMax },
            yBars: { stacked: true, display: false, min: yBarsMin, max: yBarsMax }
          }
        }
      });

      earnedChart = new Chart(earnedCtx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Author',
            data: earnedAuthor,
            backgroundColor: 'rgba(34,197,94,0.7)'
          }, {
            label: 'Curation',
            data: earnedCuration,
            backgroundColor: 'rgba(56,189,248,0.7)'
          }, {
            label: 'Witness',
            data: earnedWitness,
            backgroundColor: 'rgba(167,139,250,0.8)'
          }, {
            label: 'Benefactor',
            data: earnedBenefactor,
            backgroundColor: 'rgba(251,146,60,0.8)'
          }]
        },
        options: {
          ...commonOptions(true),
          plugins: { legend: { display: true, labels: { color: '#e5e7eb' } } },
          scales: {
            x: { stacked: true, ticks: { color: '#a9b3c1', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { color: '#a9b3c1' }, grid: { color: 'rgba(255,255,255,0.06)' } }
          }
        }
      });
    }

    function buildDayOrder(dayInfo) {
      return dayInfo || [];
    }
    function updateVoteDisplay(account = null, dgp = null, rewardFund = null, priceFeed = null) {
      const acct = account || lastAccount;
      const dgpVal = dgp || lastDgp;
      const rf = rewardFund || lastRewardFund;
      const pf = priceFeed || lastPriceFeed;
      const weight = Number(voteSlider.value) || 0;
      const vote = computeVoteValue(acct, dgpVal, rf, pf, weight);
      document.getElementById('voteValue').textContent = vote
        ? `Vote @${vote.weight}% · ${vote.hbd} HBD (~${vote.hive} HIVE)${vote.lowMana ? ' • low mana' : ''}`
        : `Vote @${weight}% · —`;
    }

    function parseProfile(account) {
      if (!account || !account.posting_json_metadata) return { avatar: '', bio: '' };
      try {
        const meta = JSON.parse(account.posting_json_metadata);
        const profile = meta?.profile || meta;
        const avatar = profile.profile_image || profile.image || '';
        const bio = profile.about || profile.description || '';
        return {
          avatar: typeof avatar === 'string' ? avatar : '',
          bio: typeof bio === 'string' ? bio : ''
        };
      } catch (e) {
        return { avatar: '', bio: '' };
      }
    }

    function initTotals() {
      return { hp: 0, hive: 0, hbd: 0 };
    }

    function addReward(windows, ageDays, add) {
      const targets = [];
      if (ageDays <= 7) targets.push(7);
      if (ageDays <= 30) targets.push(30);
      for (const t of targets) {
        windows[t].hp += add.hp || 0;
        windows[t].hive += add.hive || 0;
        windows[t].hbd += add.hbd || 0;
      }
    }

    function parseUsernameFromPath(pathname = window.location.pathname) {
      if (!pathname) return '';
      const match = pathname.match(/^\/@([A-Za-z0-9.-]+)\/?$/);
      if (!match) return '';
      try {
        return decodeURIComponent(match[1]);
      } catch (e) {
        return '';
      }
    }

    function syncUrlUsername(username) {
      if (!username) return;
      const targetPath = `/@${username}`;
      if (window.location.pathname !== targetPath) {
        window.history.replaceState({}, '', targetPath);
      }
    }

    function initFromPath() {
      const pathUser = parseUsernameFromPath();
      if (pathUser) {
        usernameEl.value = pathUser;
        handleLoad();
      }
    }

    initFromPath();
