import { useEffect } from 'react'
import 'vanilla-cookieconsent/dist/cookieconsent.css'
import './CookieConsent.css'
import * as CookieConsent from 'vanilla-cookieconsent'

export function CookieConsentBanner() {
  useEffect(() => {
    CookieConsent.run({
      guiOptions: {
        consentModal: {
          layout: 'box inline',
          position: 'bottom left',
          equalWeightButtons: true,
          flipButtons: false,
        },
        preferencesModal: {
          layout: 'box',
          position: 'right',
          equalWeightButtons: true,
          flipButtons: false,
        },
      },

      categories: {
        necessary: {
          enabled: true,
          readOnly: true,
        },
        preferences: {
          enabled: false,
          autoClear: {
            cookies: [{ name: /^tapas_/ }],
          },
        },
        analytics: {
          enabled: false,
          autoClear: {
            cookies: [{ name: /^_ga/ }, { name: '_gid' }],
          },
        },
      },

      language: {
        default: 'en',
        translations: {
          en: {
            consentModal: {
              title: 'Cookie Preferences',
              description:
                'We use cookies to save your preferences (like your favorite league) and improve your experience. You can customize your choices below.',
              acceptAllBtn: 'Accept All',
              acceptNecessaryBtn: 'Necessary Only',
              showPreferencesBtn: 'Manage Preferences',
            },
            preferencesModal: {
              title: 'Cookie Settings',
              acceptAllBtn: 'Accept All',
              acceptNecessaryBtn: 'Reject All',
              savePreferencesBtn: 'Save Preferences',
              closeIconLabel: 'Close',
              sections: [
                {
                  title: 'Cookie Usage',
                  description:
                    'We use cookies to ensure basic functionality and enhance your browsing experience. You can choose which categories to allow.',
                },
                {
                  title: 'Strictly Necessary',
                  description: 'Essential for the app to function. Cannot be disabled.',
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Preferences',
                  description:
                    'Remember your settings like favorite league, theme, and recent searches.',
                  linkedCategory: 'preferences',
                },
                {
                  title: 'Analytics',
                  description: 'Help us understand how you use the app so we can improve it.',
                  linkedCategory: 'analytics',
                },
              ],
            },
          },
        },
      },
    })
  }, [])

  return null
}
