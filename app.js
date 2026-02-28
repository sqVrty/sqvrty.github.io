/**
 * Asgard WebApp — Client-side logic.
 *
 * Delivery modes:
 * - Production (GitHub Pages): sendData() → Telegram → bot handler
 * - Development (local aiohttp): fetch('/api/generate') → bot HTTP API
 *
 * Auto-detects mode: if the page is served by the bot (same origin has /api/),
 * uses HTTP API. Otherwise uses sendData().
 */

window.onerror = function() { return false; };

(function() {
    // ── Telegram WebApp ──
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg) {
        tg.expand();
        tg.ready();
    }

    function showAlert(text) {
        if (tg && tg.showAlert) { tg.showAlert(text); } else { alert(text); }
    }

    // ── Detect delivery mode ──
    // If API_BASE is set via data attribute, use HTTP API (dev mode).
    // Otherwise, use sendData (production / GitHub Pages).
    var apiBase = document.body.getAttribute('data-api-base') || '';
    var useHttpApi = document.body.hasAttribute('data-api-base');

    // ── Validation ──
    function showError(el, hint) { if (el) el.classList.add('field-error'); if (hint) hint.classList.add('visible'); }
    function clearError(el, hint) { if (el) el.classList.remove('field-error'); if (hint) hint.classList.remove('visible'); }
    function clearAllErrors() {
        var e = document.querySelectorAll('.field-error');
        for (var i = 0; i < e.length; i++) e[i].classList.remove('field-error');
        var h = document.querySelectorAll('.field-hint.visible');
        for (var i = 0; i < h.length; i++) h[i].classList.remove('visible');
    }
    function bindClear(el, hint) {
        if (el) el.addEventListener('input', function() { clearError(el, hint); });
    }

    // ── DOM refs ──
    var submitBtn      = document.getElementById('submitBtn');
    var symbolInput    = document.getElementById('symbol');
    var leverageSlider = document.getElementById('leverage');
    var leverageLabel  = document.getElementById('leverageValue');
    var entryInput     = document.getElementById('entryPrice');
    var exitInput      = document.getElementById('exitPrice');
    var marginInput    = document.getElementById('margin');
    var directionTgl   = document.getElementById('directionToggle');
    var marginModeTgl  = document.getElementById('marginModeToggle');
    var previewBox     = document.getElementById('preview');
    var previewPnl     = document.getElementById('previewPnl');
    var previewRoi     = document.getElementById('previewRoi');
    var previewSize    = document.getElementById('previewSize');
    var templateCbs    = document.querySelectorAll('#templateSelect input[type="checkbox"]');

    var hintSymbol    = document.getElementById('hintSymbol');
    var hintEntry     = document.getElementById('hintEntry');
    var hintExit      = document.getElementById('hintExit');
    var hintMargin    = document.getElementById('hintMargin');
    var hintTemplates = document.getElementById('hintTemplates');
    var accountBalanceField = document.getElementById('accountBalanceField');
    var accountBalanceInput = document.getElementById('accountBalance');

    bindClear(symbolInput, hintSymbol);
    bindClear(entryInput, hintEntry);
    bindClear(exitInput, hintExit);
    bindClear(marginInput, hintMargin);

    // ── State ──
    var direction = 'Long';
    var marginMode = 'Cross';

    // ── Toggle groups ──
    function initToggle(container, cb) {
        if (!container) return;
        var btns = container.querySelectorAll('.toggle-btn');
        for (var i = 0; i < btns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    for (var j = 0; j < btns.length; j++) btns[j].classList.remove('active');
                    btn.classList.add('active');
                    cb(btn.getAttribute('data-value'));
                });
            })(btns[i]);
        }
    }
    initToggle(directionTgl, function(val) { direction = val; updatePreview(); });
    initToggle(marginModeTgl, function(val) {
        marginMode = val;
        if (accountBalanceField) accountBalanceField.style.display = marginMode === 'Cross' ? 'block' : 'none';
    });
    if (accountBalanceField) accountBalanceField.style.display = marginMode === 'Cross' ? 'block' : 'none';

    for (var i = 0; i < templateCbs.length; i++) {
        (function(cb) {
            cb.addEventListener('change', function() {
                cb.closest('.checkbox-card').classList.toggle('active', cb.checked);
                clearError(null, hintTemplates);
            });
        })(templateCbs[i]);
    }

    if (leverageSlider) {
        leverageSlider.addEventListener('input', function() {
            leverageLabel.textContent = leverageSlider.value + 'x';
            updatePreview();
        });
    }

    // ── Live preview ──
    function parseNum(val) { return val ? parseFloat(val.replace(',', '.')) : NaN; }

    function updatePreview() {
        var entry = parseNum(entryInput.value);
        var exit  = parseNum(exitInput.value);
        var mg    = parseNum(marginInput.value);
        var lev   = parseInt(leverageSlider.value, 10);

        if (!entry || !exit || !mg || entry <= 0 || exit <= 0 || mg <= 0) {
            previewBox.style.display = 'none'; return;
        }
        var size = mg * lev;
        var pnl = direction === 'Long'
            ? ((exit - entry) / entry) * size
            : ((entry - exit) / entry) * size;
        var roi = (pnl / mg) * 100;
        var isProfit = pnl >= 0;
        var sign = isProfit ? '+' : '';
        var cls  = isProfit ? 'profit' : 'loss';

        previewBox.style.display = 'block';
        previewPnl.textContent  = sign + pnl.toFixed(2) + ' USDT';
        previewPnl.className    = 'preview-value ' + cls;
        previewRoi.textContent  = sign + roi.toFixed(2) + '%';
        previewRoi.className    = 'preview-value ' + cls;
        previewSize.textContent = size.toFixed(2) + ' USDT';
        previewSize.className   = 'preview-value';
    }

    entryInput.addEventListener('input', updatePreview);
    exitInput.addEventListener('input', updatePreview);
    marginInput.addEventListener('input', updatePreview);

    // ── Collect & validate ──
    function collectPayload() {
        clearAllErrors();
        var valid = true;

        var symbol = symbolInput.value.trim().toUpperCase();
        if (!symbol) { showError(symbolInput, hintSymbol); valid = false; }

        var entry = parseNum(entryInput.value);
        var exit  = parseNum(exitInput.value);
        var mg    = parseNum(marginInput.value);

        if (!entry || entry <= 0) { showError(entryInput, hintEntry); valid = false; }
        if (!exit  || exit  <= 0) { showError(exitInput, hintExit); valid = false; }
        if (!mg    || mg    <= 0) { showError(marginInput, hintMargin); valid = false; }

        var selectedTemplates = [];
        for (var i = 0; i < templateCbs.length; i++) {
            if (templateCbs[i].checked) selectedTemplates.push(templateCbs[i].value);
        }
        if (selectedTemplates.length === 0) { showError(null, hintTemplates); valid = false; }

        if (!valid) return null;

        var payload = {
            symbol: symbol,
            direction: direction,
            leverage: parseInt(leverageSlider.value, 10),
            entry_price: entry,
            exit_price: exit,
            margin: mg,
            margin_mode: marginMode,
            selected_templates: selectedTemplates
        };
        if (marginMode === 'Cross' && accountBalanceInput) {
            var bal = parseNum(accountBalanceInput.value);
            if (bal && bal > 0) payload.account_balance = bal;
        }
        return payload;
    }

    // ── Send via sendData (production — GitHub Pages) ──
    function sendViaTelegram(payload) {
        if (!tg || !tg.sendData) {
            showAlert('Telegram SDK недоступен. Откройте через кнопку в Telegram.');
            return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправлено!';
        try {
            tg.sendData(JSON.stringify(payload));
        } catch(e) {
            showAlert('Ошибка: ' + e.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Сгенерировать';
        }
    }

    // ── Send via HTTP API (dev mode — local aiohttp) ──
    function sendViaApi(payload) {
        var userId = null, initData = '';
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
            userId = tg.initDataUnsafe.user.id;
            initData = tg.initData || '';
        }
        if (!userId) { showAlert('Откройте WebApp через кнопку в Telegram.'); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Генерирую...';

        fetch(apiBase + '/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trade: payload, user_id: userId, init_data: initData })
        })
        .then(function(resp) { return resp.json().then(function(d) { return { status: resp.status, body: d }; }); })
        .then(function(result) {
            if (result.body.ok) {
                submitBtn.textContent = 'Отправлено!';
                setTimeout(function() { if (tg && tg.close) tg.close(); }, 1500);
            } else {
                showAlert('Ошибка: ' + result.body.error);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Сгенерировать';
            }
        })
        .catch(function(err) {
            showAlert('Ошибка сети: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Сгенерировать';
        });
    }

    // ── Submit handler ──
    var isSubmitting = false;

    submitBtn.addEventListener('click', function() {
        if (isSubmitting) return;
        var payload = collectPayload();
        if (!payload) return;

        isSubmitting = true;

        if (useHttpApi) {
            sendViaApi(payload);
        } else {
            sendViaTelegram(payload);
        }

        // Reset lock after timeout (in case sendData doesn't close the WebApp)
        setTimeout(function() { isSubmitting = false; }, 5000);
    });
})();
