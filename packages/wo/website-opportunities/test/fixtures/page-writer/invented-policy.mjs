// An invented Privacy Policy as a scripted page writer answers the created Privacy page call (#575): five paragraphs,
// each naming the themes it covers (`page-writer-system.mjs`). No real business, no number, no contact detail.
export const INVENTED_POLICY = Object.freeze([
  {
    text: 'What we collect. Your name and message when you write to us or book a visit.',
    covers: ['collected']
  },
  { text: 'Photos. We share pictures of customers only with their consent.', covers: ['photos'] },
  { text: 'Sharing. Your details stay with the business and reach no other company.', covers: ['sharing'] },
  { text: 'Keeping your data. We hold enquiries only as long as we need to answer them.', covers: ['kept'] },
  {
    text: 'Your rights. Ask us to see, correct or delete what we hold about you.',
    covers: ['rights', 'contact']
  }
])

/** The reply of a scripted writer to the privacy call. */
export const privacyReply = () => JSON.stringify({ title: 'Privacy Policy', body: INVENTED_POLICY })
