/** Public synthetic translation fixture. No provider, email or user credentials. */
export const fr = {
  language: 'fr',
  guides: {
    email: 'Dites votre adresse e-mail. Je la saisirai et vous la relirai avant de demander un code.',
    code: 'Lisez les six chiffres reçus pour vous connecter.',
    retry: 'Vérifiez le code et relisez les six chiffres.',
    google: 'Choisissez votre compte dans la fenêtre Google.',
    verified: 'Vous êtes connecté. Continuons votre site.',
    cancelled: 'Nous pouvons nous connecter plus tard.',
    confirmEmail: 'J’ai entendu {email}. {spelling} Est-ce correct ? Dites oui pour envoyer le code.',
    emailAgain: 'Dites à nouveau votre adresse e-mail.'
  },
  lexicon: {
    yes: ['oui', 'exact'],
    no: ['non', 'incorrect'],
    cancel: ['annuler'],
    emailPrefix: ['mon adresse est'],
    digits: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'],
    symbols: { '@': 'arobase', '.': 'point', _: 'tiret bas', '-': 'tiret', '+': 'plus', '%': 'pour cent' },
    letterPattern: '{letter} comme {word}'
  }
}
