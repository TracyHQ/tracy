// One obviously fake value per rule of the secret scan (ticket #586), for an invented florist. Each is built at run
// time from pieces, so no scanner of this repository reads a whole one in the source.
const D = '$'
const fake = (word, n) => word.repeat(Math.ceil(n / word.length)).slice(0, n)
/** One invented value per rule. */
export const PLANTED = {
  bcrypt_hash: D + '2y' + D + '10' + D + fake('FakeTulip', 53),
  argon2_hash:
    D + 'argon2id' + D + 'v=19' + D + 'm=65536,t=4,p=1' + D + 'RmFrZVNhbHQ' + D + 'RmFrZVR1bGlwSGFzaFZhbHVl',
  phpass_hash: D + 'P' + D + fake('FakeRose', 31),
  md5_salt_hash: fake('fade', 32) + ':' + fake('FakeSalt', 16),
  sha_crypt_hash: D + '6' + D + 'fakesalt' + D + fake('FakeLily', 86),
  jwt: 'eyJ' + 'hbGciOiJub25lIn0' + '.eyJ' + 'zdWIiOiJwZXRhbCJ9' + '.' + 'RmFrZVNpZ25hdHVyZQ',
  private_key:
    '-----BEGIN ' +
    'RSA PRIVATE' +
    ' KEY-----\n' +
    fake('FakeKeyBody', 64) +
    '\n' +
    '-----END ' +
    'RSA PRIVATE KEY-----',
  uri_credentials: 'smtp://' + 'petal' + ':' + 'Tulip7Fake' + '@' + 'mail.florist.test',
  php_session_data: 'joomla|s:12:"' + 'RmFrZVNlc3Npb24' + '";'
}
