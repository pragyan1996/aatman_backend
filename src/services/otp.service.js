const { httpError } = require('../utils/auth');

async function callMsg91(path, params, method) {
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) {
    throw httpError(503, 'SMS service is not configured');
  }
  const url = new URL(`https://control.msg91.com/api/v5/otp${path}`);
  url.search = new URLSearchParams(params).toString();
  try {
    const response = await fetch(url, {
      method,
      headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error('Provider HTTP error');
    return data;
  } catch {
    throw httpError(502, 'SMS provider unavailable; please try again later');
  }
}

exports.sendOtp = async (phone) => {
  const data = await callMsg91('', {
    mobile: phone, template_id: process.env.MSG91_TEMPLATE_ID,
    otp_expiry: '5', otp_length: '6',
  }, 'POST');
  if (data.type !== 'success') throw httpError(502, 'SMS provider could not send the OTP');
};

exports.verifyOtp = async (phone, otp) => {
  const data = await callMsg91('/verify', { mobile: phone, otp }, 'GET');
  // Do not accept generic success or an already-verified phone response.
  return data.type === 'success' && data.message === 'OTP verified success';
};
