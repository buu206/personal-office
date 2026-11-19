import {facingRow, displayHeights, positionAt} from './pixel-motion.mjs';

const dexBySpecies = {pikachu:'0025',bulbasaur:'0001',squirtle:'0007',charizard:'0006',mew:'0151'};
const indexBySpecies = {pikachu:0,bulbasaur:1,squirtle:2,charizard:3,mew:4};

export async function startPixelCamp(container) {
  const response = await fetch('assets/pixel/animations.json');
  if (!response.ok) throw Error('动作数据加载失败');
  const animations = await response.json();
  const sprites = new Map();
  await Promise.all(animations.map(async item => {
    const image = new Image();
    image.src = 'assets/pixel/' + item.dex + '-Walk-Anim.png';
    await image.decode();
    const measure = document.createElement('canvas');
    measure.width = image.width;
    measure.height = image.height;
    const context = measure.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    let visibleHeight = 1;
    const frontBounds = {left:item.width, top:item.height, right:-1, bottom:-1};
    for (let row = 0; row < 8; row++) {
      for (let frame = 0; frame < item.durations.length; frame++) {
        let top = item.height, bottom = -1;
        for (let y = 0; y < item.height; y++) {
          for (let x = 0; x < item.width; x++) {
            const offset = ((row * item.height + y) * image.width + frame * item.width + x) * 4;
            if (pixels[offset + 3]) {
              top = Math.min(top, y);
              bottom = Math.max(bottom, y);
              if (row === 0) {
                frontBounds.left = Math.min(frontBounds.left,x);
                frontBounds.top = Math.min(frontBounds.top,y);
                frontBounds.right = Math.max(frontBounds.right,x);
                frontBounds.bottom = Math.max(frontBounds.bottom,y);
              }
            }
          }
        }
        visibleHeight = Math.max(visibleHeight, bottom - top + 1);
      }
    }
    sprites.set(item.dex, {...item, image, frontBounds, visibleHeight, duration:item.durations.reduce((a,b)=>a+b,0)});
  }));
  const canvas = document.createElement('canvas');
  canvas.width = 1040;
  canvas.height = 780;
  canvas.className = 'pixel-canvas';
  canvas.setAttribute('aria-hidden','true');
  container.prepend(canvas);
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = false;
  container.classList.add('has-pixels');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let time = 0, last = 0;
  let hitboxes = [];
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 1040;
    const y = (event.clientY - rect.top) / rect.height * 780;
    const hit = [...hitboxes].reverse().find(h => x>=h.x-h.width/2 && x<=h.x+h.width/2 && y>=h.y-h.height/2 && y<=h.y+h.height/2);
    hit?.button.click();
  });
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now-last)/1000,.05);
    last = now;
    if (document.hidden) return;
    if (!reduced.matches) time += dt;
    context.clearRect(0,0,1040,780);
    for (const portrait of document.querySelectorAll('.card-sprite')) {
      const item = sprites.get(dexBySpecies[portrait.dataset.species]);
      const bounds = item.frontBounds;
      let tick = (time*60)%item.duration, frame = 0;
      while (tick>=item.durations[frame]) tick-=item.durations[frame++];
      const width = bounds.right-bounds.left+1;
      const height = bounds.bottom-bounds.top+1;
      const scale = Math.min(104/width,104/height);
      const cardContext = portrait.getContext('2d');
      cardContext.clearRect(0,0,128,128);
      cardContext.imageSmoothingEnabled = false;
      cardContext.drawImage(item.image,frame*item.width+bounds.left,bounds.top,width,height,
        (128-width*scale)/2,(128-height*scale)/2,width*scale,height*scale);
    }

    hitboxes = [];
    const members = [...container.querySelectorAll('.robot')].map((button, seat) => {
      const index = indexBySpecies[button.dataset.species];
      const item = sprites.get(dexBySpecies[button.dataset.species]);
      // Slots remain distinct even when an imported team repeats a visual family.
      const placement = seat === 3 ? 4 : seat === 4 ? 3 : seat;
      return {button,index,item,position:positionAt(time,placement)};
    }).sort((a,b)=>a.position.y-b.position.y);
    for (const {button,index,item,position} of members) {
      const {x,y,dx,dy} = position;
      const row = facingRow(dx,dy);
      const scale = displayHeights[index]/item.visibleHeight;
      let tick = (time*60)%item.duration, frame = 0;
      while (tick>=item.durations[frame]) tick-=item.durations[frame++];
      const width=item.width*scale,height=item.height*scale;
      const baseline = y+displayHeights[index]/2;
      context.fillStyle='#31543525';
      context.beginPath();
      context.ellipse(x,baseline,displayHeights[index]*.24,6,0,0,Math.PI*2);
      context.fill();
      context.drawImage(item.image,frame*item.width,row*item.height,item.width,item.height,x-width/2,y-height/2,width,height);
      button.style.setProperty('--label-x',x/1040*100+'%');
      button.style.setProperty('--label-y',(baseline+12)/780*100+'%');
      hitboxes.push({button,x,y,width,height});
    }
  }
  requestAnimationFrame(animate);
}
