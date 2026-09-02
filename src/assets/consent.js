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

	// 3. Load GA4 only after explicit analytics consent.
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

	// 3b. Load Microsoft Clarity (heatmaps + session replay) only after consent.
	var clarityLoaded = false;
	function loadClarity(c, l, a, r, i, t, y) {
		if (clarityLoaded || !i) return;
		clarityLoaded = true;
		c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
		t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i + '?ref=bwt';
		y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
		c[a]('consent');
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
	function grantAll() {
		gtag('consent', 'update', {
			ad_storage: 'granted',
			analytics_storage: 'granted',
			ad_user_data: 'granted',
			ad_personalization: 'granted',
			functionality_storage: 'granted',
			personalization_storage: 'granted',
			security_storage: 'granted'
		});
		loadGa4(window, document, 'script', GA4_ID);
		loadClarity(window, document, 'clarity', 'script', CLARITY_ID);
		// window.gtag is the always-present dataLayer shim, so other scripts
		// cannot use it to tell granted from denied. Publish the decision.
		window.analyticsConsent = true;
		try { window.dispatchEvent(new Event('analyticsconsent')); } catch (e) {}
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
		msg.innerHTML = 'We use cookies for anonymous analytics (GA4) and product usage insights, including heatmaps and session replay (Microsoft Clarity). See our <a href="/privacy" style="color:#0E0F0C; text-decoration:underline; text-decoration-color:#B83A13; text-underline-offset:3px;">Privacy Policy</a>.';

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

		function close() {
			if (banner.parentNode) banner.parentNode.removeChild(banner);
			document.removeEventListener('keydown', onKey);
		}
		function accept() { setCookie(COOKIE_NAME, 'accepted'); grantAll(); close(); }
		function reject() {
			var wasAccepted = getCookie(COOKIE_NAME) === 'accepted';
			setCookie(COOKIE_NAME, 'rejected');
			revoke();
			close();
			// Tags already running in this page cannot be unloaded in place.
			if (wasAccepted) location.reload();
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

	onReady(function () { showBanner(false); });
})();
