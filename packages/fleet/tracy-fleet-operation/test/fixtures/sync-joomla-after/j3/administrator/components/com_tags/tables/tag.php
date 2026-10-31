<?php
// Stand-in for Joomla 3's com_tags table, which the framework does not autoload.
defined('_JEXEC') or die;
class TagsTableTag extends \Joomla\CMS\Table\Nested { protected $name = '#__tags'; }
