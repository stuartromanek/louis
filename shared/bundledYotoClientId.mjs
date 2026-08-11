/**
 * Louis's public Yoto PKCE client ID — safe to ship in all builds (not a secret).
 * Desktop "Use default client" prefills this; self-hosters can paste it into LOUIS_YOTO_CLIENT_ID.
 * Runtime OAuth still requires an explicit config.json / env value (no silent fallback).
 */
export const BUNDLED_YOTO_CLIENT_ID = 'PK00MDKCVwWvOG8o3px3qSl57FhfUZxm'
