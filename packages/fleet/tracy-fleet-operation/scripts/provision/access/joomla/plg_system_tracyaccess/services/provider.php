<?php

/**
 * @package     Tracy Access for Joomla
 * @copyright   (C) 2026 Tracy
 * @license     GPL-2.0-or-later
 */

use Joomla\CMS\Extension\PluginInterface;
use Joomla\CMS\Factory;
use Joomla\CMS\Plugin\PluginHelper;
use Joomla\DI\Container;
use Joomla\DI\ServiceProviderInterface;
use Joomla\Event\DispatcherInterface;
use Tracy\Plugin\System\TracyAccess\Extension\TracyAccess;

\defined('_JEXEC') or die;

return new class () implements ServiceProviderInterface {
    public function register(Container $container): void
    {
        $container->set(
            PluginInterface::class,
            function (Container $container) {
                $plugin = new TracyAccess(
                    $container->get(DispatcherInterface::class),
                    (array) PluginHelper::getPlugin('system', 'tracyaccess')
                );
                $plugin->setApplication(Factory::getApplication());
                $plugin->setDatabase($container->get(\Joomla\Database\DatabaseInterface::class));

                return $plugin;
            }
        );
    }
};
