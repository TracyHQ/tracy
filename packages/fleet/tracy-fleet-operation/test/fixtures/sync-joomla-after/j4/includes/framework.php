<?php
// Stand-in for Joomla 4+'s framework: the service container, the administrator application and the
// namespaced Tags table.
namespace Joomla\CMS {
    class Factory
    {
        public static $application;
        public static function getContainer() { return new \StubContainer(); }
    }
}
namespace Joomla\CMS\User { class User {} }
namespace Joomla\CMS\Table {
    class Nested
    {
        public function __construct($db) { if (!($db instanceof \StubDb)) throw new \Exception('no database'); }
        public function rebuild() { if (!\Joomla\CMS\Factory::$application) throw new \Exception('Failed to start application'); return true; }
    }
    class Menu extends Nested {}
    class Category extends Nested {}
    class Asset extends Nested {}
}
namespace Joomla\Component\Tags\Administrator\Table { class TagTable extends \Joomla\CMS\Table\Nested {} }
namespace {
    class StubDb {}
    class StubApp
    {
        public function loadIdentity($user) {}
        public function createExtensionNamespaceMap() {}
    }
    class StubContainer
    {
        public function alias($a, $b) { return $this; }
        public function get($id)
        {
            if ($id === 'Joomla\CMS\Application\AdministratorApplication') { echo "application started\n"; return new StubApp(); }
            return new StubDb();
        }
    }
}
