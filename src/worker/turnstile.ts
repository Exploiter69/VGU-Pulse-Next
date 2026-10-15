export interface TurnstileConfig {
  appEnv: string;
  secretKey?: string;
}

export interface TurnstileVerifyResult {
  ok: boolean;
  code?: string;
  message?: string;
}

const CLOUDFLARE_DUMMY_TEST_SECRET = '1x0000000000000000000000000000000AA';
const LOCAL_DEV_BYPASS_TOKEN = 'LOCAL_DEV_TURNSTILE_BYPASS';

export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp: string | null,
  config: TurnstileConfig
): Promise<TurnstileVerifyResult> {
  const isProd = config.appEnv === 'production';

  // Fail closed in production if TURNSTILE_SECRET_KEY is not configured
  if (isProd && (!config.secretKey || config.secretKey === CLOUDFLARE_DUMMY_TEST_SECRET)) {
    return {
      ok: false,
      code: 'VERIFICATION_MISCONFIGURED',
      message:
        'Server security check is not configured for production. Publishing is temporarily disabled.',
    };
  }

  // In non-production (development/test), allow local bypass token or dummy secret without outbound network dependency
  if (!isProd) {
    if (
      !config.secretKey ||
      config.secretKey === CLOUDFLARE_DUMMY_TEST_SECRET ||
      token === LOCAL_DEV_BYPASS_TOKEN
    ) {
      if (token === 'FORCE_TURNSTILE_FAIL') {
        return {
          ok: false,
          code: 'TURNSTILE_REJECTED',
          message: 'Verification challenge failed.',
        };
      }
      return { ok: true };
    }
  }

  if (!token || token.trim().length === 0) {
    return {
      ok: false,
      code: 'TURNSTILE_REQUIRED',
      message: 'Please complete the anti-spam verification check before submitting.',
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.set('secret', config.secretKey!);
    formData.set('response', token);
    if (remoteIp) {
      formData.set('remoteip', remoteIp);
    }

    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }
    );

    if (!res.ok) {
      return {
        ok: false,
        code: 'TURNSTILE_UPSTREAM_ERROR',
        message: 'Could not verify anti-spam challenge. Please retry.',
      };
    }

    const outcome = (await res.json()) as { success?: boolean };
    if (!outcome.success) {
      return {
        ok: false,
        code: 'TURNSTILE_REJECTED',
        message: 'Anti-spam verification expired or failed. Please try again.',
      };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      code: 'TURNSTILE_NETWORK_ERROR',
      message: 'Verification service unreachable.',
    };
  }
}
