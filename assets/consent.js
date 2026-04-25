/* LLM CFO — Google Consent Mode v2 + cookie banner. Vanilla JS, no deps. */
(function () {
	'use strict';

	var GA4_ID = 'G-30NBV0P9QN';
	var COOKIE_NAME = 'llmcfo_consent';
	var COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 365 days

	// 1. Initialize dataLayer + gtag shim before GA4 loads.
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

	// 4. Cookie helpers.
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
	}

	// 6. Read existing decision.
	var stored = getCookie(COOKIE_NAME);
	if (stored === 'accepted') {
		grantAll();
		return;
	}
	if (stored === 'rejected') {
		// stay denied
		return;
	}

	// 7. No prior decision — show banner once DOM is ready.
	function showBanner() {
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
		msg.innerHTML = 'We use cookies for anonymous analytics (GA4). See our <a href="/privacy" style="color:#0E0F0C; text-decoration:underline; text-decoration-color:#B83A13; text-underline-offset:3px;">Privacy Policy</a>.';

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

		var rejectBtn = makeBtn('Reject', false);
		var acceptBtn = makeBtn('Accept', true);

		function close() {
			if (banner.parentNode) banner.parentNode.removeChild(banner);
			document.removeEventListener('keydown', onKey);
		}
		function accept() { setCookie(COOKIE_NAME, 'accepted'); grantAll(); close(); }
		function reject() { setCookie(COOKIE_NAME, 'rejected'); close(); }
		function onKey(e) { if (e.key === 'Escape') reject(); }

		acceptBtn.addEventListener('click', accept);
		rejectBtn.addEventListener('click', reject);
		document.addEventListener('keydown', onKey);

		row.appendChild(rejectBtn);
		row.appendChild(acceptBtn);
		banner.appendChild(msg);
		banner.appendChild(row);
		document.body.appendChild(banner);

		// focus accept by default for keyboard users
		try { acceptBtn.focus(); } catch (e) {}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', showBanner);
	} else {
		showBanner();
	}
})();
