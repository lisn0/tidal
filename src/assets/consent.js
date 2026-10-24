/* LLM CFO — regional Zaraz loading + cookie banner. Vanilla JS, no deps. */
(function () {
	'use strict';

	var COOKIE_NAME = 'llmcfo_consent';
	var COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 365 days

	// 1. Queue consent for Zaraz's Google Consent Mode compatibility.
	window.analyticsConsent = false;
	var deniedGoogleConsent = {
		ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied'
	};
	var grantedAnalyticsConsent = {
		ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted'
	};
	function persistConsentUpdate(state) {
		try { window.localStorage.setItem('_zaraz_google_consent_update', JSON.stringify(state)); } catch (e) {}
	}

	// 2. Zaraz manages GA4 and Clarity. This is the only analytics script this
	// site injects, and only after the regional policy allows analytics.
	var zarazStarted = false;
	function loadZaraz() {
		if (zarazStarted) return;
		zarazStarted = true;
		// Zaraz evaluates its Pageview actions during script initialization; make
		// the user's decision visible before i.js processes the initial event.
		window.analyticsConsent = true;
		try { window.localStorage.setItem('_zaraz_google_consent_default', JSON.stringify(deniedGoogleConsent)); } catch (e) {}
		persistConsentUpdate(grantedAnalyticsConsent);
		var script = document.createElement('script');
		script.src = '/cdn-cgi/zaraz/i.js';
		script.referrerPolicy = 'origin';
		script.onload = function () {
			if (privacyRequested()) {
				revoke();
				location.reload();
				return;
			}
			try { window.dispatchEvent(new Event('analyticsconsent')); } catch (e) {}
		};
		script.onerror = function () { window.analyticsConsent = false; };
		var first = document.getElementsByTagName('script')[0];
		first.parentNode.insertBefore(script, first);
	}

	// 3. Cookie helpers.
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

	// 4. Consent updates.
	function privacyRequested() {
		var nav = window.navigator || {};
		return nav.globalPrivacyControl || nav.doNotTrack === '1' || window.doNotTrack === '1';
	}
	function grantAnalytics() {
		if (privacyRequested()) return false;
		loadZaraz();
		return true;
	}

	// 4b. Withdrawal (GDPR Art. 7(3)) must be as easy as consent. The banner only
	//     stops future loads; Zaraz-managed tools already running on this page
	//     need consent revoked and a reload to unload them.
	function revoke() {
		window.analyticsConsent = false;
		persistConsentUpdate(deniedGoogleConsent);
		if (window.zaraz && typeof window.zaraz.set === 'function') {
			try { window.zaraz.set('google_consent_update', deniedGoogleConsent); } catch (e) {}
		}
		if (window.clarity) window.clarity('consentv2', { analytics_Storage: 'denied', ad_Storage: 'denied' });
		if (window.zaraz && window.zaraz.consent && typeof window.zaraz.consent.setAll === 'function') {
			window.zaraz.consent.setAll(false);
		}
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

	// 5. Read existing decision.
	var stored = getCookie(COOKIE_NAME);

	// 5a. A stored decision hid the banner for a year with no way back to it, so
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
		grantAnalytics();
		return;
	}
	if (stored === 'rejected') {
		// stay denied
		return;
	}

	// 6. No prior decision — show banner once DOM is ready.
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
			setCookie(COOKIE_NAME, 'accepted'); grantAnalytics(); close();
		}
		function reject() {
			var tagsRunning = zarazStarted;
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
		if (policy && policy.requireConsent === false) grantAnalytics();
		else onReady(function () { showBanner(false); });
	}).catch(function () {
		if (!getCookie(COOKIE_NAME) && !privacyRequested()) onReady(function () { showBanner(false); });
	});
})();
