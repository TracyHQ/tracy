// Invented businesses and copy for the copy guard tests (#594 review): three profiles (a bakery, a bicycle workshop, a
// yoga studio), 120 honest sentences their data proves and 63 sentences that invent data, in six languages. Nothing
// here is a real business, person, phone number or address.

export const B1 = [
  ['business.name', 'Harbor Lantern Bakery'],
  ['contact.hours', 'Monday to Saturday 07:00-18:00; Sunday 08:00-14:00'],
  ['contact.phone', '+44 20 7946 0958'],
  ['contact.phone', '020 7946 0321'],
  ['contact.address', '14 Quay Street, Portwell PW3 9QA'],
  ['contact.email', 'hello@harborlantern.example'],
  ['contact.cta_url', 'https://harborlantern.example/order'],
  ['business.founded_year', '2009'],
  ['business.summary', 'A family bakery with a team of 12 bakers, baking sourdough since 2009.'],
  ['claim.award_or_cert', 'Golden Crust Award'],
  ['claim.year_or_issuer', '2019'],
  ['service.title', 'Sourdough loaf'],
  ['service.price', '£4.50'],
  ['service.title', 'Celebration cake'],
  ['service.price', 'from £35'],
  ['service.title', 'Kaffee und Kuchen'],
  ['service.price', '3,20 €'],
  ['service.title', 'Bread box subscription'],
  ['service.price', 'GBP 18 per week']
].map(([kind, value]) => ({ kind, value }))
export const B2 = [
  ['business.name', 'Atelier Rivemont'],
  ['contact.hours', 'Tue-Fri 09:30-19:00, Sat 10:00-17:00'],
  ['contact.phone', '+33 6 39 98 00 11'],
  ['contact.phone', '06 12 34 56 78'],
  ['contact.address', '27 rue des Tanneurs, 69002 Valbrune'],
  ['business.founded_year', '1998'],
  ['business.summary', 'A bicycle workshop of 8 mechanics, a certified e-bike service centre.'],
  ['claim.award_or_cert', 'Certified e-bike service centre'],
  ['service.title', 'Révision complète'],
  ['service.price', '89 €'],
  ['service.title', 'Réparation crevaison'],
  ['service.price', '15,00 €'],
  ['service.title', 'Bike rental'],
  ['service.price', '30 USD per day']
].map(([kind, value]) => ({ kind, value }))
export const B3 = [
  ['business.name', 'Studio Ventoro'],
  ['contact.hours', 'Mon-Sun 07:00-21:00'],
  ['contact.phone', '+39 02 8765 4321'],
  ['contact.phone', '+351 21 345 6789'],
  ['contact.address', 'Via Lombarda 42, 20121 Milano'],
  ['contact.address', 'Rua das Flores 18, 1200-195 Lisboa'],
  ['business.founded_year', '2015'],
  ['business.summary', 'A yoga studio with 10 instructors and over 300 members.'],
  ['claim.award_or_cert', 'Premio Città Attiva'],
  ['claim.year_or_issuer', '2022'],
  ['service.title', 'Lezione di prova'],
  ['service.price', '15,00 €'],
  ['service.title', 'Abbonamento mensile'],
  ['service.price', '89 €'],
  ['service.title', 'Pacchetto 10 lezioni'],
  ['service.price', '120 €']
].map(([kind, value]) => ({ kind, value }))

/** Sentences each profile's data proves: the guard flags none of them. */
export const HONEST = {
  en: [
    B1,
    [
      'Harbor Lantern Bakery has baked sourdough in Portwell since 2009.',
      'Our team of 12 bakers starts before sunrise.',
      'We are open Monday to Saturday from 7am to 6pm.',
      'On Sundays we open from 8:00 to 14:00.',
      'Call us on 020 7946 0958 to order a cake.',
      'From abroad, dial +44 20 7946 0321.',
      'Find us at 14 Quay Street, a short walk from the harbour.',
      'A sourdough loaf costs £4.50.',
      'Celebration cakes start at £35.',
      'Our bread box is GBP 18 a week.',
      'Winner of the Golden Crust Award in 2019.',
      'Our Golden Crust Award still hangs above the counter.',
      'Order a cake 48 hours ahead.',
      'Mon to Sat, 07:00 to 18:00.',
      'Pick 3 pastries for your morning box.',
      'Twelve bakers, one oven, and a lot of flour.',
      'Slice it within 2 days for the best crumb.',
      'Open from 7 every morning but Sunday.',
      'Doors close at 6pm on weekdays and Saturdays.',
      'Call +44 (0)20 7946 0958 or write to hello@harborlantern.example.'
    ]
  ],
  de: [
    B1,
    [
      'Seit 2009 backen wir Sauerteigbrot in Portwell.',
      'Unser Team aus 12 Bäckern beginnt vor Sonnenaufgang.',
      'Montag bis Samstag von 7 bis 18 Uhr geöffnet.',
      'Sonntags haben wir von 8 bis 14 Uhr geöffnet.',
      'Rufen Sie uns an: 020 7946 0958.',
      'Aus dem Ausland: +44 20 7946 0321.',
      'Sie finden uns in der Quay Street 14.',
      'Ein Sauerteiglaib kostet 4,50 £.',
      'Kaffee und Kuchen für 3,20 €.',
      'Festtagstorten gibt es ab 35 £.',
      'Ausgezeichnet mit dem Golden Crust Award 2019.',
      'Bestellen Sie Ihre Torte 48 Stunden im Voraus.',
      'Der Teig ruht 36 Stunden.',
      'Wählen Sie 3 Gebäckstücke für Ihre Frühstücksbox.',
      'Zwölf Bäcker, ein Ofen und viel Mehl.',
      'Ab 7 Uhr gibt es frische Brötchen.',
      'Unsere Brotbox kostet 18 GBP pro Woche.',
      'Samstags schließen wir um 18:00.',
      'Das Brot bleibt 2 Tage frisch.',
      'Jeden Morgen um 7:00 öffnen wir die Tür, außer sonntags.'
    ]
  ],
  fr: [
    B2,
    [
      "L'Atelier Rivemont répare vos vélos depuis 1998.",
      'Notre équipe de 8 mécaniciens connaît chaque modèle.',
      'Ouvert du mardi au vendredi de 9h30 à 19h.',
      'Le samedi, nous vous accueillons de 10h à 17h.',
      'Appelez-nous au 06 39 98 00 11.',
      'Mobile : 06 12 34 56 78.',
      "Depuis l'étranger : +33 6 12 34 56 78.",
      'Retrouvez-nous au 27 rue des Tanneurs.',
      'Une révision complète coûte 89 €.',
      'Réparer une crevaison : 15 €.',
      "Atelier certifié pour l'entretien des vélos électriques.",
      'Comptez 2 jours pour une révision complète.',
      'Nous vérifions 25 points de sécurité.',
      'Location de vélo à 30 USD la journée.',
      'Huit mécaniciens passionnés à votre service.',
      "Prenez rendez-vous 24 heures à l'avance.",
      'Nous ouvrons à 9h30 du mardi au vendredi.',
      'Fermeture à 17h le samedi.',
      'Votre vélo prêt en 48 heures.',
      "Dès 9h30, l'atelier est ouvert."
    ]
  ],
  es: [
    B2,
    [
      'Atelier Rivemont repara bicicletas desde 1998.',
      'Nuestro equipo de 8 mecánicos conoce cada modelo.',
      'Abierto de martes a viernes de 9:30 a 19:00.',
      'Los sábados abrimos de 10:00 a 17:00.',
      'Llámenos al 06 39 98 00 11.',
      'Móvil: 06 12 34 56 78.',
      'Desde el extranjero: +33 6 39 98 00 11.',
      'Estamos en el 27 de la rue des Tanneurs.',
      'Una revisión completa cuesta 89 €.',
      'Reparar un pinchazo cuesta 15,00 €.',
      'Taller certificado para bicicletas eléctricas.',
      'Alquiler de bicicleta: 30 USD al día.',
      'Revisamos 25 puntos de seguridad.',
      'Su bicicleta lista en 48 horas.',
      'Pida cita con 2 días de antelación.',
      'Ocho mecánicos a su servicio.',
      'Abrimos a las 9:30 de martes a viernes.',
      'Cerramos a las 17:00 los sábados.',
      'Una revisión dura unas 3 horas.',
      'Hasta las 19:00 de martes a viernes.'
    ]
  ],
  it: [
    B3,
    [
      'Studio Ventoro è aperto tutti i giorni dalle 7:00 alle 21:00.',
      'Dal 2015 insegniamo yoga a Milano.',
      'Il nostro team di 10 insegnanti ti aspetta.',
      'Oltre 300 soci praticano con noi.',
      'Chiamaci al 02 8765 4321.',
      "Dall'estero: +39 02 8765 4321.",
      'Ci trovi in Via Lombarda 42.',
      'Abbiamo 2 sedi, a Milano e a Lisbona.',
      'Una lezione di prova costa 15 €.',
      "L'abbonamento mensile è di 89 euro.",
      'Vincitori del Premio Città Attiva 2022.',
      'Studio premiato con il Premio Città Attiva.',
      'Ogni lezione dura 60 minuti.',
      'Porta 2 amici alla tua prima lezione.',
      "Dieci insegnanti, un'unica passione.",
      'Apriamo alle 7:00, sette giorni su sette.',
      'Chiudiamo alle 21:00 ogni sera.',
      'Il pacchetto da 10 lezioni costa 120 €.',
      'Prenota con 24 ore di anticipo.',
      'Dalle 7 alle 21, ogni giorno.'
    ]
  ],
  pt: [
    B3,
    [
      'O Studio Ventoro está aberto todos os dias das 7:00 às 21:00.',
      'Desde 2015 ensinamos ioga.',
      'A nossa equipa de 10 professores espera por si.',
      'Mais de 300 membros praticam connosco.',
      'Ligue para +351 21 345 6789.',
      'Em Portugal, ligue 21 345 6789.',
      'Estamos na Rua das Flores 18, em Lisboa.',
      'Temos 2 estúdios, em Milão e em Lisboa.',
      'Uma aula experimental custa 15,00 €.',
      'O pacote de 10 aulas custa 120 euros.',
      'Premiado com o Premio Città Attiva em 2022.',
      'Cada aula dura 60 minutos.',
      'Traga 2 amigos para a primeira aula.',
      'Dez professores, uma só paixão.',
      'Abrimos às 7:00 todos os dias.',
      'Fechamos às 21:00.',
      'Reserve com 24 horas de antecedência.',
      'A mensalidade é de 89 €.',
      'Aulas de 45 minutos às segundas.',
      'Das 7h às 21h, todos os dias.'
    ]
  ]
}

/** Sentences that invent data the profile does not hold. */
export const INVENTED = {
  en: [
    B1,
    [
      'Open until 10pm on Fridays.',
      'Baking bread since 1987.',
      'Over 2,000 happy customers every week.',
      "Voted Portwell's favourite bakery.",
      'The best bakery in town.',
      'A croissant costs £2.80.',
      'Call 020 7946 0999 for orders.',
      'Write to orders@harborlantern.example.',
      'Order online at harborlantern-shop.com.',
      'Open daily from 6am.',
      'A sourdough loaf costs €4.50.',
      'Serving 40 local cafés.',
      'Three generations of bakers.'
    ]
  ],
  de: [
    B1,
    [
      'Freitags bis 22 Uhr geöffnet.',
      'Gegründet 1987.',
      'Über 500 Stammkunden jede Woche.',
      'Die beste Bäckerei der Stadt.',
      'Ein Croissant kostet 2,80 €.',
      'Telefon: 030 1234 5678.',
      'E-Mail: info@baeckerei-hafen.example',
      'Mehr auf www.hafenbaeckerei.de',
      'Seit über 30 Jahren für Sie da.',
      'Testsieger bei Brotkultur.'
    ]
  ],
  fr: [
    B2,
    [
      "Ouvert jusqu'à 21h le vendredi.",
      'Fondé en 1985.',
      'Plus de 5 000 vélos réparés.',
      'Élu meilleur atelier de Valbrune.',
      'Changement de chaîne : 25 €.',
      'Appelez le 04 78 90 12 34.',
      'Écrivez-nous à contact@rivemont.example.',
      'Réservez sur rivemont.fr.',
      'Atelier primé par la ville.',
      "20 ans d'expérience à votre service."
    ]
  ],
  es: [
    B2,
    [
      'Abierto hasta las 21:00.',
      'Fundado en 1990.',
      'Más de 3.000 clientes satisfechos.',
      'El mejor taller de la ciudad.',
      'Cambio de cadena: 25 €.',
      'Llámenos al 91 123 45 67.',
      'Escríbanos a hola@rivemont.example.',
      'Reserve en www.rivemont.es.',
      'Taller galardonado.',
      'Abierto los domingos de 10:00 a 14:00.'
    ]
  ],
  it: [
    B3,
    [
      'Aperto fino alle 23:00.',
      'Fondato nel 2005.',
      'Più di 1.000 allievi.',
      'Il miglior studio di yoga di Milano.',
      'Una lezione privata costa 50 €.',
      'Chiamaci al 02 1111 2222.',
      'Scrivici a ciao@ventoro.example.',
      'Prenota su ventoro.it.',
      'Insegnanti certificati Yoga Alliance.',
      'Da oltre 15 anni insegniamo yoga.'
    ]
  ],
  pt: [
    B3,
    [
      'Aberto até às 23h.',
      'Fundado em 2001.',
      'Mais de 1.000 alunos formados.',
      'O melhor estúdio de Lisboa.',
      'Uma aula particular custa 50 €.',
      'Ligue para 21 999 88 88.',
      'Escreva para ola@ventoro.example.',
      'Saiba mais em ventoro.pt.',
      'Estúdio premiado pela cidade.',
      'Há 20 anos a ensinar ioga.'
    ]
  ]
}
