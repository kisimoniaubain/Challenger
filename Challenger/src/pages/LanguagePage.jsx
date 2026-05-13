import { useMemo, useState } from 'react'
import { SUPPORTED_LANGUAGES } from '../utils/i18n'

export default function LanguagePage({ language, onChangeLanguage, t }) {
  const [query, setQuery] = useState('')

  const filteredLanguages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) {
      return SUPPORTED_LANGUAGES
    }

    return SUPPORTED_LANGUAGES.filter((item) => {
      return (
        item.name.toLowerCase().includes(normalizedQuery)
        || item.nativeName.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [query])

  return (
    <section className="basic-page language-page" aria-label={t('Language')}>
      <div className="language-page-head">
        <h2>{t('Language')}</h2>
        <p className="subtitle">{t('Choose app language')}</p>
      </div>

      <label className="language-search-wrap" htmlFor="language-search-input">
        <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
        <input
          id="language-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('Search language')}
        />
      </label>

      <div className="language-list" role="listbox" aria-label={t('Language')}>
        {filteredLanguages.map((item) => {
          const isActive = item.code === language
          return (
            <button
              key={item.code}
              type="button"
              role="option"
              aria-selected={isActive}
              className={`language-item ${isActive ? 'active' : ''}`}
              onClick={() => onChangeLanguage?.(item.code)}
            >
              <div className="language-copy">
                <strong>{item.name}</strong>
                <p>{item.nativeName}</p>
              </div>
              {isActive ? (
                <span className="language-current-pill">{t('Current language')}</span>
              ) : null}
            </button>
          )
        })}

        {!filteredLanguages.length ? <p className="empty-message">{t('No language found')}</p> : null}
      </div>
    </section>
  )
}
