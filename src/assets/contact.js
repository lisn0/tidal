const form = document.querySelector('#contact-form');
const status = document.querySelector('#contact-status');

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = 'Sending…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'send_failed');
    status.textContent = 'Message sent. Thank you.';
    form.reset();
  } catch {
    status.textContent = 'Message could not be sent. Please try booking a call instead.';
  } finally {
    button.disabled = false;
  }
});
