import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { readFileSync } from 'node:fs'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const source = readFileSync(
  new URL('../scripts/webroot/demo-contact/tracydemocontact.php', import.meta.url),
  'utf8'
)
const patch = readFileSync(new URL('../scripts/webroot/demo-contact/view-patch.php', import.meta.url), 'utf8')
const skip = phpSupport().skip
let php
before(() => {
  if (!skip) php = startPhp()
})
after(() => php?.stop())
const stub = String.raw`
namespace Joomla\CMS\Plugin { class CMSPlugin { public $app; public function getApplication() { return $this->app; } } }
namespace {
define('_JEXEC', 1);
eval('?>' . getenv('PLUGIN_SRC'));
eval('?>' . getenv('PATCH_SRC'));
class DemoInput {
    public function __construct(public $values) {}
    public function getCmd($name, $default = '') { return $this->values[$name] ?? $default; }
    public function getInt($name) { return (int) ($this->values[$name] ?? 0); }
}
class DemoApp {
    public $input; public $closed = false; public $client = 'site'; public $reads = 0;
    public function __construct(public $item, $input) { $this->input = new DemoInput($input); }
    public function isClient($client) { return $client === $this->client; }
    public function bootComponent($name) { return $this; }
    public function getMVCFactory() { return $this; }
    public function createModel(...$args) { return $this; }
    public function getItem($id) { $this->reads++; return $this->item; }
    public function close() { $this->closed = true; }
}
`
function run(code) {
  const [result] = php.run([
    { args: ['-r', `${stub}${code}}`], env: { PLUGIN_SRC: source, PATCH_SRC: patch } }
  ])
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('the native layout gains preview support exactly once and unknown layouts are refused', { skip }, () => {
  const out = run(String.raw`
$original = '$showForm = $tparams->get(\'show_email_form\') && ($this->item->email_to || $this->item->user_id); echo $this->loadTemplate(\'form\');';
$changed = tracy_demo_contact_view($original);
try { tracy_demo_contact_view('unfamiliar layout'); $refused = false; } catch (RuntimeException $e) { $refused = true; }
echo json_encode(['changed' => $changed, 'again' => tracy_demo_contact_view($changed), 'refused' => $refused]);
`)
  assert.match(out.changed, /show_email_form/)
  assert.match(out.changed, /TRACY_DEMO_CONTACT_PREVIEW/)
  assert.match(out.changed, /PlgSystemTracydemocontact::render/)
  assert.equal(out.changed, out.again)
  assert.equal(out.refused, true)
})

test('a missing recipient previews the original controls and disables submit without changing reset', {
  skip
}, () => {
  const out = run(String.raw`
$app = new DemoApp((object) ['email_to' => '', 'user_id' => 0], ['option' => 'com_contact', 'view' => 'contact', 'id' => 14]);
$plugin = new PlgSystemTracydemocontact(); $plugin->app = $app; $plugin->onAfterRoute();
echo json_encode(['html' => PlgSystemTracydemocontact::render('<form><input name="name"><textarea name="message"></textarea><button type="submit">Send</button><input type="submit" value="Send"><button type="reset">Clear</button></form>'), 'item' => $app->item]);
`)
  assert.match(out.html, /This demo form is for preview only/)
  assert.match(out.html, /<textarea name="message">/)
  assert.match(out.html, /type="submit" disabled aria-disabled="true"/)
  assert.match(out.html, /type="submit" value="Send" disabled/)
  assert.match(out.html, /<button type="reset">Clear<\/button>/)
  assert.deepEqual(out.item, { email_to: '', user_id: 0 })
})

test('forged contact submissions stop before dispatch; configured recipients and other screens pass through', {
  skip
}, () => {
  const out = run(String.raw`
$results = [];
foreach ([['', 0, 'com_contact', 'site'], ['owner@example.test', 0, 'com_contact', 'site'], ['', 42, 'com_contact', 'site'], ['', 0, 'com_content', 'site'], ['', 0, 'com_contact', 'administrator']] as [$email, $user, $option, $client]) {
    $app = new DemoApp((object) ['email_to' => $email, 'user_id' => $user], ['option' => $option, 'task' => 'contact.submit', 'id' => 14]);
    $app->client = $client;
    $plugin = new PlgSystemTracydemocontact(); $plugin->app = $app;
    ob_start(); $plugin->onAfterRoute(); $body = ob_get_clean();
    $results[] = ['closed' => $app->closed, 'body' => $body];
}
echo json_encode($results);
`)
  assert.deepEqual(
    out.map((r) => r.closed),
    [true, false, false, false, false]
  )
  assert.match(out[0].body, /Messages cannot be sent/)
  assert.ok(out.slice(1).every((r) => r.body === ''))
})

test('a configured contact renders the native form unchanged', { skip }, () => {
  const out = run(String.raw`
$app = new DemoApp((object) ['email_to' => 'owner@example.test', 'user_id' => 0], ['option' => 'com_contact', 'id' => 14]);
$plugin = new PlgSystemTracydemocontact(); $plugin->app = $app; $plugin->onAfterRoute();
$html = '<form><button type="submit">Send</button></form>';
echo json_encode(['html' => PlgSystemTracydemocontact::render($html), 'preview' => defined('TRACY_DEMO_CONTACT_PREVIEW')]);
`)
  assert.equal(out.html, '<form><button type="submit">Send</button></form>')
  assert.equal(out.preview, false)
})
