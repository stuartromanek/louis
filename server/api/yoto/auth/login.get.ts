import {
  buildAuthorizeUrl,
  generatePkceChallenge,
  getYotoAuthFlow,
  setPkceVerifierCookie,
} from '../../../utils/yoto-auth'
import { getYotoConfig } from '../../../utils/yoto'
import {
  createOAuthState,
  storePendingPkce,
} from '../../../utils/yoto-desktop-session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const external = query.external === '1' || query.external === 'true'

  const config = getYotoConfig(event)
  const flow = getYotoAuthFlow(config)
  const state = createOAuthState()

  let authorizeUrl = buildAuthorizeUrl(config, { state })

  if (flow === 'public-pkce') {
    const { code_verifier, code_challenge } = await generatePkceChallenge()
    storePendingPkce(state, code_verifier, external)
    // Cookie still helps same-window (non-external) flow as a fallback.
    if (!external) {
      setPkceVerifierCookie(event, code_verifier)
    }
    authorizeUrl = buildAuthorizeUrl(config, {
      codeChallenge: code_challenge,
      state,
    })
  }
  else if (external) {
    // Confidential flow has no verifier; still mark pending so callback knows external.
    storePendingPkce(state, '', external)
  }

  if (external) {
    setHeader(event, 'Cache-Control', 'no-store')
    return { authorizeUrl }
  }

  return sendRedirect(event, authorizeUrl)
})
