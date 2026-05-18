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

function getGoogleRedirectUri() {
  const configured = String(import.meta.env.VITE_GOOGLE_REDIRECT_URI || '').trim()
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  if (typeof window === 'undefined') {
    return ''
  }

  // Use origin only (no pathname) to avoid redirect URI mismatches in OAuth config.
  return window.location.origin.replace(/\/$/, '')
}

export default function LoginPage({ onLogin, onRegister, onGoogleLogin, onForgotPassword }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [birthday, setBirthday] = useState('')
  const [gender, setGender] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [error, setError] = useState('')
  const [googleNotice, setGoogleNotice] = useState('')
  const [debugInfo, setDebugInfo] = useState('')
  const [runtimeGoogleClientId, setRuntimeGoogleClientId] = useState('')
  const [isRedirectSigningIn, setIsRedirectSigningIn] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('')
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('')
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const googleButtonRef = useRef(null)
  const onGoogleLoginRef = useRef(onGoogleLogin)
  const hasInitializedGoogleRef = useRef(false)
  const envGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const googleClientId = runtimeGoogleClientId || envGoogleClientId

  useEffect(() => {
    onGoogleLoginRef.current = onGoogleLogin
  }, [onGoogleLogin])

  function triggerGoogleRedirectSignIn() {
    if (!googleClientId) {
      setError('Google login is not configured for this environment yet.')
      return
    }

    const nonce = createNonce()
    const redirectUri = getGoogleRedirectUri()
    const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')

    window.localStorage.setItem(GOOGLE_REDIRECT_NONCE_KEY, nonce)

    googleUrl.searchParams.set('client_id', googleClientId)
    googleUrl.searchParams.set('redirect_uri', redirectUri)
    googleUrl.searchParams.set('response_type', 'id_token')
    googleUrl.searchParams.set('scope', 'openid email profile')
    googleUrl.searchParams.set('response_mode', 'fragment')
    googleUrl.searchParams.set('state', nonce)
    googleUrl.searchParams.set('nonce', nonce)
    googleUrl.searchParams.set('prompt', 'select_account')

    window.location.assign(googleUrl.toString())
  }

  useEffect(() => {
    let isCancelled = false

    async function handleGoogleRedirectCallback() {
      const params = parseHashParams(window.location.hash || '')
      const oauthError = params.get('error')
      const oauthErrorDescription = params.get('error_description')

      if (oauthError) {
        const redirectUri = getGoogleRedirectUri()
        setError(
          `Google redirect failed (${oauthError}). ${oauthErrorDescription || 'Please check OAuth configuration.'} `
          + `Ensure this redirect URI is in Google Cloud Console: ${redirectUri}`,
        )
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
        return
      }

      const idToken = params.get('id_token')
      const returnedState = params.get('state')
      const expectedState = window.localStorage.getItem(GOOGLE_REDIRECT_NONCE_KEY)

      if (!idToken || !returnedState || !expectedState) {
        return
      }

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

          if (reason === 'popup_failed_to_open' || reason === 'popup_closed') {
            triggerGoogleRedirectSignIn()
            return
          }

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
      if (window.google?.accounts?.id) {
        renderGoogleButton()
      } else {
        const onLoad = () => renderGoogleButton()
        const onError = () => {
          setGoogleNotice('Failed to load Google Sign-In SDK. Your network, ad blocker, or browser privacy settings may be blocking Google scripts.')
        }

        existingScript.addEventListener('load', onLoad, { once: true })
        existingScript.addEventListener('error', onError, { once: true })
      }
      return
    }

    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    script.onerror = () => {
      setGoogleNotice('Failed to load Google Sign-In SDK. Your network, ad blocker, or browser privacy settings may be blocking Google scripts.')
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
    
    setError('')
    let result = null

    if (authMode === 'login') {
      // Validate login fields
      if (!email.trim()) {
        setError('Please enter your email or account name.')
        return
      }

      if (!password.trim()) {
        setError('Please enter your password.')
        return
      }

      // Call login handler
      result = onLogin?.(email.trim(), password)
      
      if (result && !result.ok) {
        setError(result.message || 'Login failed. Please try again.')
        return
      }

      // Clear form on successful login
      setEmail('')
      setPassword('')
      setError('')
      return
    }

    // Register mode
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and surname are required.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (!birthday) {
      setError('Birthday is required.')
      return
    }

    const birthdayDate = new Date(birthday)
    const minAllowedBirthday = new Date()
    minAllowedBirthday.setFullYear(minAllowedBirthday.getFullYear() - 13)
    if (birthdayDate > minAllowedBirthday) {
      setError('You must be at least 13 years old to create an account.')
      return
    }

    if (!gender) {
      setError('Please choose a gender.')
      return
    }

    if (!acceptedTerms) {
      setError('Please agree to the terms to create an account.')
      return
    }

    result = onRegister?.({
      firstName,
      lastName,
      name: `${firstName.trim()} ${lastName.trim()}`,
      email: email.trim(),
      password,
      gender,
    })

    if (result && !result.ok) {
      setError(result.message || 'Registration failed. Please try again.')
      return
    }

    // Clear form on successful registration
    setFirstName('')
    setLastName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
    setBirthday('')
    setGender('')
    setAcceptedTerms(false)
    setError('')
  }

  function handleSwitchMode(nextMode) {
    setAuthMode(nextMode)
    setError('')
    setShowForgotPassword(false)
    setRecoveryMessage('')
  }

  function handleForgotPasswordSubmit(event) {
    event.preventDefault()
    setRecoveryMessage('')
    setError('')

    if (recoveryPassword.length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    if (recoveryPassword !== recoveryConfirmPassword) {
      setError('New password and confirm password do not match.')
      return
    }

    const result = onForgotPassword?.(recoveryIdentifier, recoveryPassword)
    if (!result?.ok) {
      setError(result?.message || 'Unable to reset password. Please try again.')
      return
    }

    setRecoveryMessage(result.message || 'Password updated successfully.')
    setRecoveryIdentifier('')
    setRecoveryPassword('')
    setRecoveryConfirmPassword('')
    setShowForgotPassword(false)
  }

  return (
    <section className="login-page" aria-label="Login to Challenger">
      <div className="login-card">
        <h1 className="login-brand-heading" aria-label="Challenger">
          <img src="/avatars/challenger.png" alt="Challenger logo" className="login-brand-logo" />
          <span className="login-brand-word">Challenger</span>
        </h1>
        <p className="login-subtitle">
          {authMode === 'login'
            ? 'Log in to continue.'
            : 'Create your account to start using Challenger.'}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          {authMode === 'register' ? (
            <>
              <div className="register-name-grid">
                <div>
                  <label htmlFor="first-name">First name</label>
                  <input
                    id="first-name"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="First name"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="last-name">Surname</label>
                  <input
                    id="last-name"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Surname"
                    required
                  />
                </div>
              </div>
            </>
          ) : null}

          <label htmlFor="email">
            {authMode === 'login' ? 'Email or account name' : 'Email'}
          </label>
          <input
            id="email"
            type={authMode === 'login' ? 'text' : 'email'}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={authMode === 'login' ? 'Email or account name' : 'Email address'}
            autoComplete="email"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />

          {authMode === 'register' ? (
            <>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                required
              />

              <label htmlFor="birthday">Date of birth</label>
              <input
                id="birthday"
                type="date"
                value={birthday}
                onChange={(event) => setBirthday(event.target.value)}
                required
              />

              <fieldset className="register-gender">
                <legend>Gender</legend>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="Female"
                    checked={gender === 'Female'}
                    onChange={(event) => setGender(event.target.value)}
                    required
                  />
                  Female
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="Male"
                    checked={gender === 'Male'}
                    onChange={(event) => setGender(event.target.value)}
                    required
                  />
                  Male
                </label>
                <label>
                  <input
                    type="radio"
                    name="gender"
                    value="Custom"
                    checked={gender === 'Custom'}
                    onChange={(event) => setGender(event.target.value)}
                    required
                  />
                  Custom
                </label>
              </fieldset>

              <label className="register-terms" htmlFor="terms-check">
                <input
                  id="terms-check"
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  required
                />
                I agree to the Terms, Data Policy, and Cookies Policy.
              </label>
            </>
          ) : null}

          {error ? <p className="login-error">{error}</p> : null}

          <button type="submit">{authMode === 'login' ? 'Log In' : 'Create Account'}</button>
        </form>

        {authMode === 'login' ? (
          <div className="forgot-password-block">
            <button
              type="button"
              className="btn-toggle forgot-password-toggle"
              onClick={() => {
                setShowForgotPassword((prev) => !prev)
                setError('')
                setRecoveryMessage('')
              }}
            >
              Forgot password?
            </button>

            {showForgotPassword ? (
              <form className="login-form forgot-password-form" onSubmit={handleForgotPasswordSubmit}>
                <label htmlFor="recovery-identifier">Account name or email</label>
                <input
                  id="recovery-identifier"
                  type="text"
                  value={recoveryIdentifier}
                  onChange={(event) => setRecoveryIdentifier(event.target.value)}
                  placeholder="Enter account name or email"
                  required
                />

                <label htmlFor="recovery-password">New password</label>
                <input
                  id="recovery-password"
                  type="password"
                  value={recoveryPassword}
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  placeholder="New password"
                  required
                />

                <label htmlFor="recovery-confirm-password">Confirm new password</label>
                <input
                  id="recovery-confirm-password"
                  type="password"
                  value={recoveryConfirmPassword}
                  onChange={(event) => setRecoveryConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  required
                />

                <button type="submit">Reset Password</button>
              </form>
            ) : null}
          </div>
        ) : null}

        {recoveryMessage ? <p className="login-hint">{recoveryMessage}</p> : null}

        <div className="login-mode-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'login'}
            className={authMode === 'login' ? 'is-active' : ''}
            onClick={() => handleSwitchMode('login')}
          >
            Log In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authMode === 'register'}
            className={authMode === 'register' ? 'is-active' : ''}
            onClick={() => handleSwitchMode('register')}
          >
            Create Account
          </button>
        </div>

        {googleClientId ? (
          <div className="google-login-block">
            <p className="google-login-label">or continue with</p>
            <div ref={googleButtonRef} className="google-login-button" />
            <button
              type="button"
              className="google-redirect-btn"
              onClick={triggerGoogleRedirectSignIn}
            >
              Continue with Google (Redirect)
            </button>
            {isRedirectSigningIn ? <p className="google-login-label">Finishing Google sign in...</p> : null}
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

        {debugInfo ? <p className="login-debug-origin">{debugInfo}</p> : null}
      </div>
    </section>
  )
}
