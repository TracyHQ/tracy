<?php
$countItem = $helper->count('slide-title');
for ($i = 0; $i < $countItem; $i++) :
  $bgItem = $helper->get('bg-content', $i);
  $number = sprintf("%02d", $i + 1);
  if ($helper->get('feature-count-item') != 1) :
?>
  <div class="bg-<?php echo $bgItem ?>"><h1 class="count-number"><?php echo $number ?></h1></div>
<?php endif; endfor;
