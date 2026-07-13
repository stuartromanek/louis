import {
  buildAuthorizeUrl,
  generatePkceChallenge,
  getYotoAuthFlow,
  setPkceVerifierCookie,
} from '../../../utils/yoto-auth'
import { getYotoConfig } from '../../../utils/yoto'

export default defineEventHandler(async (event) => {
  const config = getYotoConfig(event)
  const flow = getYotoAuthFlow(config)

  let authorizeUrl = buildAuthorizeUrl(config)

  if (flow === 'public-pkce') {
    const { code_verifier, code_challenge } = await generatePkceChallenge()
    setPkceVerifierCookie(event, code_verifier)
    authorizeUrl = buildAuthorizeUrl(config, code_challenge)
  }

  return sendRedirect(event, authorizeUrl)
})
