/** Build the shared ACM scalar seed from the site contract; never invent social destinations. */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  validateContract,
  contractHash
} from '../../../vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/content-contract.mjs'
const contract = validateContract(
  JSON.parse(
    readFileSync(new URL('./content/tracy-editorial/content-contract.json', import.meta.url), 'utf8')
  )
)
const fact = (key) => {
  const entry = contract.facts[key]
  if (!entry || entry.status === 'pending') throw new Error(`Unresolved contact fact: ${key}`)
  return entry.value
}
const keys = ['heading', 'email', 'email-label', 'social-heading', 'unavailable-label']
const seed = Object.fromEntries(keys.map((key) => [key, fact(`contact.info.${key}`)]))
seed.notice = fact('contact.notice')
seed['social-platform'] = ['linkedin', 'instagram', 'facebook', 'tiktok', 'youtube']
seed['social-url'] = [
  'https://www.linkedin.com/',
  'https://www.instagram.com/',
  'https://www.facebook.com/',
  'https://www.tiktok.com/',
  'https://www.youtube.com/'
]
seed['social-handle'] = '@tracyappledemo'
if (!process.argv[2]) throw new Error('Usage: node build-contact-information.mjs seed.json')
writeFileSync(process.argv[2], JSON.stringify(seed, null, 2) + '\n')
console.log(`Contact seed written from contract ${contractHash(contract)}`)
