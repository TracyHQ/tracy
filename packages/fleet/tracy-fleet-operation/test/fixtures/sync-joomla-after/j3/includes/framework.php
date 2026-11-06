<?php
// Stand-in for Joomla 3's framework: a factory with no service container, the nested tables, and
// the Tags table left for the script to load from administrator/components/com_tags/tables/tag.php.
namespace Joomla\CMS {
    class Factory
    {
        public static $application;
        public static function getDbo() { return new \StubDb(); }
    }
}
namespace Joomla\CMS\Table {
    class Nested
    {
        protected $name;
        public function __construct($db) { if (!($db instanceof \StubDb)) throw new \Exception('no database'); }
        public function rebuild() { \StubDb::$rebuilt[] = $this->name; return true; }
    }
    class Menu extends Nested { protected $name = '#__menu'; }
    class Category extends Nested { protected $name = '#__categories'; }
    class Asset extends Nested { protected $name = '#__assets'; }
}
namespace {
    class StubDb { public static $rebuilt = []; }
    register_shutdown_function(function () { echo 'rebuilt ' . implode(' ', StubDb::$rebuilt) . "\n"; });
}
