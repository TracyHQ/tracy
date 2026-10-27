<?php 

defined('_JEXEC') or die;
$opaHero = $helper->get('mask', '0');
$count = $helper->getRows('image-hero');
?>

<div id="acm-hero-wrap-<?php echo $module->id; ?>" class="acm-hero style-1" >
  <div class="<?php if($count > 1) echo 'owl-carousel';?> owl-theme">
    <?php for ($i=0; $i<$count; $i++) : ?>
      <div id="acm-hero-<?php echo $module->id; ?>" class="acm-hero-item item" style="background-image: url('<?php echo $helper->get('image-hero', $i) ?>');">
        <div class="container" >
          <div class="row">
            <div class="col-12 col-lg-9 col-xxl-6">
              <div class="hero-content">
                <div class="hero-content-inner">
                  <?php if($helper->get('sub-title', $i)): ?>
                    <div class="h4 sub-title mt-0 mb-2 text-success">
                      <?php echo $helper->get('sub-title', $i) ?>
                    </div>
                  <?php endif; ?>

                  <?php if($helper->get('title', $i)): ?>
                    <h1 class="hero-title mt-0 mb-2">
                      <?php echo $helper->get('title', $i) ?>
                    </h1>
                  <?php endif; ?>

                  <?php if($helper->get('desc', $i)): ?>
                    <div class="description"><?php echo $helper->get('desc', $i) ?></div>
                  <?php endif; ?>

                  <?php if($helper->get('button', $i) || $helper->get('button-2', $i)): ?>
                    <div class="acm-action">
                      <?php if($helper->get('button', $i)): ?>
                        <a href="<?php echo $helper->get('btn-link', $i); ?>" class="btn btn-<?php echo $helper->get('btn-type', $i) ;?>">
                          <?php echo $helper->get('button', $i) ?>
                          <span><i class="<?php echo $helper->get('btn-icon', $i) ?>"></i></span>    
                        </a>
                      <?php endif; ?>

                      <?php if($helper->get('button-2', $i)): ?>
                        <a href="<?php echo $helper->get('btn-link-2', $i); ?>" class="btn btn-<?php echo $helper->get('btn-type-2', $i) ;?>">
                          <?php echo $helper->get('button-2', $i) ?>
                          <span><i class="<?php echo $helper->get('btn-icon-2', $i) ?>"></i></span>     
                        </a>
                      <?php endif; ?>
                    </div>
                  <?php endif; ?>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    <?php endfor ;?>
  </div>
</div>

<?php if($count > 1) :?>
<script>
  (function($){
    jQuery(document).ready(function($) {
      $("#acm-hero-wrap-<?php echo $module->id; ?> .owl-carousel").owlCarousel({
        addClassActive: true,
        items: 1,
        margin: 0,
        loop: true,
        smartSpeed: 1000,
        dots: true,
        autoplay: false,
        autoplayTimeout: 4000,
        autoplaySpeed: false,
        responsive : {
          // breakpoint from 0 up
          0 : {
            nav : false,
          },
          // breakpoint from 768 up
          768 : {
            nav : true,
          }
        }
      });
    });
  })(jQuery);
</script>
<?php endif; ?>