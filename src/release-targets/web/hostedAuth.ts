import {
  createBrowserTraceId,
  type HostedWebRuntimeConfig,
} from './runtimeConfig';

export interface HostedPlayerBootstrap {
  authenticated: boolean;
  sessionId: string | null;
  player?: {
    id?: string;
    type?: string;
  };
  features?: {
    hostedSaveEnabled?: boolean;
  };
}

interface HostedAuthDialogOptions {
  runtime: HostedWebRuntimeConfig;
  gameTitle?: string;
}

interface HostedLoginCredentials {
  username: string;
  password: string;
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  return `${normalizedBase}${path.startsWith('/') ? path : `/${path}`}`;
}

function formatHostedApiError(status: number, fallback: string): string {
  if (status === 401) return 'Sign in is required before you can play this hosted build.';
  if (status === 429) return 'The hosted game is busy right now. Please wait a moment and try again.';
  if (status >= 500) return 'The hosted game backend is unavailable right now. Please try again soon.';
  return fallback;
}

async function requestJson<T>(
  runtime: HostedWebRuntimeConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  headers.set('X-Trace-Id', createBrowserTraceId('web'));
  const response = await fetch(buildUrl(runtime.gameApiBaseUrl, path), {
    ...init,
    credentials: runtime.credentials,
    headers,
  });
  const parsed = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const fallback = typeof parsed.error === 'string'
      ? parsed.error
      : `${response.status} ${response.statusText}`;
    throw new Error(formatHostedApiError(response.status, fallback));
  }
  return parsed as T;
}

export async function fetchHostedPlayerBootstrap(
  runtime: HostedWebRuntimeConfig,
): Promise<HostedPlayerBootstrap> {
  return requestJson<HostedPlayerBootstrap>(runtime, '/player/me');
}

async function loginHostedSharedAlpha(
  runtime: HostedWebRuntimeConfig,
  credentials: HostedLoginCredentials,
): Promise<void> {
  await requestJson<{ ok: boolean }>(runtime, '/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });
}

function openHostedLoginDialog(
  options: HostedAuthDialogOptions,
): Promise<HostedLoginCredentials | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '9999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.background = 'rgba(10, 10, 16, 0.78)';
    overlay.style.backdropFilter = 'blur(6px)';

    const card = document.createElement('div');
    card.style.width = 'min(420px, calc(100vw - 32px))';
    card.style.background = 'linear-gradient(180deg, rgba(24, 23, 32, 0.98), rgba(15, 14, 22, 0.98))';
    card.style.border = '1px solid rgba(220, 196, 160, 0.28)';
    card.style.borderRadius = '14px';
    card.style.boxShadow = '0 18px 50px rgba(0, 0, 0, 0.45)';
    card.style.padding = '20px';
    card.style.color = '#f2e9dd';
    card.style.fontFamily = '\'Segoe UI\', system-ui, sans-serif';

    const title = document.createElement('h2');
    title.textContent = `Sign in to play${options.gameTitle ? ` ${options.gameTitle}` : ''}`;
    title.style.margin = '0 0 8px';
    title.style.fontSize = '20px';
    card.appendChild(title);

    const copy = document.createElement('p');
    copy.textContent = 'This hosted build is protected. Enter the shared alpha username and password to continue.';
    copy.style.margin = '0 0 16px';
    copy.style.fontSize = '14px';
    copy.style.lineHeight = '1.5';
    copy.style.color = 'rgba(242, 233, 221, 0.82)';
    card.appendChild(copy);

    const form = document.createElement('form');
    form.style.display = 'grid';
    form.style.gap = '12px';

    const username = document.createElement('input');
    username.type = 'text';
    username.name = 'username';
    username.placeholder = 'Username';
    username.autocomplete = 'username';
    username.required = true;
    username.style.padding = '10px 12px';
    username.style.borderRadius = '10px';
    username.style.border = '1px solid rgba(220, 196, 160, 0.24)';
    username.style.background = 'rgba(255, 255, 255, 0.05)';
    username.style.color = '#f2e9dd';
    form.appendChild(username);

    const password = document.createElement('input');
    password.type = 'password';
    password.name = 'password';
    password.placeholder = 'Password';
    password.autocomplete = 'current-password';
    password.required = true;
    password.style.padding = '10px 12px';
    password.style.borderRadius = '10px';
    password.style.border = '1px solid rgba(220, 196, 160, 0.24)';
    password.style.background = 'rgba(255, 255, 255, 0.05)';
    password.style.color = '#f2e9dd';
    form.appendChild(password);

    const status = document.createElement('div');
    status.style.minHeight = '18px';
    status.style.fontSize = '13px';
    status.style.color = '#ffb4a3';
    form.appendChild(status);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '10px';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.padding = '9px 12px';
    cancel.style.borderRadius = '9px';
    cancel.style.border = '1px solid rgba(220, 196, 160, 0.24)';
    cancel.style.background = 'rgba(255, 255, 255, 0.04)';
    cancel.style.color = '#f2e9dd';
    cancel.addEventListener('click', () => {
      overlay.remove();
      resolve(null);
    });
    actions.appendChild(cancel);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Sign In';
    submit.style.padding = '9px 14px';
    submit.style.borderRadius = '9px';
    submit.style.border = '1px solid rgba(136, 180, 220, 0.35)';
    submit.style.background = 'rgba(136, 180, 220, 0.18)';
    submit.style.color = '#dcefff';
    actions.appendChild(submit);

    form.appendChild(actions);
    card.appendChild(form);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      status.textContent = '';
      const usernameValue = username.value.trim();
      const passwordValue = password.value;
      if (!usernameValue || !passwordValue) {
        status.textContent = 'Enter both username and password.';
        return;
      }
      overlay.remove();
      resolve({
        username: usernameValue,
        password: passwordValue,
      });
    });

    queueMicrotask(() => username.focus());
  });
}

export async function ensureHostedPlayerSession(
  options: HostedAuthDialogOptions,
): Promise<HostedPlayerBootstrap> {
  const initial = await fetchHostedPlayerBootstrap(options.runtime);
  if (initial.authenticated) return initial;

  while (true) {
    const credentials = await openHostedLoginDialog(options);
    if (!credentials) {
      throw new Error('Hosted play sign-in was cancelled.');
    }
    try {
      await loginHostedSharedAlpha(options.runtime, credentials);
      const session = await fetchHostedPlayerBootstrap(options.runtime);
      if (session.authenticated) {
        return session;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed.';
      const retry = window.confirm(`${message}\n\nWould you like to try again?`);
      if (!retry) {
        throw new Error(message);
      }
    }
  }
}
