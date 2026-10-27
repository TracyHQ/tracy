<?php

/**
 * The site's identity — name, contact, social links — kept in ONE module and read by every page.
 *
 * This class is the pure half of `plg_system_tracyidentity`: no Joomla API, so it runs under a
 * bare `php` in the quickstart's tests. The plugin class wires it into Joomla's events.
 *
 * @package tracyidentity
 */

namespace Tracy\Plugin\System\TracyIdentity;

\defined('_JEXEC') or \defined('STDIN') or die;

final class Identity
{
    /**
     * Every token a page may carry. Closed on purpose: anything else in braces — `{loadposition}`
     * above all — is Joomla's or the author's, and a renderer that guessed would rewrite it.
     */
    public const NAMES = [
        'site.name', 'site.legalName', 'site.slogan', 'site.monogram',
        'contact.email', 'contact.phone', 'contact.tel', 'contact.address', 'contact.hours',
        'social.facebook', 'social.instagram', 'social.linkedin', 'social.tiktok', 'social.youtube',
    ];

    /**
     * ACM field of the `site-identity` block → token name. The field names are the ones in
     * `acm/site-identity/tmpl/style-1.xml`, and so the labels a contract slot carries.
     */
    public const FIELDS = [
        'site-name' => 'site.name', 'legal-name' => 'site.legalName',
        'slogan' => 'site.slogan', 'monogram' => 'site.monogram',
        'email' => 'contact.email', 'phone' => 'contact.phone',
        'address' => 'contact.address', 'hours' => 'contact.hours',
        'facebook' => 'social.facebook', 'instagram' => 'social.instagram',
        'linkedin' => 'social.linkedin', 'tiktok' => 'social.tiktok', 'youtube' => 'social.youtube',
    ];

    /**
     * Read the identity module's params — as Joomla stores them — into token variables.
     *
     * @return array<string,string>|null every token name that has a string field; null when the
     *   params are not an identity block at all — the caller then leaves the page alone rather than
     *   blanking every token, which would hide the fault instead of showing it
     */
    public static function fromModuleParams(string $params): ?array
    {
        $outer = json_decode($params, true);
        $config = \is_array($outer) && \is_string($outer['jatools-config'] ?? null)
            ? json_decode($outer['jatools-config'], true)
            : null;
        if (!\is_array($config) || !\is_array($config['site-identity'] ?? null)) {
            return null;
        }
        $fields = $config['site-identity'];

        $vars = [];
        foreach (self::FIELDS as $field => $name) {
            if (\is_string($fields[$field] ?? null)) {
                $vars[$name] = $fields[$field];
            }
        }
        return $vars;
    }

    /**
     * Whether a stored value is a single identity token with nothing behind it — so a layout can
     * leave out a card, a link or a line instead of showing an empty one. Tokens are replaced only
     * after the layout ran, so the layout cannot see the emptiness any other way. A token whose
     * braces a link percent-encoded (`%7Bsocial.tiktok%7D`, see `spellings()`) is the same token.
     *
     * @param array<string,string> $vars
     */
    public static function isBlankToken(string $value, array $vars): bool
    {
        if (!preg_match('/^(?:\{([a-zA-Z.]+)\}|%7B([a-zA-Z.]+)%7D)$/i', trim($value), $m)) {
            return false;
        }
        $name = $m[1] !== '' ? $m[1] : $m[2];
        if (!\in_array($name, self::NAMES, true)) {
            return false;
        }
        return trim((string) (self::withDerived($vars)[$name] ?? '')) === '';
    }

    /**
     * Every way a page may spell one token: in braces, and with its braces percent-encoded in either
     * letter case. A row the Claude Cowork component wrote into is saved through PHP's `saveHTML`,
     * and libxml2 2.9 (the Joomla site image's) percent-encodes the braces of every `href`, `src` and
     * `action` it serialises — the links the write did not touch as well, so a translated top bar
     * read `href="tel:%7Bcontact.tel%7D"` (05/10/2026). The token name itself is letters and dots,
     * which a URL never encodes.
     *
     * @return string[]
     */
    private static function spellings(string $name): array
    {
        return [
            '{' . $name . '}',
            '%7B' . $name . '%7D', '%7b' . $name . '%7d', '%7B' . $name . '%7d', '%7b' . $name . '%7D',
        ];
    }

    /**
     * The variables plus the ones derived from them, never stored: the phone as a `tel:` URL may
     * carry it — digits and a leading plus.
     *
     * @param array<string,string> $vars
     * @return array<string,string>
     */
    private static function withDerived(array $vars): array
    {
        $vars['contact.tel'] = (string) preg_replace('/[^0-9+]/', '', (string) ($vars['contact.phone'] ?? ''));
        return $vars;
    }

    /** @var array<string,string>|null the identity of this request, set by the plugin once read */
    private static ?array $current = null;

    /** @param array<string,string>|null $vars */
    public static function setCurrent(?array $vars): void
    {
        self::$current = $vars;
    }

    /** @return array<string,string>|null null when the plugin did not run or found no identity */
    public static function current(): ?array
    {
        return self::$current;
    }

    /**
     * Replace identity tokens in a rendered page.
     *
     * @param string               $html  the page as Joomla is about to send it
     * @param array<string,string> $vars  identity variables keyed by token name (`site.name`)
     */
    public static function render(string $html, array $vars): string
    {
        $vars = self::withDerived($vars);
        $asHtml = [];
        $asScript = [];
        foreach (self::NAMES as $name) {
            // A fact the customer never gave is absent, not a raw `{token}` on their page.
            $value = (string) ($vars[$name] ?? '');
            // Inside a script a token sits in a string literal (JSON-LD above all), where HTML
            // entities would be read verbatim. JSON_HEX_TAG keeps `</script>` from ending it.
            $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG);
            foreach (self::spellings($name) as $token) {
                // The customer typed this; on the page it is text, never markup.
                $asHtml[$token] = htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
                $asScript[$token] = substr((string) $json, 1, -1);
            }
        }

        $parts = preg_split(
            '~(<script\b[^>]*>.*?</script\s*>|<textarea\b[^>]*>.*?</textarea\s*>)~is',
            $html,
            -1,
            PREG_SPLIT_DELIM_CAPTURE
        );
        if ($parts === false) {
            return $html;
        }
        foreach ($parts as $i => $part) {
            if ($i % 2 === 0) {
                $parts[$i] = strtr($part, $asHtml);
            } elseif (stripos($part, '<script') === 0) {
                $parts[$i] = strtr($part, $asScript);
            }
            // A textarea is text being edited: replacing there would save the name over the token.
        }
        return implode('', $parts);
    }
}
