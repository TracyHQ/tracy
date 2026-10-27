/* Deterministic, read-only product replay. No request is sent to a source website or CMS. */
(function () {
  'use strict';
  var params=new URLSearchParams(location.search),flow=['import','create','system','customize'].includes(params.get('flow'))?params.get('flow'):'create';
  var theme=params.get('theme')==='dark'?'dark':'light',motion=params.get('motion')==='reduced'?'reduced':'full';
  var paused=params.get('paused')==='1'||motion==='reduced',time=0,clock=0,last=0,lastAnnounce=0;
  var P=window.WelcomePointer,TEMPO=P.TEMPO;
  var app=document.getElementById('addsite-app'),wizard=document.getElementById('wizard'),pointer=document.getElementById('pointer');
  /* The import panel wears its own scoped tokens in tch (import-ux-css.ts: .tas-root[data-import-ux]). */
  if(flow==='import')wizard.setAttribute('data-import-ux','');
  var timings={customize:[29500,29500],create:[19600,19600],system:[7900,7900],import:[35330,35330]};
  var camera={x:0,y:0,scale:1},duration=timings[flow][0],still=timings[flow][1];
  /* Scene 3, owner round 44: the pointer rests NOVA_REST ms on the JA Nova card (and, in scene 4, on the Toggl Track card) (hover look on) before it presses, and the
     preview opens NOVA_OPEN ms after the press, once the click ripple has mostly played. */
  var NOVA_REST=700,NOVA_OPEN=400,NOVA_SETTLE=250;
  var routes={
    create:[{time:1250,selector:'#create',label:'Create a new site'},{time:1380,selector:'#continue',label:'Continue with a new site'},{time:2250,selector:'#joomla',label:'Choose Joomla'},{time:2650,selector:'#continue',label:'Continue with Joomla'},{time:3100,selector:'#site-address',label:'Type site address'},{time:5350,selector:'#continue',label:'Continue with fernway.tracy.ai'},{time:6900,selector:'#preview-nova',lead:NOVA_REST,label:'Open JA Nova preview from its Open preview button'},{time:8250,selector:'#preview-next',label:'Next: JA Vega'},{time:9450,selector:'#preview-next',label:'Next: Tracy Base'},{time:10650,selector:'#preview-next',label:'Next: JA Kinetic'},{time:11550,selector:'#preview-theme-dark',label:'Show JA Kinetic dark',themeBeat:'other'},{time:12750,selector:'#preview-theme-light',label:'Back to JA Kinetic light',themeBeat:'own'},{time:15250,selector:'#preview-device-mobile',label:'Show JA Kinetic on a phone'},{time:17950,selector:'#use-template',label:'Rest on Use JA Kinetic',hover:true}],
    /* Scene 4 (owner, round 42): opens on the library, scrolls one row, previews Toggl Track, Voiceflow and ElevenLabs, lands on
       Figma and ends with the pointer resting on Use Figma, no click (as scene 3 ends on Use JA Kinetic). */
    system:[{time:2400,selector:'#preview-system',lead:NOVA_REST,label:'Open Toggl Track preview'},{time:3500,selector:'#preview-next',label:'Next: Voiceflow'},{time:4450,selector:'#preview-next',label:'Next: ElevenLabs'},{time:5400,selector:'#preview-next',label:'Next: Figma'},{time:6350,selector:'#use-system',label:'Rest on Use Figma',hover:true}],
    import:[{time:1450,selector:'#import',label:'Import existing site'},{time:1490,selector:'#continue',label:'Continue with an import'},{time:1800,selector:'#site-address',label:'Type site address'},{time:4400,selector:'#continue',label:'Check site address'},{time:7450,selector:'#continue',label:'Continue to platform'},{time:8950,selector:'#continue',label:'Continue with WordPress'},{time:10950,selector:'#continue',label:'Continue to sign in details'},{time:11500,selector:'#import-username',label:'Type username'},{time:12150,selector:'#import-password',label:'Type masked password'},{time:13950,selector:'#continue',label:'Review import details'},{time:15950,selector:'#continue',label:'Start import'},{time:19900,selector:'#import-open-site',label:'Open your site'}],
    customize:[{time:700,selector:'#cz-name',label:'Type business name'},{time:2150,selector:'#cz-about',label:'Type one line about the business'},{time:6100,selector:'#cz-language',label:'Choose English (United States)'},{time:6750,selector:'#cz-tone-plain',label:'Choose Plain tone'},{time:7150,selector:'#cz-light-upload',label:'Upload light theme logo'},{time:7950,selector:'#cz-dark-upload',label:'Upload dark theme logo'},{time:8700,selector:'#cz-favicon-upload',label:'Upload favicon'},{time:10600,selector:'#continue',label:'Continue to Review'},{time:12500,selector:'#continue',label:'Create site'},{time:16900,selector:'#cz-open-site',label:'Open your site in a new tab'}]
  };
  var actions=routes[flow],state={},actionPoints=[];
  /* The Light | Dark beat in the JA Kinetic preview: the preview opens on the viewer's own theme, shows the OTHER side, then comes back. */
  function otherTheme(){return theme==='dark'?'light':'dark';}
  function themeBeats(){actions.forEach(function(a){if(!a.themeBeat)return;var side=a.themeBeat==='other'?otherTheme():theme;a.selector='#preview-theme-'+side;a.label=(a.themeBeat==='other'?'Show JA Kinetic ':'Back to JA Kinetic ')+side;});}
  themeBeats();
  var importedFrame=null;
  if(flow==='import'){
    importedFrame=document.createElement('iframe');
    importedFrame.id='imported-site-frame';importedFrame.className='imported-site-frame';
    importedFrame.title='Imported tracy.ai site, ready to edit in Tracy';importedFrame.tabIndex=-1;importedFrame.setAttribute('aria-hidden','true');
    importedFrame.src='../engine.html?tab=2&imported=1&theme='+theme+'&motion=full';
    document.querySelector('.replay-host').appendChild(importedFrame);
    importedFrame.addEventListener('load',function(){syncImportedSite();});
  }
  function syncImportedSite(){
    if(!importedFrame)return;
    var opening=time>=20500,opened=clock-toReal(20500),opacity=ease(opened/400);
    importedFrame.classList.toggle('is-open',opening);
    importedFrame.setAttribute('aria-hidden',String(!opening));app.setAttribute('aria-hidden',String(opening));
    importedFrame.style.opacity=String(opacity);
    app.style.opacity=String(1-opacity);
    var replay=importedFrame.contentWindow&&importedFrame.contentWindow.importedSiteReplay;
    if(replay)replay.render(Math.max(0,opened),theme);
  }
  /* Scene 5: the Customize step filled for Fernway Studio, then the new site open in the Tracy app in the Figma look (site-in-app.js, look "system"). */
  /* Round 42: the ready screen (15050), its link opens the site in a new tab (16900), the tab shows (17000), the site fades in
     (17500) and its tour runs (site-tour.js, 12000 ms). */
  var CZ={ready:15050,open:16900,tab:17000,app:17500,scrollA:[5300,5900],scrollB:[9300,10100]},czScroll={a:150,b:420},customizedFrame=null;
  if(flow==='customize'){
    customizedFrame=document.createElement('iframe');customizedFrame.id='customized-site-frame';customizedFrame.className='created-site-frame customized-site-frame';
    customizedFrame.title='New Fernway Studio Joomla site, open in Tracy';customizedFrame.tabIndex=-1;customizedFrame.setAttribute('aria-hidden','true');
    customizedFrame.src='../engine.html?tab=2&site=fernway&look=system&tour=1&theme='+theme+'&motion=full';
    document.querySelector('.replay-host').appendChild(customizedFrame);
    customizedFrame.addEventListener('load',syncCustomizedSite);
  }
  function syncCustomizedSite(){
    if(!customizedFrame)return;
    var opening=time>=CZ.app,opened=clock-toReal(CZ.app),opacity=ease(opened/400);
    customizedFrame.classList.toggle('is-open',opening);customizedFrame.setAttribute('aria-hidden',String(!opening));
    app.setAttribute('aria-hidden',String(opening));customizedFrame.style.opacity=String(opacity);app.style.opacity=String(1-opacity);
    var replay=customizedFrame.contentWindow&&customizedFrame.contentWindow.siteInAppReplay;
    if(replay)replay.render(Math.max(0,opened),theme);
  }
  /* Scene 5 asks the Joomla question set (tch apps/tracy-web/src/questions/joomla.json): name, about, language, tone,
     logo pair and favicon; pages stay as the template ships them. The build shows its main lines only. */
  var CZ_TOTAL=7,BUILD_LINES=5,BUILD_FROM=12800,BUILD_EVERY=450;
  var customizeStages=[
    {stage:'customize',start:0,end:10750,label:'Customize your site'},
    {stage:'review',start:10750,end:12650,label:'Review'},
    {stage:'create-building',start:12650,end:17000,label:'Building your site'},
    {stage:'create-tab',start:17000,end:17500,label:'Your site opens in a new tab'},
    {stage:'create-opening',start:17500,end:17900,label:'Opening your new site'},
    {stage:'create-ready',start:17900,end:29501,label:'Your site, ready to edit'}
  ];
  /* An untouched Customize step: the last frame of scene 4 and the first frame of scene 5 are the same picture. */
  function emptyCustomize(s){
    s.customize=true;s.values={};s.field='';s.languageOpen=false;s.language='';s.tone='';s.uploads={light:'',dark:'',favicon:''};s.scroll=0;s.total=CZ_TOTAL;s.answered=0;s.turn=0;
    return s;
  }
  function customizeState(s){
    var biz=window.TracyBusinesses.fernway,a=biz.answers;
    var current=customizeStages.find(function(part){return time>=part.start&&time<part.end;})||customizeStages[customizeStages.length-1];
    s.stage=/^create-/.test(current.stage)?'create-building':current.stage;s.label=current.label;s.customize=true;
    s.step=s.stage==='review'||s.stage==='create-building'?7:6;
    s.values={name:typed(a.name,800,1900),about:typed(a.about,2250,5150)};
    s.field=time>=700&&time<2000?'name':time>=2150&&time<5250?'about':'';
    s.languageOpen=time>=6100&&time<6350;s.language=time>=6350?a.language:'';s.tone=time>=6750?a.tone:'';
    s.uploads={light:time<7150?'':time<7600?'busy':'done',dark:time<7950?'':time<8400?'busy':'done',favicon:time<8700?'':time<9150?'busy':'done'};
    s.scroll=time<CZ.scrollA[0]?0:time<CZ.scrollB[0]?ease((time-CZ.scrollA[0])/(CZ.scrollA[1]-CZ.scrollA[0]))*czScroll.a:czScroll.a+ease((time-CZ.scrollB[0])/(CZ.scrollB[1]-CZ.scrollB[0]))*(czScroll.b-czScroll.a);
    s.total=CZ_TOTAL;s.answered=['name','about'].filter(function(k){return s.values[k];}).length+(s.language?1:0)+(s.tone?1:0)+['light','dark','favicon'].filter(function(k){return s.uploads[k]==='done';}).length;
    s.buildSteps=Math.max(0,Math.min(BUILD_LINES,Math.floor((time-BUILD_FROM)/BUILD_EVERY)));s.buildDone=time>=BUILD_FROM+BUILD_LINES*BUILD_EVERY;s.submitted=time>=12650;s.completed=time>=CZ.app;s.turn=clock*.36%360;
    s.openHover=time>=CZ.open-200&&time<CZ.tab;s.siteTab=time>=CZ.tab;s.domain=biz.host;
    return s;
  }
  var createStages=[
    {stage:'source',start:0,end:1400,label:'Adding'},
    {stage:'platform',start:1400,end:2800,label:'Platform'},
    {stage:'address',start:2800,end:5500,label:'Site address'},
    {stage:'design',start:5500,end:19601,label:'Starting design'}
  ];
  /* Scene 4: the design system step of the same wizard (JA Kinetic chosen), then the hand-over into Customize. */
  var systemStages=[
    {stage:'system',start:0,end:7901,label:'Design system'}
  ];
  /* The systems the preview walks through, in library order (addsite/systems-dev.js): the step's grid has four columns, so Airbnb is
     the last card of the first row and opens without scrolling; next steps through Eddie, MotherDuck, Toggl Track, Voiceflow and
     ElevenLabs to Figma, about a second each. look = the Kinetic demo look
     (sites/fernway/site.css); fonts = the font line, real font then stand-in (refero DESIGN.md substitutes, fonts on disk). */
  var SYSTEM_WALK=[
    {from:2550,uuid:'813be405-c2b9-41be-9864-7b53d66483dc',look:'toggl',fonts:'Inter stands in for GT Haptik, Inter'},
    {from:3650,uuid:'03b3d707-2a30-4f53-a524-347d1b70eb2c',look:'voiceflow',fonts:'Newsreader stands in for Tiempos Headline, Inter stands in for Selecta'},
    {from:4600,uuid:'031056ff-7af1-46db-8daa-115f731c5d26',look:'elevenlabs',fonts:'Inter stands in for Waldenburg, Inter'},
    {from:5550,uuid:'5fd3b3b4-02ab-456a-87aa-e4395636b671',look:'system',fonts:'Inter stands in for figmaSans, JetBrains Mono stands in for figmaMono'}
  ],SYSTEM_STEPS=SYSTEM_WALK.slice(1).map(function(w){return w.from;});
  function walkSystem(){
    var step=SYSTEM_WALK.filter(function(w){return time>=w.from;}).pop()||SYSTEM_WALK[0],list=window.WelcomeSystems,index=list.findIndex(function(x){return x.uuid===step.uuid;}),x=list[index];
    return {id:x.id,name:x.name,colors:x.colors,index:index,total:list.length,look:step.look,fonts:step.fonts,from:step.from};
  }
  /* The last frame of scene 3 and the first frame of scene 4: the gallery with JA Kinetic chosen. */
  function chosenTemplate(s){
    s.stage='design';s.label='Starting design';s.merged=true;s.platform='Joomla';s.step=3;s.value='fernway';s.valid=true;
    s.galleryFocus='ja-nova';s.selectedId='ja-kinetic';s.useId='use-template';s.templateThumb='../img/templates-dev/ja-kinetic.webp';
    s.selected=true;s.preview=false;s.previewKind='template';s.hovered=false;s.scrollTop=GALLERY_NOVA;s.submitted=false;s.completed=false;s.turn=0;
    return s;
  }
  /* One short smooth scroll of a list (SCROLL ms, ease) by one row of its grid (measured, galleryRow), then it stays. */
  var galleryRow={create:0,system:0},SCROLLS={create:[5800,6500],system:[600,1400]};
  /* A card shows its hover look once the pointer is onto it: ~120 ms before the glide to the click at script time L ends. */
  function hoverFrom(L){var R=toReal(L),p=pointerPlan.find(function(q){return q.click&&Math.abs(q.t-R)<1;});return p?p.arrive-120:R-450;}
  /* Scene 3 scrolls NOVA_ROWS rows down (to the row of JA Nova) in one eased move, minus a small margin; scene 4 scrolls one row. */
  var NOVA_ROWS=4,NOVA_SCROLL_MS=1800;
  function scrollDistance(){return flow==='create'?Math.max(0,NOVA_ROWS*galleryRow.create-16):galleryRow[flow];}
  function listScroll(){var w=SCROLLS[flow];return w?ease((time-w[0])/(w[1]-w[0]))*scrollDistance():0;}
  function systemState(s){
    var current=systemStages.find(function(part){return time>=part.start&&time<part.end;})||systemStages[systemStages.length-1];
    chosenTemplate(s);
    s.stage=current.stage;s.label=current.label;s.step=4;s.scrollTop=listScroll();
    s.systemFocus=SYSTEM_WALK[0].uuid;s.hovered=clock>=hoverFrom(2400)&&time<2550;
    s.preview=time>=2550;s.previewKind='system';s.previewSystem=walkSystem();s.previewTheme=theme;s.previewDevice='desktop';
    s.previewScrollFrac=0;s.useHover=time>=6300;
    s.systemSelected='';
    return s;
  }
  /* Scene 3 preview walk: open JA Nova, step with the pager through JA Vega and Tracy Base to JA Kinetic (gallery order). */
  var PREVIEW_WALK=[{id:'ja-nova',from:7050},{id:'ja-vega',from:8250},{id:'tracy',from:9450},{id:'ja-kinetic',from:10650}];
  /* JA Nova is in the gallery's second row: its Open preview control is below the fold at the top of the list, so the list
     moves just enough to bring that row in while the pointer travels to it (no browse scroll). */
  var GALLERY_NOVA=0,FULL='../img/templates-dev/full/';
  var FULL_SHOTS={'ja-nova':FULL+'ja-nova-home-1440.webp','ja-vega':FULL+'ja-vega-home-1440.webp','tracy':FULL+'tracy-home-1440.webp'};
  function walkTemplate(){
    var step=PREVIEW_WALK.filter(function(w){return time>=w.from;}).pop()||PREVIEW_WALK[0],list=window.WelcomeTemplates,index=list.findIndex(function(t){return t.id===step.id;}),t=list[index];
    return {id:t.id,name:t.name,index:index,total:list.length,image:FULL_SHOTS[t.id]||'../'+t.image};
  }
  function createState(s){
    var current=createStages.find(function(part){return time>=part.start&&time<part.end;})||createStages[createStages.length-1];
    s.stage=current.stage;s.label=current.label;s.merged=true;s.platform=time>=2250?'Joomla':'';
    s.step={source:1,platform:2,address:5,design:3,system:4,customize:6}[s.stage]||6;
    s.value=typed('fernway',3200,4300);s.focused=time>=3100&&time<5150;s.valid=s.stage!=='address'||s.value==='fernway';
    s.galleryFocus='ja-nova';s.selectedId='ja-kinetic';s.useId='use-template';
    s.templateThumb='../img/templates-dev/ja-kinetic.webp';
    /* Scene 3 ends inside the JA Kinetic preview, the pointer resting on Use JA Kinetic without clicking (owner, round 40). */
    s.selected=false;s.preview=time>=7050;s.useHover=time>=17900;s.previewKind='template';s.hovered=clock>=hoverFrom(6900)&&time<7050;
    s.previewTemplate=walkTemplate();
    var kinetic=s.previewTemplate.id==='ja-kinetic';
    s.previewTheme=kinetic?(time>=11550&&time<12750?otherTheme():theme):null;
    s.previewDevice=kinetic&&time>=15250?'mobile':'desktop';
    s.previewScrollFrac=!kinetic?0:s.previewDevice==='mobile'?ease((time-15850)/1600)*.32:ease((time-13150)/1800);
    s.scrollTop=listScroll();
    s.submitted=false;s.completed=false;s.turn=clock*.36%360;
    return s;
  }
  var importStages=[
    {stage:'source',start:0,end:1500,label:'Adding'},
    {stage:'import',start:1500,end:4500,label:'Site address'},
    {stage:'import-checking',start:4500,end:6000,label:'Site address'},
    {stage:'import-checked',start:6000,end:7500,label:'Site address'},
    {stage:'import-platform',start:7500,end:9000,label:'Platform'},
    {stage:'import-access',start:9000,end:11000,label:'Access method'},
    {stage:'import-details',start:11000,end:14000,label:'Sign in details'},
    {stage:'import-review',start:14000,end:16000,label:'Review'},
    {stage:'import-progress',start:16000,end:19000,label:'Import progress'},
    {stage:'import-finish',start:19000,end:20000,label:'Import handed over'},
    {stage:'import-tab',start:20000,end:20500,label:'Your site opens in a new tab'},
    {stage:'import-opening',start:20500,end:20900,label:'Opening your imported site'},
    {stage:'import-ready',start:20900,end:35331,label:'Your site, ready to edit'}
  ];
  function typed(value,start,end){return value.slice(0,Math.max(0,Math.min(value.length,Math.floor((time-start)/(end-start)*value.length))));}
  function ease(value){var p=Math.max(0,Math.min(1,value));return p*p*(3-2*p);}
  /* Scene 1's tempo (pointer.js TEMPO) applied to this replay. The steps above are written in "script" time; the
     clock the viewer sees stretches each part of the script until it meets scene 1's minimums: CLICK_GAP from click
     to click, READ on every wizard step, STEP for each automatic line (import progress lines get IMPORT_STEP), and
     TYPE ms per typed character. Nothing is ever faster than the script. */
  /* Automatic waits run quicker than the pointer (owner, round 42): a check line every AUTO_LINE ms, a progress or build line
     every PROGRESS_LINE ms. The pointer, clicks, typing and rests keep scene 1's tempo. A [from,to,ms,'fix'] constraint plays
     that stretch of script in exactly ms (evenly), so an automatic run can also go faster than its script. */
  var AUTO_LINE=280,PROGRESS_LINE=450,warp=[[0,0]];
  function seq(list,min,out){for(var i=1;i<list.length;i++)out.push([list[i-1],list[i],min]);}
  function constraints(){
    var c=[],T=TEMPO,biz=window.TracyBusinesses&&window.TracyBusinesses.fernway;
    actions.forEach(function(a,i){
      if(!i){c.push([0,a.time,T.READ+T.MOVE]);if(a.lead&&actionPoints[0])c.push([SCROLLS[flow][1],a.time,NOVA_SETTLE+P.glideMs(Math.hypot(actionPoints[0].x-1290,actionPoints[0].y-706))+a.lead]);return;}
      /* Click to click: the pointer rests REST after a click, then glides (longer glides take longer) and lands ARRIVE early. */
      var p=actionPoints[i-1],q=actionPoints[i],glide=p&&q?P.glideMs(Math.hypot(q.x-p.x,q.y-p.y)):T.GLIDE;
      if(a.lead){c.push([actions[i-1].time,a.time,T.CLICK_GAP]);c.push([SCROLLS[flow][1],a.time,NOVA_SETTLE+glide+a.lead]);}else c.push([actions[i-1].time,a.time,Math.max(T.CLICK_GAP,T.REST+glide+T.ARRIVE)]);
    });
    var stages=flow==='import'?importStages:flow==='create'?createStages:flow==='system'?systemStages:customizeStages;
    /* Every stage is on screen at least READ, except the in-between ones and the automatic runs (checks, progress, build). */
    stages.forEach(function(st){if(!/opening|-tab$|import-checking|import-progress|create-building/.test(st.stage))c.push([st.start,Math.min(st.end,timings[flow][0]),T.READ]);});
    function typing(a,b,text){c.push([a,b,text.length*T.TYPE]);}
    if(flow==='import'){
      typing(2000,2800,'https://tracy.ai');typing(11600,12000,'tracy-editor');typing(12200,12500,'••••••••••••');
      c.push([4500,6000,5*AUTO_LINE,'fix']);seq([11600,11730,11860,11990],AUTO_LINE,c);
      c.push([16000,19000,5*PROGRESS_LINE,'fix']);
      /* The done screen is read before the pointer moves to Open your site; the new tab shows, then the site fades in. */
      c.push([19000,19900,T.READ+T.GLIDE+T.ARRIVE]);c.push([19900,20000,300]);c.push([20000,20500,600]);
    }else if(flow==='create'){typing(3200,4300,'fernway');c.push([5800,6500,NOVA_SCROLL_MS,'fix']);c.push([6900,7050,NOVA_OPEN]);}
    else if(flow==='system'){c.push([600,1400,800,'fix']);c.push([2400,2550,NOVA_OPEN]);}
    else if(flow==='customize'&&biz){
      var a=biz.answers;typing(800,1900,a.name);typing(2250,5150,a.about);
      /* Review lists every answer, so it stays twice the usual read before Create site. */
      c.push([10750,12500,2*T.READ]);
      [[7150,7600],[7950,8400],[8700,9150]].forEach(function(u){c.push([u[0],u[1],PROGRESS_LINE]);});
      var b=[];for(var k=0;k<=BUILD_LINES;k++)b.push(BUILD_FROM+k*BUILD_EVERY);seq(b,PROGRESS_LINE,c);
      /* The ready screen is read before the pointer goes to its link; the new tab shows, then the site fades in (as scene 2). */
      c.push([CZ.ready,CZ.open,T.READ+T.GLIDE+T.ARRIVE]);c.push([CZ.open,CZ.tab,300]);c.push([CZ.tab,CZ.app,600]);
    }
    var last=actions.length?actions[actions.length-1].time:0;if(flow!=='import')c.push([last,timings[flow][0],T.READ]);
    return c;
  }
  function buildWarp(){
    var c=constraints(),end=timings[flow][0],knots=[0,end];
    c.forEach(function(x){knots.push(x[0],x[1]);});
    knots=knots.filter(function(v,i,a){return v>=0&&v<=end&&a.indexOf(v)===i;}).sort(function(a,b){return a-b;});
    var real={0:0},fixes=c.filter(function(x){return x[3]==='fix';});warp=[[0,0]];
    function natural(p,L){var r=L-p;fixes.forEach(function(f){if(p>=f[0]&&L<=f[1])r=(L-p)*f[2]/(f[1]-f[0]);});return r;}
    for(var i=1;i<knots.length;i++){var L=knots[i],r=real[knots[i-1]]+natural(knots[i-1],L);
      c.forEach(function(x){if(x[3]!=='fix'&&x[1]===L&&real[x[0]]!=null)r=Math.max(r,real[x[0]]+x[2]);});real[L]=r;warp.push([L,r]);}
    duration=Math.round(real[end]);still=duration;
  }
  function toReal(L){for(var i=1;i<warp.length;i++)if(L<=warp[i][0]){var a=warp[i-1],b=warp[i];return a[1]+(b[1]-a[1])*((L-a[0])/Math.max(1,b[0]-a[0]));}return warp[warp.length-1][1]+(L-warp[warp.length-1][0]);}
  function toLogical(R){for(var i=1;i<warp.length;i++)if(R<=warp[i][1]){var a=warp[i-1],b=warp[i];return a[0]+(b[0]-a[0])*((R-a[1])/Math.max(1,b[1]-a[1]));}return warp[warp.length-1][0]+(R-warp[warp.length-1][1]);}
  function setClock(R){clock=Math.max(0,Math.min(duration,R));time=toLogical(clock);}
    function readState(){
    var s={stage:'source',step:1,label:'Adding',selected:false,valid:true,steps:flow==='import'?['Adding','Site address','Platform','Access method','Sign in details','Review']:['Adding','Platform','Starting design','Design system','Site address','Customize your site','Review']};
    if(flow==='customize'){
      customizeState(s);
    }else if(flow==='create'){
      createState(s);
    }else if(flow==='system'){
      systemState(s);
    }else if(flow==='import'){
      var current=importStages.find(function(part){return time>=part.start&&time<part.end;})||importStages[importStages.length-1];
      s.stage=current.stage;s.label=current.label;s.importing=true;s.domain='tracy.ai';
      s.step=s.stage==='source'?1:time<7500?2:time<9000?3:time<11000?4:time<14000?5:6;
      s.value=typed('https://tracy.ai',2000,2800);s.focused=time>=1800&&time<4150;
      s.valid=s.value==='https://tracy.ai';s.checking=s.stage==='import-checking';
      s.checks=s.stage==='import-checked'?5:s.checking?Math.min(4,Math.floor((time-4500)/300)):0;
      s.username=typed('tracy-editor',11600,12000);s.password=typed('••••••••••••',12200,12500);
      s.field=time>=11500&&time<12100?'import-username':time>=12150&&time<13500?'import-password':'';
      s.adminChecking=time<11600;s.adminChecks=Math.max(0,Math.min(3,Math.floor((time-11600)/130)));
      s.valid=s.stage==='import-details'?!!s.username&&s.password.length===12:s.valid;
      s.progress=Math.min(4,Math.floor((time-16000)/600));s.submitted=time>=16000;s.completed=time>=19000;s.turn=clock*.36%360;
      s.openHover=time>=19700&&time<20000;s.siteTab=time>=20000;
    }
    if(s.stage==='source')s.sourcePick=flow==='import'?(time>=1450?'import':''):flow==='create'&&time>=1250?'create':'';
    if(flow!=='import'&&(s.stage==='source'||s.stage==='platform'||(s.stage==='design'&&!s.selected)))s.steps=['Adding','Platform','Starting design','Site address','Customize your site','Review'];
    return s;
  }
  /* The phone preview keeps true phone proportions (398 x 852 with its bezel): the whole phone is scaled down to the room's height, never cropped. */
  function fitPhone(){var room=wizard.querySelector('.tas-phone-room'),phone=room&&room.querySelector('.tas-phone');if(!phone)return;phone.style.transform='scale('+Math.min(1,(room.clientHeight-2)/phone.offsetHeight).toFixed(4)+')';}
  function snap(){camera.scale=innerWidth/1280;app.style.transform='scale('+camera.scale+')';app.style.setProperty('--hs-inv',String(Math.min(1.8,Math.max(1,.75/camera.scale))));return camera;}
  function target(selector){var el=wizard.querySelector(selector);return el?{el:el}:null;}
  function center(el){var a=app.getBoundingClientRect(),b=el.getBoundingClientRect();return{x:(b.left+b.width/2-a.left)/camera.scale-app.clientLeft,y:(b.top+b.height/2-a.top)/camera.scale-app.clientTop};}
  /* The shared pointer (pointer.js): glides to each action and rings on its click, on the real clock. */
  var pointerPlan=[];
  function pointerAt(){
    var off=(flow==='import'&&time>=20500)||(flow==='customize'&&time>=CZ.app);
    if(off){pointer.style.opacity='0';pointer.classList.remove('is-on');return;}
    P.drive(pointer,clock,pointerPlan,parseFloat(app.style.getPropertyValue('--hs-inv'))||1);
  }
  function measureActions(){var saved=time;if(flow==='customize')measureCustomizeScroll();if(flow==='create'||flow==='system')measureGalleryRow();actionPoints=actions.map(function(a){time=a.time;var st=readState();if(flow==='create'||flow==='system')wizard.dataset.wizardStep=st.stage;wizard.innerHTML=markup().render(st);var list=wizard.querySelector('.tas-ds-body');if(list)list.scrollTop=st.scrollTop||0;var el=wizard.querySelector(a.selector);if(!el)return {x:640,y:348};var p=center(el);if(a.fy!=null){var r=el.getBoundingClientRect();p.y+=(a.fy-.5)*r.height/camera.scale;}return p;});
    /* Where the pointer is when the scene opens: where the previous scene left it, or in from the window's corner. */
    time=0;var first=flow==='customize'?'#continue':null,el=null;
    if(first){wizard.innerHTML=markup().render(readState());el=wizard.querySelector(first);}
    buildWarp();
    var entry=el?{t:0,x:center(el).x,y:center(el).y}:null;
    pointerPlan=actions.map(function(a,i){return {t:toReal(a.time),x:actionPoints[i].x,y:actionPoints[i].y,click:!a.hover,lead:a.lead};});
    if(!entry&&pointerPlan.length){var f=pointerPlan[0],from={x:1290,y:706};entry={t:Math.max(0,f.t-(f.lead||TEMPO.ARRIVE)-P.glideMs(Math.hypot(f.x-from.x,f.y-from.y))-10),x:from.x,y:from.y};}
    if(entry)pointerPlan.unshift(entry);pointerPlan=P.plan(pointerPlan);
    time=saved;wizard.innerHTML='';lastMarkupKey=null;}
  /* One row of the gallery grid: the distance between the tops of its first two rows of cards. */
  function measureGalleryRow(){
    var saved=time;time=flow==='create'?SCROLLS.create[0]:0;wizard.innerHTML=markup().render(readState());
    var tops=Array.from(wizard.querySelectorAll('.tas-gallery-card')).map(function(c){return c.offsetTop;}).filter(function(v,i,a){return a.indexOf(v)===i;}).sort(function(a,b){return a-b;});
    galleryRow[flow]=tops.length>1?tops[1]-tops[0]:0;time=saved;
  }
  function markup(){return flow==='customize'?window.CustomizeStepMarkup:window.AddSiteMarkup;}
  /* Scroll targets come from the drawn form: the first brings Language, Brand into view, the second ends on More. */
  function measureCustomizeScroll(){
    var saved=time;time=0;wizard.innerHTML=markup().render(readState());
    var view=wizard.querySelector('.cz-viewport'),scroller=wizard.querySelector('.cz-scroll'),brand=wizard.querySelector('[data-ask-group=Brand]'),more=wizard.querySelector('[data-ask-group=Pages]');
    if(view&&brand&&more){var top=scroller.getBoundingClientRect().top,h=view.getBoundingClientRect().height/camera.scale,end=scroller.getBoundingClientRect().height/camera.scale;
      czScroll.a=Math.max(0,Math.round((brand.getBoundingClientRect().bottom-top)/camera.scale-h+20));
      czScroll.b=Math.max(czScroll.a,Math.round(Math.min(end-h,(more.getBoundingClientRect().bottom-top)/camera.scale-h+16)));}
    time=saved;
  }
  var lastMarkupKey=null;
  /* The design system preview: JA Kinetic's own demo homepage (sites/fernway/kinetic-demo.js) wearing the system on screen,
     laid out at the 980 px panel width and scaled to the stage; the stage dips briefly while the next system loads in. */
  function dressSystemPreview(){
    var slot=wizard.querySelector('[data-system-preview-slot]');if(!slot||!window.TracySites)return;
    var site=window.TracySites.fernway,sizer=slot.parentElement;
    if(!slot.firstChild)site.buildHomepage(slot,{look:state.previewSystem.look,content:'kinetic'});else site.applyLook(slot,state.previewSystem.look);
    var k=sizer.clientWidth/980;slot.style.transform='scale('+k+')';sizer.style.height=Math.ceil(slot.offsetHeight*k)+'px';
    var since=clock-toReal(state.previewSystem.from);slot.style.opacity=SYSTEM_STEPS.indexOf(state.previewSystem.from)>=0&&since<260?String(.45+.55*ease(since/260)):'';
  }
  /* After "Open your site" the imported site opens in a new tab right of Add site, and that tab becomes the active one. */
  var strip=app.querySelector('.tab-strip'),addTab=strip&&strip.querySelector('.active-tab'),siteTab=null;
  function syncTabs(){
    if(!strip||(flow!=='import'&&flow!=='customize'))return;
    var open=!!state.siteTab;
    if(open&&!siteTab){
      var slot=document.createElement('span');slot.className='tab-slot';
      siteTab=document.createElement('div');siteTab.className='strip-tab is-active';siteTab.dataset.siteTab='';
      siteTab.innerHTML=(flow==='import'?markup().wpIcon:'<img class="strip-favicon" src="../sites/fernway/brand/fernway-favicon.svg" alt="" width="14" height="14">')+'<span>'+state.domain+'</span>';
      addTab.after(slot,siteTab);
    }else if(!open&&siteTab){siteTab.previousElementSibling.remove();siteTab.remove();siteTab=null;}
    addTab.classList.toggle('is-inactive',open);addTab.setAttribute('aria-selected',String(!open));
  }
  function render(){state=readState();syncTabs();syncImportedSite();syncCustomizedSite();if(flow==='customize'){if(time>=CZ.app){if(wizard.dataset.wizardStep!=='create-building'){wizard.dataset.wizardStep='create-building';wizard.innerHTML=markup().render(Object.assign({},state,{buildSteps:BUILD_LINES,buildDone:true}));}pointer.style.display='none';return;}wizard.dataset.wizardStep=state.stage;wizard.innerHTML=markup().render(state);pointerAt();return;}if(flow==='import'&&time>=20500){if(wizard.dataset.wizardStep!=='import-finish'){wizard.dataset.wizardStep='import-finish';wizard.innerHTML=window.AddSiteMarkup.render(Object.assign({},state,{stage:'import-finish'}));}pointer.style.display='none';return;}if(flow==='system'&&state.stage==='customize'){if(wizard.dataset.wizardStep!=='customize'){wizard.dataset.wizardStep='customize';wizard.innerHTML=window.CustomizeStepMarkup.render(state);}pointerAt();return;}wizard.dataset.wizardStep=state.stage;var browsable=['create','system'].includes(flow)&&['design','system'].includes(state.stage),key=browsable?[state.stage,state.selected,state.preview,state.hovered,state.steps.length,state.previewTemplate&&state.previewTemplate.id,state.previewSystem&&state.previewSystem.id,state.systemSelected,state.previewTheme,state.previewDevice,state.useHover].join(':'):null;if(!browsable)lastMarkupKey=null;if(!browsable||key!==lastMarkupKey){wizard.innerHTML=window.AddSiteMarkup.render(state);lastMarkupKey=key;}var gallery=wizard.querySelector('.tas-ds-body');if(gallery)gallery.scrollTop=state.scrollTop||0;dressSystemPreview();var preview=wizard.querySelector('.tas-preview-content');fitPhone();if(preview){var screen=wizard.querySelector('.tas-phone-screen')||preview;screen.scrollTop=state.previewScrollFrac!=null?state.previewScrollFrac*Math.max(0,screen.scrollHeight-screen.clientHeight):state.previewScroll||0;}pointerAt();}
  function status(){return{flow:flow,tab:flow==='import'?1:0,time:clock,scriptTime:time,duration:duration,total:duration,still:still,paused:paused,theme:theme,motion:motion,camera:Object.assign({},camera),step:state.step,stage:state.stage,preview:!!state.preview,previewKind:state.previewKind||null,galleryScroll:state.scrollTop||0,galleryRow:galleryRow[flow]||0,useHover:!!state.useHover,previewName:state.previewSystem?state.previewSystem.name:state.previewTemplate?state.previewTemplate.name:null,selected:state.selected,submitted:!!state.submitted,completed:!!state.completed,progress:flow==='import'&&state.submitted?state.progress:null,stages:(flow==='import'?importStages:flow==='create'?createStages:flow==='customize'?customizeStages:flow==='system'?systemStages:[]).map(function(part){return Object.assign({},part);}),minText:12,clicks:actions.map(function(a){return Object.assign({},a);}),actions:actions.map(function(a){return Object.assign({},a);})};}
  function announce(){window.parent.postMessage(Object.assign({type:'welcome-engine-state'},status()),'*');}
  function seek(value){paused=true;snap();setClock(+value||0);render();announce();return status();}
  function pause(value){paused=value===undefined?true:!!value;last=0;announce();return status();}
  function setTheme(value){theme=value==='dark'?'dark':'light';document.documentElement.dataset.theme=theme;themeBeats();measureActions();render();announce();return status();}
  function restart(){setClock(motion==='reduced'?still:0);paused=motion==='reduced';render();last=0;announce();return status();}
  var api={toReal:function(L){return Math.round(toReal(L));},toScript:toLogical,tempo:function(){return {warp:warp.slice(),pointer:pointerPlan.slice(),tempo:TEMPO};},status:status,getState:status,seek:seek,renderFrame:seek,pause:pause,setPaused:pause,restart:restart,setTheme:setTheme,snapCamera:snap,setMotion:function(value){motion=value==='reduced'?'reduced':'full';return restart();}};
  window.welcomeEngine=api;window.addEventListener('message',function(event){if(event.source!==parent||!event.data||event.data.type!=='welcome-engine-command')return;var d=event.data;if(d.command==='seek')seek(d.value);else if(d.command==='pause')pause(d.value);else if(d.command==='theme')setTheme(d.value);else if(d.command==='motion')api.setMotion(d.value);else if(d.command==='restart')restart();});
  addEventListener('resize',function(){snap();if(flow==='import'&&time>=20500)syncImportedSite();else if(flow==='customize'&&time>=CZ.app)syncCustomizedSite();else pointerAt();});
  function frame(now){if(!paused){if(last){setClock(clock+now-last);render();if(clock>=duration)paused=true;}last=now;}else last=0;if(now-lastAnnounce>500){lastAnnounce=now;announce();}requestAnimationFrame(frame);}
  document.documentElement.dataset.theme=theme;snap();measureActions();if(motion==='reduced')setClock(still);render();requestAnimationFrame(frame);announce();
})();
