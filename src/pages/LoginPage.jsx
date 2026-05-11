import { useEffect, useRef, useState } from 'react'
import { fetchGoogleAuthConfig, verifyGoogleCredential } from '../services/api'

const GOOGLE_SCRIPT_ID = 'google-identity-services-sdk'
const GOOGLE_REDIRECT_NONCE_KEY = 'challenger_google_redirect_nonce'

function createNonce() {
  const random = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  return random.slice(0, 32)
}

function parseHashParams(hashValue) {
  const hash = hashValue.startsWith('#') ? hashValue.slice(1) : hashValue
  return new URLSearchParams(hash)
}

export default function LoginPage({ onLogin, onGoogleLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [googleNotice, setGoogleNotice] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const [runtimeGoogleClientId, setRuntimeGoogleClientId] = useState('')
  const [isRedirectSigningIn, setIsRedirectSigningIn] = useState(false)
  const googleButtonRef = useRef(null)
  const onGoogleLoginRef = useRef(onGoogleLogin)
  const hasInitializedGoogleRef = useRef(false)
  const envGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const googleClientId = runtimeGoogleClientId || envGoogleClientId

  useEffect(() => {
    onGoogleLoginRef.current = onGoogleLogin
  }, [onGoogleLogin])

  useEffect(() => {
    let isCancelled = false

    async function handleGoogleRedirectCallback() {
      const params = parseHashParams(window.location.hash || '')
      const idToken = params.get('id_token')
      const returnedState = params.get('state')
      const expectedState = window.localStorage.getItem(GOOGLE_REDIRECT_NONCE_KEY)

      if (!idToken || !returnedState || !expectedState) {
        return
      }

      // Clean callback params from URL immediately to avoid repeat processing.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)

      if (returnedState !== expectedState) {
        setError('Google redirect verification failed. Please try again.')
        return
      }

      window.localStorage.removeItem(GOOGLE_REDIRECT_NONCE_KEY)
      setIsRedirectSigningIn(true)

      try {
        const verifyResult = await verifyGoogleCredential(idToken)
        if (isCancelled) {
          return
        }

        if (!verifyResult?.ok || !verifyResult?.profile) {
          setError(verifyResult?.message || 'Google redirect login failed. Please try again.')
          return
        }

        const loginResult = onGoogleLoginRef.current(verifyResult.profile)
        if (!loginResult.ok) {
          setError(loginResult.message)
          return
        }

        setError('')
      } catch (err) {
        if (!isCancelled) {
          setError(`Google redirect login failed: ${err.message}`)
        }
      } finally {
        if (!isCancelled) {
          setIsRedirectSigningIn(false)
        }
      }
    }

    handleGoogleRedirectCallback()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    let isCancelled = false

    fetchGoogleAuthConfig().then((config) => {
      if (isCancelled) {
        return
      }

      if (config?.clientId) {
        setRuntimeGoogleClientId(config.clientId)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    const origin = window.location.origin
    setDebugInfo(`Origin: ${origin}`)

    if (!googleClientId) {
      setGoogleNotice('Google login is not configured yet on this environment.')
      return
    }

    if (!googleButtonRef.current) {
      return
    }

    if (hasInitializedGoogleRef.current) {
      return
    }

    function renderGoogleButton() {
      if (!window.google?.accounts?.id) {
        setGoogleNotice('Google SDK failed to load. Check your internet connection.')
        return
      }

      googleButtonRef.current.innerHTML = ''

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        ux_mode: 'popup',
        itp_support: true,
        callback: async (response) => {
          if (!response?.credential) {
            setError('Google login did not return a credential. Try again.')
            return
          }

          try {
            const verifyResult = await verifyGoogleCredential(response.credential)

            if (!verifyResult?.ok || !verifyResult?.profile) {
              const errMsg = verifyResult?.message || 'Google login failed. Please try again.'
              setError(errMsg)
              return
            }

            const loginResult = onGoogleLoginRef.current(verifyResult.profile)
            if (!loginResult.ok) {
              setError(loginResult.message)
              return
            }

            setError('')
            setGoogleNotice('')
          } catch (err) {
            setError(`Google login failed: ${err.message}`)
          }
        },
        error_callback: (error) => {
          const reason = error?.type || 'unknown_error'
          const msg =
            `Google Authorization Error (${reason}) for ${origin}\n` +
            'Your origin must be whitelisted in Google Cloud Console:\n' +
            '1. Go to console.cloud.google.com\n' +
            '2. APIs & Services > Credentials\n' +
            '3. Click your OAuth 2.0 Client ID\n' +
            `4. Add "${origin}" to "Authorized JavaScript origins"\n` +
            '5. Also add: http://localhost:5173 and http://127.0.0.1:5173\n' +
            '6. Hard refresh (Ctrl+Shift+R) and try again'
          setGoogleNotice(msg)
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      })

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'pill',
        width: 320,
      })

      setGoogleNotice('')
      hasInitializedGoogleRef.current = true
    }

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID)
    if (existingScript) {
      renderGoogleButton()
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    script.onerror = () => {
      setGoogleNotice('Failed to load Google Sign-In. Check your internet connection.')
    }
    document.body.appendChild(script)

    return () => {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.cancel()
      }
    }
  }, [googleClientId])

  function handleSubmit(event) {
    event.preventDefault()

    const result = onLogin(email, password)
    if (!result.ok) {
      setError(result.message)
      return
    }

    setError('')
  }

  function handleGoogleRedirectSignIn() {
    if (!googleClientId) {
      setError('Google login is not configured for this environment yet.')
      return
    }

    const nonce = createNonce()
    const origin = window.location.origin
    const redirectUri = `${origin}${window.location.pathname}`
    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')

    window.localStorage.setItem(GOOGLE_REDIRECT_NONCE_KEY, nonce)

    googleUrl.searchParams.set('client_id', googleClientId)
    googleUrl.searchParams.set('redirect_uri', redirectUri)
    googleUrl.searchParams.set('response_type', 'id_token')
    googleUrl.searchParams.set('scope', 'openid email profile')
    googleUrl.searchParams.set('state', nonce)
    googleUrl.searchParams.set('nonce', nonce)
    googleUrl.searchParams.set('prompt', 'select_account')

    window.location.assign(googleUrl.toString())
  }

  return (
    <section className="login-page" aria-label="Login to Challenger">
      <div className="login-card">
        <h1>Challenger</h1>
        <p className="login-subtitle">Log in to continue like Facebook.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email address"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit">Log In</button>
        </form>

        {googleClientId ? (
          <div className="google-login-block">
            <p className="google-login-label">or continue with</p>
            <div ref={googleButtonRef} className="google-login-button" />
            <button type="button" className="google-redirect-btn" onClick={handleGoogleRedirectSignIn}>
              Continue with Google (Redirect fallback)
            </button>
            {isRedirectSigningIn ? <p className="google-login-label">Finishing Google redirect sign-in...</p> : null}
            {googleNotice ? (
              <div className="login-error-box">
                {googleNotice.split('\n').map((line, idx) => (
                  <p key={idx} className="login-error-line">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="login-hint">
            Add <strong>VITE_GOOGLE_CLIENT_ID</strong> or <strong>GOOGLE_CLIENT_ID</strong> in .env to enable Google login.
          </p>
        )}

        <p className="login-hint">
          Use your email and password to sign in. If the email is new, Challenger will create
          your account automatically.
        </p>

        {debugInfo ? <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '10px' }}>{debugInfo}</p> : null}
      </div>
    </section>
  )
}
