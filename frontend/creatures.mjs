import * as THREE from './vendor/three.module.min.js';

const materials = new Map();
const wingMaterial = new THREE.MeshStandardMaterial({color:'#3a8d99',roughness:.75,side:THREE.DoubleSide});
function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({color, roughness: .73}));
  return materials.get(color);
}
function oval(parent, color, position, scale) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function joint(parent, position) {
  const group = new THREE.Group();
  group.position.set(...position);
  parent.add(group);
  return group;
}
function tube(parent, color, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), material(color));
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function cone(parent, color, position, radius, height, rotation = 0) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 20), material(color));
  mesh.position.set(...position);
  mesh.rotation.z = rotation;
  mesh.castShadow = true;
  parent.add(mesh);
}
function face(head, spacing, z, color = '#182e34') {
  const eyes = [];
  for (const sign of [-1, 1]) {
    const eye = oval(head, '#fff8e8', [sign * spacing, .06, z], [.115, .16, .065]);
    oval(eye, color, [.1 * sign, 0, .8], [.67, .77, .6]);
    oval(eye, '#ffffff', [-.18, .35, 1.27], [.2, .22, .17]);
    eyes.push(eye);
  }
  oval(head, '#263536', [0, -.08, z + .07], [.045, .03, .045]);
  tube(head, '#5d423b', [[-.1,-.18,z],[0,-.22,z+.025],[.1,-.18,z]], .012);
  return eyes;
}
function buildCreature(species) {
  const root = new THREE.Group();
  const torso = joint(root, [0,0,0]);
  const legs = [], arms = [], ears = [], wings = [];
  const yellow = '#f4c83f', blue = '#6fc4cf', pink = '#ebbad4', green = '#70b5a0', orange = '#e69143';
  const color = {pikachu:yellow, squirtle:blue, mew:pink, bulbasaur:green, charizard:orange}[species];
  const quadruped = species === 'bulbasaur';
  const head = joint(torso, [0, quadruped ? .64 : 1.23, quadruped ? .5 : .03]);
  oval(torso,color,[0,.65,0],quadruped?[.55,.38,.65]:[.38,.54,.29]);
  oval(head,color,[0,0,0],quadruped?[.48,.37,.4]:[.43,.38,.33]);
  const eyes = face(head,quadruped?.23:.2,quadruped?.35:.29,species==='bulbasaur'?'#a33a4d':species==='mew'?'#298ba5':'#263438');
  for (const sign of [-1,1]) {
    const leg = joint(torso,[sign*(quadruped?.36:.23),quadruped?.35:.33,quadruped?.36:0]);
    oval(leg,color,[0,-.15,.055],[.14,.23,.16]);
    oval(leg,color,[0,-.27,.15],[.15,.1,.23]);
    legs.push(leg);
    if (quadruped) {
      const rear = joint(torso,[sign*.38,.35,-.4]);
      oval(rear,color,[0,-.15,0],[.16,.23,.18]);
      legs.push(rear);
    } else {
      const arm = joint(torso,[sign*.32,.92,.03]);
      oval(arm,color,[sign*.055,-.16,.05],[.12,.23,.12]);
      oval(arm,color,[sign*.07,-.3,.09],[.13,.1,.12]);
      arms.push(arm);
    }
  }
  let tail;
  if (species === 'pikachu') {
    for (const sign of [-1,1]) {
      const ear=joint(head,[sign*.28,.25,0]);
      ear.rotation.z=-sign*.3;
      oval(ear,yellow,[0,.32,0],[.1,.4,.075]);
      oval(ear,'#303439',[0,.59,0],[.09,.15,.077]);
      ears.push(ear);
      oval(head,'#db6250',[sign*.34,-.12,.235],[.115,.08,.045]);
    }
    tail=joint(torso,[0,.42,-.25]);
    const shape=new THREE.Shape();
    shape.moveTo(0,0); shape.lineTo(.23,.26); shape.lineTo(.08,.42); shape.lineTo(.42,.7);
    shape.lineTo(.29,.86); shape.lineTo(.7,1.1); shape.lineTo(.64,.65); shape.lineTo(.46,.74);
    shape.lineTo(.3,.43); shape.lineTo(.38,.32); shape.lineTo(.08,-.02);
    const bolt=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:2,steps:1}),material(yellow));
    tail.add(bolt);
    oval(torso,'#a77845',[0,.78,-.27],[.3,.055,.04]);
    oval(torso,'#a77845',[0,.6,-.29],[.3,.045,.04]);
  }
  if (species === 'squirtle') {
    oval(torso,'#f2deb0',[0,.65,.245],[.32,.43,.09]);
    oval(torso,'#eee2c6',[0,.69,-.18],[.45,.52,.24]);
    oval(torso,'#9d7453',[0,.72,-.29],[.4,.46,.25]);
    for (const y of [.48,.7,.9]) tube(torso,'#b6a577',[[-.25,y,.3],[0,y-.03,.34],[.25,y,.3]],.012);
    tail=joint(torso,[0,.35,-.3]);
    tube(tail,blue,[[0,0,0],[.2,0,-.3],[.35,.2,-.45],[.16,.35,-.48],[.05,.2,-.45]],.1);
  }
  if (species === 'bulbasaur') {
    for (const sign of [-1,1]) {
      cone(head,green,[sign*.3,.33,-.05],.16,.35,-sign*.3);
      for (let i=0;i<3;i++) oval(torso,'#3c8475',[sign*.5,.55+i*.1,-.1+i*.2],[.035,.065,.09]);
      for (let i=0;i<3;i++) oval(torso,'#f5e9d2',[sign*.36+(i-1)*.065,.1,.56],[.025,.03,.045]);
    }
    oval(head,'#3c8475',[-.15,.24,.29],[.09,.065,.025]);
    tail=joint(torso,[0,.99,-.18]);
    for (let i=0;i<6;i++) {
      const angle=i*Math.PI/3;
      const leaf=oval(tail,i%2?'#5f984e':'#79ad5b',[Math.sin(angle)*.18,.15,Math.cos(angle)*.2],[.25,.41,.2]);
      leaf.rotation.z=-Math.sin(angle)*.35;
    }
    cone(tail,'#74a854',[0,.48,0],.16,.32);
  }
  if (species === 'mew') {
    for (const sign of [-1,1]) cone(head,pink,[sign*.28,.3,-.04],.14,.33,-sign*.25);
    tail=joint(torso,[0,.43,-.24]);
    tube(tail,pink,[[0,0,0],[.65,.1,-.4],[.95,.8,-.2],[.62,1.2,.1]],.04);
    oval(tail,pink,[.62,1.2,.1],[.075,.11,.075]);
  }
  if (species === 'charizard') {
    oval(torso,'#f0d9a3',[0,.62,.24],[.29,.44,.1]);
    oval(head,orange,[0,-.1,.25],[.26,.18,.3]);
    for (const sign of [-1,1]) {
      cone(head,'#eacb91',[sign*.26,.34,-.12],.1,.37,-sign*.3);
      const wing=joint(torso,[sign*.29,1,-.15]);
      const shape=new THREE.Shape();
      shape.moveTo(0,0);shape.quadraticCurveTo(sign*.35,.65,sign*.9,1);
      shape.lineTo(sign*.95,.12);shape.quadraticCurveTo(sign*.6,.45,sign*.53,-.12);shape.quadraticCurveTo(sign*.2,.2,0,0);
      const membrane=new THREE.Mesh(new THREE.ShapeGeometry(shape),wingMaterial);
      wing.add(membrane);
      tube(wing,orange,[[0,0,0],[sign*.38,.7,0],[sign*.9,1,0],[sign*.95,.12,0]],.045);
      tube(wing,orange,[[sign*.38,.7,0],[sign*.53,-.12,0]],.025);
      wings.push(wing);
    }
    tail=joint(torso,[0,.35,-.25]);
    tube(tail,orange,[[0,0,0],[.2,-.1,-.45],[.65,.03,-.7],[.8,.25,-.65]],.12);
    const flame=joint(tail,[.8,.42,-.65]);
    oval(flame,'#f47335',[0,0,0],[.15,.25,.12]);
    oval(flame,'#ffce56',[0,-.03,.06],[.085,.17,.08]);
    ears.push(flame);
  }
  return {root,torso,head,legs,arms,ears,wings,tail,eyes,species};
}

export function startCreatures(container) {
  const renderer = new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0,0);
  renderer.domElement.className='creature-canvas';
  renderer.domElement.setAttribute('aria-label','可走动的立体伙伴');
  container.prepend(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,80);
  camera.position.set(0,8,14);
  camera.lookAt(0,1.9,0);
  scene.add(new THREE.HemisphereLight('#fff7dd','#688951',2.5));
  const sun=new THREE.DirectionalLight('#fff1d1',3);
  sun.position.set(-5,10,8);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-7});
  sun.shadow.normalBias=.035;
  scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:.18}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const models=[];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let buttons=[],signature='',last=0,elapsed=0,frame=0,closed=false;
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  const homes=[[-2.2,.9],[-3,3.1],[.8,3.2],[1.6,-.4],[3.1,.4]];
  function rebuild() {
    buttons=[...container.querySelectorAll('.robot')];
    const next=buttons.map(b=>b.dataset.role).join('|');
    if(next===signature)return;
    signature=next;
    for(const model of models) {
      scene.remove(model.root);
      model.root.traverse(object=>object.geometry?.dispose());
    }
    models.length=0;
    buttons.forEach((button,index)=>{
      const model=buildCreature(button.dataset.species);
      const home=homes[index%homes.length];
      Object.assign(model,{button,index,home:[...home],target:new THREE.Vector2(...home),wait:1+index*.7,attention:0,heading:0});
      model.root.position.set(home[0],model.species==='mew'?3.1:0,home[1]);
      model.root.scale.setScalar(model.species==='charizard'?.95:model.species==='bulbasaur'?.95:.85);
      scene.add(model.root);models.push(model);
      button.addEventListener('click',()=>{model.attention=4;});
    });
  }
  const observer=new MutationObserver(rebuild);
  observer.observe(container.querySelector('#robots'),{childList:true});
  rebuild();
  const resize=new ResizeObserver(()=>{
    const {width,height}=container.getBoundingClientRect();
    renderer.setSize(width,height,false);
    const ratio=width/height;
    camera.left=-5;camera.right=5;camera.top=5/ratio;camera.bottom=-5/ratio;
    camera.updateProjectionMatrix();
  });
  resize.observe(container);
  renderer.domElement.addEventListener('click',event=>{
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(models.map(m=>m.root),true);
    if(!hits.length)return;
    let object=hits[0].object;
    while(object.parent&&object.parent!==scene)object=object.parent;
    models.find(m=>m.root===object)?.button.click();
  });
  const anchor=new THREE.Vector3();
  function animate(now) {
    if(closed)return;
    frame=requestAnimationFrame(animate);
    const dt=Math.min((now-last)/1000,.045);last=now;
    if(document.hidden)return;
    elapsed+=dt;
    for(const model of models) {
      const {root,torso,head,legs,arms,ears,wings,tail,eyes,index,species,button}=model;
      const fly=species==='mew';
      const active=button.classList.contains('robot-working');
      model.attention=Math.max(0,model.attention-dt);
      const frozen=reduced.matches||model.attention>0;
      let walking=false;
      if(!frozen) {
        const dx=model.target.x-root.position.x,dz=model.target.y-root.position.z;
        const distance=Math.hypot(dx,dz);
        if(distance>.08) {
          const speed=fly?.4:active?.18:.32;
          const step=Math.min(distance,speed*dt);
          root.position.x+=dx/distance*step;root.position.z+=dz/distance*step;
          model.heading=Math.atan2(dx,dz);walking=true;
        } else {
          model.wait-=dt;
          if(model.wait<=0) {
            const angle=elapsed*.63+index*2.4;
            model.target.set(model.home[0]+Math.cos(angle)*.65,model.home[1]+Math.sin(angle)*.45);
            model.wait=active?4:2+index*.4;
          }
          model.heading=Math.sin(elapsed*.4+index)*.35;
        }
      } else model.heading=0;
      root.rotation.y+=Math.atan2(Math.sin(model.heading-root.rotation.y),Math.cos(model.heading-root.rotation.y))*Math.min(1,dt*3);
      const time=reduced.matches?0:elapsed;
      const stride=walking?Math.sin(time*8+index):0;
      root.position.y=fly?3.1+Math.sin(time*1.4+index)*.18:Math.abs(stride)*.035;
      torso.rotation.z=walking?stride*.035:Math.sin(time*1.2+index)*.018;
      head.rotation.y=walking?0:Math.sin(time*.9+index)*.18;
      head.rotation.x=active?Math.sin(time*2)*.1:0;
      legs.forEach((leg,i)=>{leg.rotation.x=stride*.5*(i%2?1:-1);});
      arms.forEach((arm,i)=>{
        arm.rotation.x=walking?-stride*.4*(i?1:-1):active?Math.sin(time*3+i)*.4:-.1;
        arm.rotation.z=model.attention>0&&!reduced.matches?(i?0:-1.9+Math.sin(time*7)*.25):0;
      });
      torso.rotation.x=fly?-.12+Math.sin(time*1.4)*.08:0;
      ears.forEach((ear,i)=>{ear.rotation.x=Math.sin(time*2+index+i)*.12;});
      wings.forEach((wing,i)=>{wing.rotation.y=Math.sin(time*(walking?3:1.4))*.35*(i?1:-1);});
      if(tail)tail.rotation.y=Math.sin(time*1.8+index)*.22;
      eyes.forEach(eye=>{eye.scale.y=(time+index*.9)%4.9<.13?.025:.16;});
      anchor.copy(root.position);anchor.y-=.06;anchor.project(camera);
      button.style.setProperty('--label-x',(anchor.x*.5+.5)*100+'%');
      button.style.setProperty('--label-y',(-anchor.y*.5+.5)*100+'%');
      button.dataset.motion=frozen?'观察':walking?(fly?'盘旋':'散步'):active?'工作':'休息';
    }
    renderer.render(scene,camera);
  }
  container.classList.add('has-3d');
  frame=requestAnimationFrame(animate);
  renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();closed=true;cancelAnimationFrame(frame);
    container.classList.remove('has-3d');
    document.querySelector('#scene-caption').textContent='立体场景中断，请刷新恢复；职位按钮仍可使用';
    resize.disconnect();observer.disconnect();
  });
  return {dispose(){closed=true;cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();renderer.dispose();renderer.domElement.remove();}};
}
