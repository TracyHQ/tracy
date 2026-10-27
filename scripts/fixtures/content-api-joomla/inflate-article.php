<?php
// Test-only SQL stress, not a CMS save. Preserve the mapped DOM instead of replacing its shape.
if (PHP_SAPI !== 'cli') exit(1);
require '/var/www/html/configuration.php';
require '/var/www/html/administrator/components/com_claudecowork/lib/ContentSlots.php';
$c=new JConfig;
$db=new mysqli($c->host,$c->user,$c->password,$c->db);
$input=json_decode(stream_get_contents(STDIN),true,512,JSON_THROW_ON_ERROR);
$id=(int)$input['id'];
$next=ContentSlots::htmlPatch(hex2bin($input['original']),$input['changes']);
$q=$db->prepare('UPDATE '.$c->dbprefix.'content SET introtext=? WHERE id=?');
$q->bind_param('si',$next,$id);$q->execute();
echo "Article stress fixture updated\n";
