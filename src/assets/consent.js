/* LLM CFO — Google Consent Mode v2 + cookie banner. Vanilla JS, no deps. */
(function () {
	'use strict';

	var GA4_ID = 'G-30NBV0P9QN';
	var CLARITY_ID = 'x04m83yv0b';
	var COOKIE_NAME = 'llmcfo_consent';
	var COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 365 days

	// 1. Initialize dataLayer + gtag shim before GA4 loads.
	window.analyticsConsent = false;
	window.dataLayer = window.dataLayer || [];
	function gtag() { window.dataLayer.push(arguments); }
	window.gtag = window.gtag || gtag;

	// 2. Default consent state — everything denied.
	gtag('consent', 'default', {
		ad_storage: 'denied',
		analytics_storage: 'denied',
		ad_user_data: 'denied',
		ad_personalization: 'denied',
		functionality_storage: 'denied',
		personalization_storage: 'denied',
		security_storage: 'granted',
		wait_for_update: 500
	});
	gtag('set', 'ads_data_redaction', true);

	// 3. Load GA4 after consent in Europe, or after the edge policy permits it.
	var ga4Loaded = false;
	function loadGa4(w, d, s, i) {
		if (ga4Loaded) return;
		ga4Loaded = true;
		var f = d.getElementsByTagName(s)[0];
		var j = d.createElement(s);
		j.async = true;
		j.src = 'https://www.googletagmanager.com/gtag/js?id=' + i;
		f.parentNode.insertBefore(j, f);
		gtag('js', new Date());
		gtag('config', i);
	}

	// 3b. Load Microsoft Clarity (heatmaps + session replay) with Consent V2.
	var clarityLoaded = false;
	function loadClarity(c, l, a, r, i, t, y) {
		if (clarityLoaded || !i) return;
		clarityLoaded = true;
		c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
		c[a]('consentv2', { analytics_Storage: 'granted', ad_Storage: 'denied' });
		t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i + '?ref=bwt';
		y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
	}

	// 4. Cookie helpers.
	function onReady(fn) {
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
		else fn();
	}
	function getCookie(name) {
		var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\\/+^]/g, '\\$&') + '=([^;]*)'));
		return match ? decodeURIComponent(match[1]) : null;
	}
	function setCookie(name, value) {
		var secure = location.protocol === 'https:' ? '; Secure' : '';
		document.cookie = name + '=' + encodeURIComponent(value) + '; Max-Age=' + COOKIE_MAX_AGE + '; Path=/; SameSite=Lax' + secure;
	}

	// 5. Consent updates.
	function privacyRequested() {
		var nav = window.navigator || {};
		return nav.globalPrivacyControl || nav.doNotTrack === '1' || window.doNotTrack === '1';
	}
	function grantAll() {
		if (privacyRequested()) return false;
		gtag('consent', 'update', {
			analytics_storage: 'granted',
		});
		loadGa4(window, document, 'script', GA4_ID);
		loadClarity(window, document, 'clarity', 'script', CLARITY_ID);
		// window.gtag is the always-present dataLayer shim, so other scripts
		// cannot use it to tell granted from denied. Publish the decision.
		window.analyticsConsent = true;
		try { window.dispatchEvent(new Event('analyticsconsent')); } catch (e) {}
		return true;
	}

	// 5b. Withdrawal (GDPR Art. 7(3)) must be as easy as consent. The banner only
	//     stops future loads; GA4 and Clarity have already set their own cookies
	//     by then, so revoking has to clear those and reload to unload the tags.
	function revoke() {
		window.analyticsConsent = false;
		gtag('consent', 'update', {
			ad_storage: 'denied', analytics_storage: 'denied',
			ad_user_data: 'denied', ad_personalization: 'denied',
			functionality_storage: 'denied', personalization_storage: 'denied'
		});
		if (window.clarity) window.clarity('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
		var host = location.hostname;
		var domains = ['', '; Domain=' + host, '; Domain=.' + host.replace(/^www\./, '')];
		document.cookie.split(';').forEach(function (c) {
			var name = c.split('=')[0].trim();
			if (!/^(_ga|_gid|_gat|_clck|_clsk|CLID|MUID|ANONCHK|SM)/.test(name)) return;
			domains.forEach(function (d) {
				document.cookie = name + '=; Max-Age=0; Path=/' + d;
			});
		});
	}

	// 6. Read existing decision.
	var stored = getCookie(COOKIE_NAME);

	// 6a. A stored decision hid the banner for a year with no way back to it, so
	//     withdrawing consent (Art. 7(3)) was impossible without hand-editing
	//     cookies. Inject a footer control instead of editing ~15 footer blocks
	//     across both sites and every locale — and it needs JS to work anyway.
	window.cookieSettings = function () { showBanner(true); };
	function addSettingsLink() {
		if (document.getElementById('cookie-settings-link')) return;
		// The privacy page is the one page with no footer privacy link — and the
		// one most likely to be read by someone looking to withdraw. It carries
		// an explicit slot instead.
		// Not scoped to <footer>: the footer legal links sit in a plain <div> on
		// several layouts. Last privacy link on the page is the footer one.
		var slot = document.getElementById('cookie-settings-slot');
		var links = document.querySelectorAll('a[href$="/privacy"], a[href$="/privacy.html"]');
		var privacy = slot || links[links.length - 1];
		if (!privacy) return;
		var btn = document.createElement('button');
		btn.id = 'cookie-settings-link';
		btn.type = 'button';
		btn.textContent = 'Cookie settings';
		btn.style.cssText = 'color:inherit;text-decoration:underline;text-decoration-color:#B83A13;text-underline-offset:3px;cursor:pointer;background:none;border:0;padding:0;font:inherit';
		btn.addEventListener('click', function () { showBanner(true); });
		if (slot) { slot.appendChild(btn); return; }
		privacy.parentNode.insertBefore(document.createTextNode(' \u00b7 '), privacy.nextSibling);
		privacy.parentNode.insertBefore(btn, privacy.nextSibling.nextSibling);
	}
	onReady(addSettingsLink);
	if (privacyRequested()) return;
	if (stored === 'accepted') {
		grantAll();
		return;
	}
	if (stored === 'rejected') {
		// stay denied
		return;
	}

	// 7. No prior decision — show banner once DOM is ready.
	function showBanner(reopened) {
		if (document.getElementById('llmcfo-consent-banner')) return;
		var banner = document.createElement('div');
		banner.id = 'llmcfo-consent-banner';
		banner.setAttribute('role', 'dialog');
		banner.setAttribute('aria-label', 'Cookie consent');
		banner.setAttribute('aria-live', 'polite');
		banner.style.cssText = [
			'position:fixed', 'left:16px', 'right:16px', 'bottom:16px',
			'max-width:560px', 'margin:0 auto', 'z-index:2147483647',
			'background:#FBFAF6', 'color:#0E0F0C',
			'border:1px solid #0E0F0C',
			'box-shadow:6px 6px 0 #0E0F0C',
			'padding:16px 18px',
			'font-family:Geist,-apple-system,system-ui,sans-serif',
			'font-size:14px', 'line-height:1.5'
		].join(';');

		var msg = document.createElement('div');
		msg.style.cssText = 'margin-bottom:12px; color:#0E0F0C;';
		msg.innerHTML = 'We use Google Analytics and Microsoft Clarity for analytics. Outside Europe they may start automatically; in Europe they wait for your choice. Reject opts out of both. See our <a href="/privacy" style="color:#0E0F0C; text-decoration:underline; text-decoration-color:#B83A13; text-underline-offset:3px;">Privacy Policy</a>.';

		var row = document.createElement('div');
		row.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;';

		function makeBtn(label, primary) {
			var b = document.createElement('button');
			b.type = 'button';
			b.textContent = label;
			b.style.cssText = [
				'font-family:Geist Mono,ui-monospace,monospace',
				'font-size:12px', 'letter-spacing:-0.01em',
				'padding:8px 14px', 'cursor:pointer',
				'border:1px solid #0E0F0C',
				primary ? 'background:#B83A13' : 'background:#FBFAF6',
				primary ? 'color:#FFFFFF' : 'color:#0E0F0C',
				'font-weight:600'
			].join(';');
			return b;
		}

		var current = getCookie(COOKIE_NAME);
		var rejectBtn = makeBtn(reopened && current === 'rejected' ? 'Keep rejected' : 'Reject', false);
		var acceptBtn = makeBtn(reopened && current === 'accepted' ? 'Keep accepted' : 'Accept', true);
		if (privacyRequested()) {
			acceptBtn.disabled = true;
			msg.textContent = 'Analytics is disabled by your browser privacy preference (Do Not Track or Global Privacy Control).';
		}

		function close() {
			if (banner.parentNode) banner.parentNode.removeChild(banner);
			document.removeEventListener('keydown', onKey);
		}
		function accept() {
			if (privacyRequested()) return;
			setCookie(COOKIE_NAME, 'accepted'); grantAll(); close();
		}
		function reject() {
			var tagsRunning = ga4Loaded || clarityLoaded;
			setCookie(COOKIE_NAME, 'rejected');
			revoke();
			close();
			// Tags already running in this page cannot be unloaded in place.
			if (tagsRunning) location.reload();
		}
		function onKey(e) { if (e.key !== 'Escape') return; if (reopened) close(); else reject(); }

		acceptBtn.addEventListener('click', accept);
		rejectBtn.addEventListener('click', reject);
		document.addEventListener('keydown', onKey);

		row.appendChild(rejectBtn);
		row.appendChild(acceptBtn);
		banner.appendChild(msg);
		banner.appendChild(row);
		document.body.appendChild(banner);

		// Focus the banner, not Accept — pre-focusing the accept button meant a
		// stray Enter granted consent. Both buttons are one Tab away.
		try { banner.setAttribute('tabindex', '-1'); banner.focus(); } catch (e) {}
	}

	Promise.resolve().then(function () {
		return fetch('/api/analytics-policy', { cache: 'no-store', credentials: 'same-origin' });
	}).then(function (response) {
		if (!response.ok) throw new Error('Analytics policy unavailable');
		return response.json();
	}).then(function (policy) {
		if (getCookie(COOKIE_NAME) || privacyRequested()) return;
		if (policy && policy.requireConsent === false) grantAll();
		else onReady(function () { showBanner(false); });
	}).catch(function () {
		if (!getCookie(COOKIE_NAME) && !privacyRequested()) onReady(function () { showBanner(false); });
	});
})();
