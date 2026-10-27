<?php
/** Read both native ACM flat fields and grouped legacy seed fields. */
defined('_JEXEC') or die;
if (!class_exists('TracyAcmData')) {
    final class TracyAcmData {
        private $helper;
        private array $fields = [];
        public function __construct($helper, string $params) {
            $this->helper = $helper;
            $params = json_decode($params, true);
            $params = is_array($params) ? $params : [];
            $encoded = $params['jatools-config'] ?? '{}';
            if (!is_string($encoded)) $encoded = '{}';
            $config = json_decode(method_exists($helper, 'decode') ? $helper->decode($encoded) : str_replace(['((', '))'], ['<', '>'], $encoded), true) ?: [];
            $config = is_array($config) ? $config : [];
            $type = explode(':', (string) ($config[':type'] ?? $config[':layout'] ?? ''));
            $type = end($type);
            $data = $config[$type] ?? [];
            if (!is_array($data)) $data = [];
            $aliases = $type === 'team'
                ? ['portrait'=>'member-portrait','name'=>'member-name','role'=>'member-role','bio'=>'member-bio','link'=>'member-link']
                : ($type === 'testimonials' ? ['name'=>'quote-name','role'=>'quote-role','avatar'=>'quote-avatar'] : []);
            foreach ($data as $key => $value) {
                if (is_array($value) && isset($value['rows'])) {
                    foreach ($value as $field => $cells) {
                        if (!is_array($cells)) continue;
                        preg_match('/\[([^]]+)\]$/', $field, $match);
                        $name = $match[1] ?? $field;
                        $this->fields[$aliases[$name] ?? $name] = $cells;
                    }
                } else {
                    preg_match('/\[([^]]+)\]$/', $key, $match);
                    $this->fields[$match[1] ?? $key] = $value;
                }
            }
        }
        public function get($name, $i = 0, $default = null) {
            if (method_exists($this->helper, 'findParam') && $this->helper->findParam($name) !== null) return $this->helper->get($name, $i, $default);
            if (!array_key_exists($name, $this->fields)) return $this->helper->get($name, $i, $default);
            $value = $this->fields[$name];
            $value = is_array($value) ? ($value[$i] ?? '') : ($i === 0 ? $value : '');
            if (is_string($value) && preg_match('/^(.*)\|filter:(.*)$/', $value, $match) && method_exists($this->helper, 'filter' . $match[2])) return $this->helper->{'filter' . $match[2]}($match[1]);
            return $value;
        }
        public function getRows($name) {
            $key = ['slide'=>'slide-title','tab'=>'tab-label','entry'=>'entry-title'][$name] ?? $name;
            if (array_key_exists($key, $this->fields)) return count((array)$this->fields[$key]);
            return $this->helper->getRows($name);
        }
        public function __call($name, $args) { return $this->helper->$name(...$args); }
    }
}
