export type CodexCliReasoningEffort = 'off' | 'low' | 'medium' | 'high' | 'xhigh';
export type CodexCliOAuthStatus = 'signed_out' | 'login_pending' | 'connected';
export type CodexCliMcpAuthStatus = 'unknown' | 'signed_out' | 'connected';

export interface CodexCliOAuthLoginState {
  loginId: string;
  authUrl: string;
  redirectUri: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  startedAt: number;
}

export interface CodexCliOAuthSession {
  status: CodexCliOAuthStatus;
  accessToken?: string;
  idToken?: string;
  refreshToken?: string;
  connectedAt?: number;
  expiresAt?: number | null;
  subject?: string;
  login?: CodexCliOAuthLoginState | null;
  error?: string;
}

export interface CodexCliMcpServer {
  name: string;
  url: string;
  enabled: boolean;
  authStatus: CodexCliMcpAuthStatus;
  addedAt: number;
  lastToolListAt?: number;
  tools?: string[];
}

export interface CodexCliRuntimeState {
  oauth: CodexCliOAuthSession;
  mcpServers: CodexCliMcpServer[];
  reasoningEffort: CodexCliReasoningEffort;
  responsesEndpoint: string;
}

export interface CodexCliTerminalResult {
  lines: string[];
  openUrl?: string;
  nextOAuthSession?: CodexCliOAuthSession;
  nextMcpServers?: CodexCliMcpServer[];
  nextModel?: string;
  nextReasoningEffort?: CodexCliReasoningEffort;
  prompt?: string;
}

export const CODEX_CLI_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_CLI_ISSUER = 'https://auth.openai.com';
export const CODEX_CLI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
export const CODEX_CLI_CALLBACK_PATH = '/auth/callback';
export const CODEX_CLI_ORIGINATOR = 'codex_cli_rs';
const CODEX_CLI_OAUTH_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke';

export const CODEX_CLI_STATIC_REPOSITORY = {
  sourceUrl: 'https://github.com/gangdol2012/codex.git',
  localClonePath: '/Users/gangdol/codex',
  branch: 'main',
  commit: '87bc72408c5ef08f8d21f2cdd00c55451c3be33f',
  packageName: '@openai/codex',
  cliEntrypoint: 'codex-cli/bin/codex.js',
  nativeCrate: 'codex-rs/cli',
  sdkEntrypoint: 'sdk/typescript/src/codex.ts',
  mcpServerCrate: 'codex-rs/mcp-server',
  authIssuer: CODEX_CLI_ISSUER,
  clientId: CODEX_CLI_CLIENT_ID,
  callbackPath: CODEX_CLI_CALLBACK_PATH,
  originator: CODEX_CLI_ORIGINATOR,
} as const;

export const CODEX_CLI_COMMANDS = [
  ['codex', 'show Codex CLI help'],
  ['codex status', 'show OAuth, model, reasoning, and MCP status'],
  ['codex login', 'start the standard Codex CLI browser sign-in'],
  ['codex login --callback <url>', 'finish a browser sign-in from a callback URL'],
  ['codex login --token <oauth-token>', 'attach an existing OAuth bearer token'],
  ['codex logout', 'clear the browser-stored OAuth session'],
  ['codex model', 'show the active Codex model'],
  ['codex model <model>', 'switch the Codex model'],
  ['codex reasoning', 'show the active reasoning effort'],
  ['codex reasoning <off|low|medium|high|xhigh>', 'set reasoning effort for Codex mode'],
  ['codex mcp list', 'list configured MCP servers'],
  ['codex mcp add <name> <url>', 'add a streamable HTTP MCP server'],
  ['codex mcp remove <name>', 'remove an MCP server'],
  ['codex mcp login <name>', 'mark a server as using the current OAuth session'],
  ['codex mcp logout <name>', 'clear a server auth marker'],
  ['codex exec <prompt>', 'send a one-shot prompt through Codex CLI mode'],
] as const;

export const DEFAULT_CODEX_CLI_OAUTH_SESSION: CodexCliOAuthSession = {
  status: 'signed_out',
  login: null,
};

export const DEFAULT_CODEX_CLI_RUNTIME_STATE: CodexCliRuntimeState = {
  oauth: DEFAULT_CODEX_CLI_OAUTH_SESSION,
  mcpServers: [],
  reasoningEffort: 'medium',
  responsesEndpoint: CODEX_CLI_RESPONSES_ENDPOINT,
};

export function normalizeCodexCliOAuthSession(value: unknown): CodexCliOAuthSession {
  if (!value || typeof value !== 'object') return DEFAULT_CODEX_CLI_OAUTH_SESSION;
  const candidate = value as Partial<CodexCliOAuthSession>;
  const status: CodexCliOAuthStatus =
    candidate.status === 'connected' || candidate.status === 'login_pending'
      ? candidate.status
      : 'signed_out';
  const login = normalizeCodexCliOAuthLogin(candidate.login);
  if (status === 'login_pending' && !login) return DEFAULT_CODEX_CLI_OAUTH_SESSION;
  return {
    status,
    accessToken: typeof candidate.accessToken === 'string' ? candidate.accessToken : undefined,
    idToken: typeof candidate.idToken === 'string' ? candidate.idToken : undefined,
    refreshToken: typeof candidate.refreshToken === 'string' ? candidate.refreshToken : undefined,
    connectedAt: typeof candidate.connectedAt === 'number' ? candidate.connectedAt : undefined,
    expiresAt: typeof candidate.expiresAt === 'number' || candidate.expiresAt === null ? candidate.expiresAt : undefined,
    subject: typeof candidate.subject === 'string' ? candidate.subject : undefined,
    login: status === 'login_pending' ? login : null,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
  };
}

export function normalizeCodexCliMcpServers(value: unknown): CodexCliMcpServer[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((server): CodexCliMcpServer | null => {
      if (!server || typeof server !== 'object') return null;
      const candidate = server as Partial<CodexCliMcpServer>;
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
      if (!name || !url) return null;
      return {
        name,
        url,
        enabled: candidate.enabled !== false,
        authStatus: candidate.authStatus === 'connected' || candidate.authStatus === 'signed_out'
          ? candidate.authStatus
          : 'unknown',
        addedAt: typeof candidate.addedAt === 'number' ? candidate.addedAt : Date.now(),
        lastToolListAt: typeof candidate.lastToolListAt === 'number' ? candidate.lastToolListAt : undefined,
        tools: Array.isArray(candidate.tools)
          ? candidate.tools.filter((tool): tool is string => typeof tool === 'string' && tool.trim().length > 0)
          : undefined,
      };
    })
    .filter((server): server is CodexCliMcpServer => !!server);
}

export function normalizeCodexCliReasoningEffort(value: unknown): CodexCliReasoningEffort {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh'
    ? value
    : 'medium';
}

export function formatCodexCliHelpLines() {
  return [
    `Codex CLI static adapter (${CODEX_CLI_STATIC_REPOSITORY.packageName} @ ${CODEX_CLI_STATIC_REPOSITORY.commit.slice(0, 7)})`,
    ...CODEX_CLI_COMMANDS.map(([command, description]) => `  ${command.padEnd(36)} ${description}`),
  ];
}

export function formatCodexCliStatusLines(state: CodexCliRuntimeState, model: string) {
  const oauthLabel = state.oauth.status === 'connected'
    ? `connected${state.oauth.subject ? ` as ${state.oauth.subject}` : ''}`
    : state.oauth.status === 'login_pending'
      ? `browser login pending (${state.oauth.login?.loginId || 'no login id'})`
      : 'signed out';
  const enabledServers = state.mcpServers.filter(server => server.enabled);
  return [
    `Codex CLI repo: ${CODEX_CLI_STATIC_REPOSITORY.localClonePath}`,
    `Static source: ${CODEX_CLI_STATIC_REPOSITORY.commit.slice(0, 12)} (${CODEX_CLI_STATIC_REPOSITORY.branch})`,
    `OAuth: ${oauthLabel}`,
    `Model: ${model || 'unset'}`,
    `Reasoning effort: ${state.reasoningEffort}`,
    `Responses endpoint: ${state.responsesEndpoint}`,
    `MCP servers: ${enabledServers.length}`,
    ...(enabledServers.length > 0 ? enabledServers.map(server => `  ${server.name} ${server.url} auth=${server.authStatus}`) : []),
  ];
}

export async function runCodexCliTerminalCommand(
  args: string[],
  state: CodexCliRuntimeState,
  model: string,
): Promise<CodexCliTerminalResult> {
  const subcommand = (args[0] || 'help').toLowerCase();
  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    return { lines: formatCodexCliHelpLines() };
  }

  if (subcommand === 'status' || subcommand === 'auth' || subcommand === 'config') {
    return { lines: formatCodexCliStatusLines(state, model) };
  }

  if (subcommand === 'login') {
    if (args[1] === '--token' && args[2]) {
      const nextOAuthSession: CodexCliOAuthSession = {
        status: 'connected',
        accessToken: args[2],
        connectedAt: Date.now(),
        login: null,
      };
      return {
        nextOAuthSession,
        lines: ['Codex OAuth token attached for this browser session.'],
      };
    }
    if (args[1] === '--callback' && args[2]) {
      return completeCodexCliBrowserLogin(args.slice(2).join(' '), state.oauth);
    }
    if (args[1] === '--poll') {
      return {
        lines: ['codex login --poll is not used by standard browser login. Run codex login and complete the browser callback.'],
      };
    }
    return startCodexCliBrowserLogin();
  }

  if (subcommand === 'logout') {
    return {
      nextOAuthSession: DEFAULT_CODEX_CLI_OAUTH_SESSION,
      lines: ['Signed out of Codex OAuth in this browser.'],
    };
  }

  if (subcommand === 'model') {
    const nextModel = args.slice(1).join(' ').trim();
    if (!nextModel) return { lines: [`Current Codex model: ${model || 'unset'}`] };
    return {
      nextModel,
      lines: [`Codex model set to ${nextModel}`],
    };
  }

  if (subcommand === 'reasoning') {
    const effort = normalizeCodexCliReasoningEffort(args[1]);
    if (!args[1]) return { lines: [`Current Codex reasoning effort: ${state.reasoningEffort}`] };
    return {
      nextReasoningEffort: effort,
      lines: [`Codex reasoning effort set to ${effort}`],
    };
  }

  if (subcommand === 'mcp') {
    return runCodexCliMcpTerminalCommand(args.slice(1), state.mcpServers);
  }

  if (subcommand === 'exec' || subcommand === 'chat' || subcommand === 'run') {
    const prompt = args.slice(1).join(' ').trim();
    if (!prompt) return { lines: [`Usage: codex ${subcommand} <prompt>`] };
    return {
      prompt,
      lines: [`Codex ${subcommand} queued with model ${model || 'unset'}.`],
    };
  }

  return {
    lines: [`Unknown Codex command: ${subcommand}`, ...formatCodexCliHelpLines()],
  };
}

export function buildCodexCliPromptPrefix(state: CodexCliRuntimeState) {
  const mcpLines = state.mcpServers.length > 0
    ? state.mcpServers
      .filter(server => server.enabled)
      .map(server => `- ${server.name}: ${server.url} auth=${server.authStatus}`)
      .join('\n')
    : '(none)';

  return [
    'Codex CLI static browser adapter is active.',
    `Source repo: ${CODEX_CLI_STATIC_REPOSITORY.sourceUrl}`,
    `Static commit: ${CODEX_CLI_STATIC_REPOSITORY.commit}`,
    `Reasoning effort requested: ${state.reasoningEffort}`,
    'Expose only concise user-visible reasoning summaries and tool/status logs. Do not expose hidden chain-of-thought text.',
    'Configured MCP servers:',
    mcpLines,
  ].join('\n');
}

export function extractCodexCliVisibleText(response: any) {
  const parts: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item?.content)) continue;
    for (const contentItem of item.content) {
      if ((contentItem?.type === 'output_text' || contentItem?.type === 'text') && typeof contentItem?.text === 'string') {
        parts.push(contentItem.text);
      }
    }
  }
  return parts.length > 0
    ? parts.join('\n').trim()
    : typeof response?.output_text === 'string'
      ? response.output_text.trim()
      : '';
}

async function startCodexCliBrowserLogin(): Promise<CodexCliTerminalResult> {
  try {
    const redirectUri = resolveCodexCliRedirectUri();
    const pkce = await generateCodexCliPkce();
    const state = randomBase64Url(32);
    const loginId = randomBase64Url(12);
    const authUrl = buildCodexCliAuthorizeUrl(redirectUri, pkce.codeChallenge, state);
    const nextOAuthSession: CodexCliOAuthSession = {
      status: 'login_pending',
      login: {
        loginId,
        authUrl,
        redirectUri,
        codeVerifier: pkce.codeVerifier,
        codeChallenge: pkce.codeChallenge,
        state,
        startedAt: Date.now(),
      },
    };
    return {
      nextOAuthSession,
      openUrl: authUrl,
      lines: [
        `Starting local login server on ${redirectUri}.`,
        'If your browser did not open, navigate to this URL to authenticate:',
        '',
        authUrl,
        '',
        'After the browser returns to CodeCraft, the one-time authorization code will be exchanged automatically.',
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      nextOAuthSession: { status: 'signed_out', login: null, error: message },
      lines: [`Codex browser login could not start: ${message}`],
    };
  }
}

export async function completeCodexCliBrowserLogin(callbackUrl: string, session: CodexCliOAuthSession): Promise<CodexCliTerminalResult> {
  const login = session.login;
  if (session.status !== 'login_pending' || !login) {
    return {
      nextOAuthSession: DEFAULT_CODEX_CLI_OAUTH_SESSION,
      lines: ['No Codex browser login is pending. Run: codex login'],
    };
  }

  try {
    const parsed = new URL(callbackUrl, typeof window !== 'undefined' ? window.location.href : login.redirectUri);
    const state = parsed.searchParams.get('state') || '';
    if (state !== login.state) {
      return {
        nextOAuthSession: { ...session, error: 'OAuth callback state mismatch' },
        lines: ['Codex OAuth callback rejected: state mismatch. Run codex login again.'],
      };
    }

    const errorCode = parsed.searchParams.get('error');
    if (errorCode) {
      const errorDescription = parsed.searchParams.get('error_description');
      const message = errorDescription ? `${errorCode}: ${errorDescription}` : errorCode;
      return {
        nextOAuthSession: { status: 'signed_out', login: null, error: message },
        lines: [`Codex OAuth callback returned an error: ${message}`],
      };
    }

    const code = parsed.searchParams.get('code') || '';
    if (!code) {
      return {
        nextOAuthSession: { ...session, error: 'OAuth callback did not include a code' },
        lines: ['Codex OAuth callback did not include a one-time authorization code.'],
      };
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: login.redirectUri,
      client_id: CODEX_CLI_CLIENT_ID,
      code_verifier: login.codeVerifier,
    });
    const tokenResponse = await fetch(`${CODEX_CLI_ISSUER}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text().catch(() => '');
      throw new Error(`token exchange failed with ${tokenResponse.status}${detail ? `: ${detail}` : ''}`);
    }

    const tokens = await tokenResponse.json();
    const nextOAuthSession: CodexCliOAuthSession = {
      status: 'connected',
      accessToken: typeof tokens.access_token === 'string' ? tokens.access_token : undefined,
      idToken: typeof tokens.id_token === 'string' ? tokens.id_token : undefined,
      refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : undefined,
      connectedAt: Date.now(),
      expiresAt: typeof tokens.expires_in === 'number' ? Date.now() + tokens.expires_in * 1000 : null,
      subject: parseJwtSubject(tokens.id_token),
      login: null,
    };
    return {
      nextOAuthSession,
      lines: ['Codex OAuth browser sign-in completed.'],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      nextOAuthSession: { ...session, error: message },
      lines: [`Codex OAuth callback failed: ${message}`],
    };
  }
}

function runCodexCliMcpTerminalCommand(args: string[], mcpServers: CodexCliMcpServer[]): CodexCliTerminalResult {
  const subcommand = (args[0] || 'list').toLowerCase();
  if (subcommand === 'list' || subcommand === 'status') {
    if (mcpServers.length === 0) return { lines: ['No Codex MCP servers configured.'] };
    return {
      lines: mcpServers.map(server => `${server.enabled ? '*' : '-'} ${server.name} ${server.url} auth=${server.authStatus}`),
    };
  }

  if (subcommand === 'add') {
    const name = (args[1] || '').trim();
    const url = (args[2] || '').trim();
    if (!name || !url) return { lines: ['Usage: codex mcp add <name> <url>'] };
    const nextMcpServers = [
      ...mcpServers.filter(server => server.name !== name),
      { name, url, enabled: true, authStatus: 'unknown' as const, addedAt: Date.now() },
    ];
    return { nextMcpServers, lines: [`Added MCP server ${name}: ${url}`] };
  }

  if (subcommand === 'remove') {
    const name = (args[1] || '').trim();
    if (!name) return { lines: ['Usage: codex mcp remove <name>'] };
    return {
      nextMcpServers: mcpServers.filter(server => server.name !== name),
      lines: [`Removed MCP server ${name}`],
    };
  }

  if (subcommand === 'login' || subcommand === 'logout') {
    const name = (args[1] || '').trim();
    if (!name) return { lines: [`Usage: codex mcp ${subcommand} <name>`] };
    const found = mcpServers.some(server => server.name === name);
    if (!found) return { lines: [`Unknown MCP server: ${name}`] };
    const authStatus: CodexCliMcpAuthStatus = subcommand === 'login' ? 'connected' : 'signed_out';
    return {
      nextMcpServers: mcpServers.map(server => server.name === name ? { ...server, authStatus } : server),
      lines: [`MCP server ${name} auth set to ${authStatus}.`],
    };
  }

  return { lines: ['Usage: codex mcp list | add <name> <url> | remove <name> | login <name> | logout <name>'] };
}

function normalizeCodexCliOAuthLogin(value: unknown): CodexCliOAuthLoginState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CodexCliOAuthLoginState>;
  const loginId = typeof candidate.loginId === 'string' ? candidate.loginId : '';
  const authUrl = typeof candidate.authUrl === 'string' ? candidate.authUrl : '';
  const redirectUri = typeof candidate.redirectUri === 'string' ? candidate.redirectUri : '';
  const codeVerifier = typeof candidate.codeVerifier === 'string' ? candidate.codeVerifier : '';
  const codeChallenge = typeof candidate.codeChallenge === 'string' ? candidate.codeChallenge : '';
  const state = typeof candidate.state === 'string' ? candidate.state : '';
  if (!loginId || !authUrl || !redirectUri || !codeVerifier || !codeChallenge || !state) return null;
  return {
    loginId,
    authUrl,
    redirectUri,
    codeVerifier,
    codeChallenge,
    state,
    startedAt: typeof candidate.startedAt === 'number' ? candidate.startedAt : Date.now(),
  };
}

function resolveCodexCliRedirectUri() {
  if (typeof window === 'undefined') return `http://localhost:1455${CODEX_CLI_CALLBACK_PATH}`;
  return `${window.location.origin}${CODEX_CLI_CALLBACK_PATH}`;
}

function buildCodexCliAuthorizeUrl(redirectUri: string, codeChallenge: string, state: string) {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_CLI_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: CODEX_CLI_OAUTH_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: CODEX_CLI_ORIGINATOR,
  });
  return `${CODEX_CLI_ISSUER}/oauth/authorize?${query.toString()}`;
}

async function generateCodexCliPkce() {
  const codeVerifier = randomBase64Url(64);
  const digest = await sha256Bytes(new TextEncoder().encode(codeVerifier));
  const codeChallenge = bytesToBase64Url(digest);
  return { codeVerifier, codeChallenge };
}

function randomBase64Url(length: number) {
  const bytes = new Uint8Array(length);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('crypto.getRandomValues is required for Codex CLI login');
  }
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Bytes(input: Uint8Array) {
  if (globalThis.crypto?.subtle) {
    const digestInput = input.slice();
    return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', digestInput.buffer as ArrayBuffer));
  }
  return sha256BytesSync(input);
}

function sha256BytesSync(input: Uint8Array) {
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bitLength = input.length * 8;
  const paddedLength = input.length + 1 + ((64 - ((input.length + 1 + 8) % 64)) % 64) + 8;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  const output = new Uint8Array(32);
  const outputView = new DataView(output.buffer);
  h.forEach((word, index) => outputView.setUint32(index * 4, word, false));
  return output;
}

function rotr(value: number, shift: number) {
  return (value >>> shift) | (value << (32 - shift));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJwtSubject(token: unknown) {
  if (typeof token !== 'string') return undefined;
  const [, payload] = token.split('.');
  if (!payload) return undefined;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = JSON.parse(atob(padded));
    return typeof json.email === 'string'
      ? json.email
      : typeof json.sub === 'string'
        ? json.sub
        : undefined;
  } catch {
    return undefined;
  }
}
