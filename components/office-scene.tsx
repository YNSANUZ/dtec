"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { MuralId } from "@/lib/mural-types";
import { getCelebrationState } from "@/lib/birthdays/celebration";
import { resolveRoomPositionState, type RoomPositionState } from "@/lib/room/position-state";
type Props = {
  name: string;
  avatar: string;
  action: "idle" | "dance" | "wave";
  message: string;
  created: boolean;
  initialPosition: { x: number; z: number };
  remoteUsers: Array<{userId:string;name:string;avatar:string;x:number;z:number;action:string;message:string;online:boolean;birthdayToday:boolean}>;
  birthdayToday: boolean;
  positionOwnerId: string;
  onStateChange: (x:number,z:number,action:string) => void;
  onCharacterClick: (userId:string|null) => void;
  onMuralClick: (id: MuralId) => void;
};
function card(text: string, bubble = false, online = false) {
  const c = document.createElement("canvas");
  c.width = bubble ? 700 : 512;
  c.height = bubble ? 180 : 128;
  const x = c.getContext("2d")!;
  x.fillStyle = bubble ? "white" : "#1b2945";
  x.roundRect(
    7,
    7,
    c.width - 14,
    c.height - (bubble ? 38 : 14),
    bubble ? 38 : 34,
  );
  x.fill();
  x.fillStyle = bubble ? "#17264a" : "white";
  x.font = `${bubble ? 600 : 700} ${bubble ? 42 : 45}px Arial`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, c.width / 2, bubble ? 78 : 64, c.width - 70);
  if (!bubble && online) {
    const labelWidth = Math.min(x.measureText(text).width, c.width - 70);
    x.fillStyle = "#25d366";
    x.beginPath();
    x.arc(Math.max(25, (c.width - labelWidth) / 2 - 22), 64, 9, 0, Math.PI * 2);
    x.fill();
  }
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthTest: false,
    }),
  );
  s.scale.set(bubble ? 4.5 : 2.6, bubble ? 1.15 : 0.65, 1);
  return s;
}
function birthdayBadge() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.shadowColor = "rgba(32, 45, 68, .25)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(128, 122, 104, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  for (const [x, y, color] of [[49, 82, "#f7c843"], [201, 68, "#ff8b3d"], [202, 154, "#9b5de5"], [57, 175, "#f45c93"]] as const) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 12, 22);
  }
  ctx.font = "132px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🎉", 128, 126);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(0.01, 0.01, 1);
  sprite.userData.popStartedAt = performance.now();
  return sprite;
}

function animateBirthdayBadge(sprite: THREE.Sprite, now: number) {
  const progress = Math.min(1, Math.max(0, (now - Number(sprite.userData.popStartedAt ?? now)) / 260));
  const scale = (progress < 0.65 ? progress / 0.65 * 1.12 : 1.12 - (progress - 0.65) / 0.35 * 0.12) * 1.08;
  sprite.scale.set(scale, scale, 1);
}

function canvasPlane(
  draw: (ctx: CanvasRenderingContext2D) => void,
  w: number,
  h: number,
) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
}
export default function OfficeScene({
  name,
  avatar,
  action,
  message,
  created,
  initialPosition,
  remoteUsers,
  birthdayToday,
  positionOwnerId,
  onStateChange,
  onCharacterClick,
  onMuralClick,
}: Props) {
  const assetBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const host = useRef<HTMLDivElement>(null),
    actionRef = useRef(action),
    messageRef = useRef(message),
    remoteRef = useRef(remoteUsers),
    stateCallbackRef = useRef(onStateChange),
    // Parent presence polls replace callback identities; those must not tear down the live world.
    characterClickRef = useRef(onCharacterClick),
    muralClickRef = useRef(onMuralClick),
    birthdaySessionStartRef = useRef<number | null>(null),
    birthdayTodayRef = useRef(birthdayToday),
    positionStateRef = useRef<RoomPositionState | null>(null),
    manualActionUntilRef = useRef(0),
    cameraControlsRef = useRef<{zoom:(direction:number)=>void;reframe:()=>void}>({zoom:()=>{},reframe:()=>{}});
  const [cameraAdjusted,setCameraAdjusted]=useState(false);
  useEffect(() => {
    if (actionRef.current !== action) manualActionUntilRef.current = performance.now() + 3_000;
    actionRef.current = action;
  }, [action]);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);
  useEffect(() => { remoteRef.current = remoteUsers; }, [remoteUsers]);
  useEffect(() => { stateCallbackRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { characterClickRef.current = onCharacterClick; }, [onCharacterClick]);
  useEffect(() => { muralClickRef.current = onMuralClick; }, [onMuralClick]);
  useEffect(() => { birthdayTodayRef.current = birthdayToday; }, [birthdayToday]);
  useEffect(() => {
    if (!host.current) return;
    if (birthdaySessionStartRef.current === null) birthdaySessionStartRef.current = performance.now();
    const savedPosition = resolveRoomPositionState(positionStateRef.current, positionOwnerId, initialPosition, created);
    const el = host.current,
      scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbcc7d3);
    const camera = new THREE.OrthographicCamera(-15, 15, 9, -9, 0.1, 100),
      cameraFocus = new THREE.Vector3(0, 0, 2),
      initialOrbit = new THREE.Spherical(),
      orbit = new THREE.Spherical();
    camera.position.set(18, 21, 22);
    camera.lookAt(cameraFocus);
    initialOrbit.setFromVector3(camera.position.clone().sub(cameraFocus));
    orbit.copy(initialOrbit);
    let cameraChanged = false;
    const updateCamera = () => {
      camera.position.copy(new THREE.Vector3().setFromSpherical(orbit).add(cameraFocus));
      camera.lookAt(cameraFocus);
    };
    const syncCameraButton = () => {
      const changed = camera.zoom !== 1 || Math.abs(orbit.theta - initialOrbit.theta) > 0.01 || Math.abs(orbit.phi - initialOrbit.phi) > 0.01;
      if (changed !== cameraChanged) {
        cameraChanged = changed;
        setCameraAdjusted(changed);
      }
    };
    const zoomCamera = (direction:number) => {
      const next=THREE.MathUtils.clamp(camera.zoom*(direction>0?1.12:1/1.12),0.55,2.8);
      if(next===camera.zoom)return;
      camera.zoom=next;
      camera.updateProjectionMatrix();
      syncCameraButton();
    };
    const reframeCamera = () => {
      orbit.copy(initialOrbit);
      camera.zoom=1;
      camera.updateProjectionMatrix();
      updateCamera();
      syncCameraButton();
    };
    cameraControlsRef.current={zoom:zoomCamera,reframe:reframeCamera};
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xfff8e8, 0x66758b, 2.7));
    const sun = new THREE.DirectionalLight(0xfff2d7, 4.8);
    sun.position.set(-10, 22, 15);
    sun.castShadow = true;
    scene.add(sun);
    const mat = (c: number) =>
        new THREE.MeshStandardMaterial({ color: c, roughness: 0.72 }),
      box = (
        w: number,
        h: number,
        d: number,
        c: number,
        x: number,
        y: number,
        z: number,
      ) => {
        const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
        o.position.set(x, y, z);
        o.castShadow = o.receiveShadow = true;
        scene.add(o);
        return o;
      },
      chairs: THREE.Mesh[] = [];
    box(28, 0.5, 19, 0xead7b8, 0, -0.25, 2);
    box(28, 4, 0.45, 0xf4efe6, 0, 2, -7.4);
    box(0.45, 4, 19, 0xf1ece5, -13.8, 2, 2);
    box(5, 1.2, 2.1, 0x8f9ba9, -9, 0.6, -3.8);
    box(1.2, 0.55, 1.2, 0xb9824d, -8, 0.28, -0.8);
    box(4.7, 0.08, 3.2, 0x315b8b, -9, 0.06, -1.3);
    [
      [0, 1.5],
      [0, 5.5],
      [-8, 7.5],
      [8, -3.7],
    ].forEach(([x, z]) => {
      box(6, 0.35, 1.8, 0xc68a46, x, 0.85, z);
      for (const sx of [-2, 0, 2]) {
        box(1.2, 0.75, 0.12, 0x263341, x + sx, 1.55, z);
        const ch = box(0.75, 0.72, 0.75, 0x30353c, x + sx, 0.36, z + 1.45);
        ch.userData.seat = { x: x + sx, z: z + 1.45 };
        chairs.push(ch);
      }
    });
    box(6, 0.38, 2.6, 0xb97c3d, 7, 0.85, -4);
    for (const x of [4.7, 6.2, 7.8, 9.3]) {
      const ch = box(0.8, 0.95, 0.8, 0x25344a, x, 0.45, -2.4);
      ch.userData.seat = { x, z: -2.4 };
      chairs.push(ch);
    }
    box(3.2, 2.2, 0.8, 0xa87540, 7, 1.1, 0);
    for (let i = 0; i < 11; i++) {
      const p = box(0.48, 0.42, 0.48, 0xe4ded3, -12 + i * 2.25, 0.22, -6.8),
        g = new THREE.Mesh(new THREE.SphereGeometry(0.48, 7, 6), mat(0x3f863a));
      g.scale.y = 1.4;
      g.position.set(p.position.x, 0.9, p.position.z);
      scene.add(g);
    }
    const muralBoards: THREE.Object3D[] = [];
    const muralSpecs: Array<{id:MuralId;title:string;rows:string[];color:number}> = [
      {id:"information",title:"INFORMAÇÕES",rows:["Comunicados","Recados","Lembretes","Vaquinhas"],color:0x48a07b},
      {id:"demands",title:"LEMBRETES",rows:["Equipamentos","Solicitações","Atividades","Acompanhamento"],color:0x3c73bd},
      {id:"leisure",title:"LAZER",rows:["Futebol","Paintball","Kart","Confraternizações"],color:0x4b9b72},
      {id:"birthdays",title:"ANIVERSARIANTES",rows:["Próximos aniversários","Datas especiais"],color:0x9b70ce},
    ];
    muralSpecs.forEach((spec,index)=>{
      const x=-3.2+index*4.85;
      const frame=box(4.58,2.85,0.18,0xb57a3d,x,2.35,-7.05);
      const panel=box(4.3,2.58,0.08,0xf3e4bd,x,2.35,-6.93);
      const mural=canvasPlane((ctx)=>{
        ctx.fillStyle="#f3e4bd";
        ctx.fillRect(0,0,1024,640);
        ctx.fillStyle="#153a6b";
        ctx.textAlign="center";
        ctx.font="900 54px Arial";
        ctx.fillText(spec.title,512,85,930);
        ctx.strokeStyle="#c69a57";
        ctx.lineWidth=5;
        ctx.beginPath();
        ctx.moveTo(55,112);
        ctx.lineTo(969,112);
        ctx.stroke();
        spec.rows.forEach((text,row)=>{
          const y=145+row*112;
          ctx.fillStyle=["#e7f3c3","#cde5ff","#d9f3d2","#ffd9bd"][row%4];
          ctx.roundRect(54,y,916,88,18);
          ctx.fill();
          ctx.fillStyle="#17335d";
          ctx.textAlign="left";
          ctx.font="800 42px Arial";
          ctx.fillText(text,88,y+57,790);
          ctx.fillStyle=`#${spec.color.toString(16).padStart(6,"0")}`;
          ctx.beginPath();
          ctx.arc(922,y+44,11,0,Math.PI*2);
          ctx.fill();
        });
      },4.25,2.52);
      mural.position.set(x,2.35,-6.82);
      frame.userData.muralIndex=index;
      panel.userData.muralIndex=index;
      mural.userData.muralIndex=index;
      scene.add(mural);
      muralBoards.push(frame,panel,mural);
    });
    const sector = canvasPlane(
      (ctx) => {
        ctx.clearRect(0, 0, 1024, 640);
        ctx.textAlign = "left";
        ctx.fillStyle = "#0b4b83";
        ctx.font = "900 220px Arial";
        ctx.fillText("DTEC", 52, 270);
        ctx.fillStyle = "#1d2e48";
        ctx.font = "700 52px Arial";
        ctx.fillText("Diretoria de Tecnologia", 58, 380);
        ctx.fillText("da Informação", 58, 448);
        ctx.fillStyle = "#20a685";
        ctx.fillRect(58, 490, 360, 16);
      },
      7.3,
      3.65,
    );
    sector.position.set(-9.8, 2.15, -7.14);
    scene.add(sector);
    type RemoteAgent = {
      object: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      clips: Map<string, THREE.AnimationClip>;
      action: THREE.AnimationAction | null;
      target: THREE.Vector3;
      bubble: THREE.Sprite | null;
      label: THREE.Sprite;
      online: boolean;
      message: string;
      birthdayBadge: THREE.Sprite | null;
      birthdayVisible: boolean;
    };
    const loader = new GLTFLoader(),
      mixers: THREE.AnimationMixer[] = [],
      remoteAgents = new Map<string,RemoteAgent>();
    let mine: THREE.Object3D | null = null,
      mineMixer: THREE.AnimationMixer | null = null,
      current: THREE.AnimationAction | null = null,
      bubble: THREE.Sprite | null = null,
      selfBirthdayBadge: THREE.Sprite | null = null,
      selfBirthdayVisible = false,
      shownMessage = "",
      auto = savedPosition.automatic,
      seating = savedPosition.sitting,
      autoPauseUntil = 0,
      clips = new Map<string, THREE.AnimationClip>();
    const target = new THREE.Vector3(savedPosition.targetX, 0, savedPosition.targetZ);
    const addSelf = (
      model: string,
      n: string,
      x: number,
      z: number,
      online: boolean,
    ) =>
      loader.load(`${assetBase}/models/kenney/character-${model}.glb`, (g) => {
        const o = clone(g.scene);
        o.scale.setScalar(0.85);
        o.position.set(x, 0, z);
        o.traverse((v) => {
          if ((v as THREE.Mesh).isMesh) (v as THREE.Mesh).castShadow = true;
        });
        const l = card(n, false, online);
        l.position.y = 2.65;
        o.add(l);
        scene.add(o);
        const mx = new THREE.AnimationMixer(o);
        mixers.push(mx);
        const map = new Map(g.animations.map((c) => [c.name.toLowerCase(), c]));
        mine = o;
        mineMixer = mx;
        clips = map;
      });
    addSelf(avatar, created ? name : "Visitante", savedPosition.x, savedPosition.z, created);
    const addRemote=(u:(typeof remoteRef.current)[number])=>loader.load(`${assetBase}/models/kenney/character-${u.avatar}.glb`,g=>{
      if(remoteAgents.has(u.userId))return;
      const o=clone(g.scene);o.scale.setScalar(.85);o.position.set(u.x,0,u.z);o.traverse(v=>{if((v as THREE.Mesh).isMesh)(v as THREE.Mesh).castShadow=true});
      const label=card(u.name,false,u.online);label.position.y=2.65;o.add(label);o.userData.roomUserId=u.userId;scene.add(o);
      const mixer=new THREE.AnimationMixer(o);mixers.push(mixer);remoteAgents.set(u.userId,{object:o,mixer,clips:new Map(g.animations.map(c=>[c.name.toLowerCase(),c])),action:null,target:new THREE.Vector3(u.x,0,u.z),bubble:null,label,online:u.online,message:"",birthdayBadge:null,birthdayVisible:false});
    });
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2(),
      floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit = new THREE.Vector3();
    const click = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -(((e.clientY - r.top) / r.height) * 2 - 1),
      );
      ray.setFromCamera(pointer, camera);
      if (mine && ray.intersectObject(mine, true).length) {
        auto = false;
        characterClickRef.current(null);
        return;
      }
      const remoteHit = ray.intersectObjects([...remoteAgents.values()].map((agent) => agent.object), true)[0];
      if (remoteHit) {
        let root: THREE.Object3D | null = remoteHit.object;
        while (root && typeof root.userData.roomUserId !== "string") root = root.parent;
        if (root) {
          characterClickRef.current(root.userData.roomUserId as string);
          return;
        }
      }
      if (!created) {
        const muralHit = ray.intersectObjects(muralBoards, false)[0];
        if (muralHit) {
          const muralIndex = Math.floor(muralHit.object.userData.muralIndex as number);
          const muralId: MuralId[] = ["information", "demands", "leisure", "birthdays"];
          muralClickRef.current(muralId[muralIndex]);
        }
        return;
      }
      const muralHit=ray.intersectObjects(muralBoards,false)[0];
      if (muralHit) {
        const muralIndex=Math.floor(muralHit.object.userData.muralIndex as number);
        const muralId: MuralId[]=["information","demands","leisure","birthdays"];
        muralClickRef.current(muralId[muralIndex]);
        return;
      }
      const seat = ray.intersectObjects(chairs, false)[0];
      if (seat) {
        auto = false;
        manualActionUntilRef.current = performance.now() + 3_000;
        seating = true;
        const p = seat.object.userData.seat;
        target.set(p.x, 0, p.z);
        return;
      }
      if (ray.ray.intersectPlane(floor, hit)) {
        auto = false;
        manualActionUntilRef.current = performance.now() + 3_000;
        seating = false;
        target.set(
          THREE.MathUtils.clamp(hit.x, -12.5, 12.5),
          0,
          THREE.MathUtils.clamp(hit.z, -6, 10),
        );
      }
    };
    const canvas=renderer.domElement;
    const pointers=new Map<number,{x:number;y:number}>();
    let gesture:{id:number;startX:number;startY:number;lastX:number;lastY:number;moved:boolean}|null=null;
    let lastPinchDistance=0;
    const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
    const onPointerDown=(e:PointerEvent)=>{
      if(e.pointerType==="mouse"&&e.button!==0)return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      canvas.setPointerCapture(e.pointerId);
      if(pointers.size===1)gesture={id:e.pointerId,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};
      else if(pointers.size===2&&gesture){
        gesture.moved=true;
        const pair=Array.from(pointers.values()) as [{x:number;y:number},{x:number;y:number}];
        lastPinchDistance=distance(pair[0],pair[1]);
      }
    };
    const onPointerMove=(e:PointerEvent)=>{
      if(!pointers.has(e.pointerId))return;
      pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size>=2){
        const pair=Array.from(pointers.values()).slice(0,2) as [{x:number;y:number},{x:number;y:number}];
        const nextDistance=distance(pair[0],pair[1]);
        if(lastPinchDistance>0&&nextDistance>0){
          const factor=nextDistance/lastPinchDistance;
          const next=THREE.MathUtils.clamp(camera.zoom*factor,0.55,2.8);
          if(next!==camera.zoom){camera.zoom=next;camera.updateProjectionMatrix();syncCameraButton();}
        }
        lastPinchDistance=nextDistance;
        if(gesture)gesture.moved=true;
        return;
      }
      if(!gesture||gesture.id!==e.pointerId)return;
      const totalDistance=Math.hypot(e.clientX-gesture.startX,e.clientY-gesture.startY);
      if(totalDistance>5){
        gesture.moved=true;
        el.classList.add("is-dragging");
      }
      if(gesture.moved){
        orbit.theta-= (e.clientX-gesture.lastX)*0.008;
        orbit.phi=THREE.MathUtils.clamp(orbit.phi+(e.clientY-gesture.lastY)*0.006,0.16,Math.PI-0.16);
        updateCamera();
        syncCameraButton();
      }
      gesture.lastX=e.clientX;
      gesture.lastY=e.clientY;
    };
    const onPointerUp=(e:PointerEvent)=>{
      const shouldClick=Boolean(gesture&&gesture.id===e.pointerId&&!gesture.moved&&pointers.size===1);
      const wasPinching=pointers.size>1;
      pointers.delete(e.pointerId);
      if(shouldClick)click(e);
      if(pointers.size===0){gesture=null;lastPinchDistance=0;el.classList.remove("is-dragging");}
      else if(wasPinching&&gesture){
        gesture.id=Array.from(pointers.keys())[0];
        const point=pointers.get(gesture.id)!;
        gesture.lastX=point.x;gesture.lastY=point.y;gesture.startX=point.x;gesture.startY=point.y;gesture.moved=true;lastPinchDistance=0;
      }
    };
    const onWheel=(e:WheelEvent)=>{
      e.preventDefault();
      zoomCamera(e.deltaY<0?1:-1);
    };
    canvas.addEventListener("pointerdown",onPointerDown);
    canvas.addEventListener("pointermove",onPointerMove);
    canvas.addEventListener("pointerup",onPointerUp);
    canvas.addEventListener("pointercancel",onPointerUp);
    canvas.addEventListener("wheel",onWheel,{passive:false});
    let mode = "",
      frameId = 0;
    const play = (key: string) => {
      if (mode === key || !mineMixer) return;
      current?.fadeOut(0.12);
      const clip = clips.get(key) || clips.get("idle");
      if (clip) {
        current = mineMixer.clipAction(clip);
        current.reset().fadeIn(0.12).play();
      }
      mode = key;
    };
    const playRemote=(a:RemoteAgent,key:string)=>{const clip=a.clips.get(key)||a.clips.get(key==="dance"?"emote-yes":"idle")||a.clips.get("idle");if(!clip)return;if(a.action?.getClip()===clip)return;a.action?.fadeOut(.15);a.action=a.mixer.clipAction(clip);a.action.reset().fadeIn(.15).play()};
    const clock = new THREE.Clock(),
      started=performance.now()/1000;
    let lastPresencePush=0,lastRemoteRefresh=0;
    const frame = () => {
        frameId = requestAnimationFrame(frame);
        const dt = Math.min(clock.getDelta(), 0.04),
          now = performance.now() / 1000;
        mixers.forEach((m) => m.update(dt));
        const sessionStart = birthdaySessionStartRef.current ?? performance.now();
        if(now-lastRemoteRefresh>1){lastRemoteRefresh=now;const ids=new Set(remoteRef.current.map(u=>u.userId));remoteAgents.forEach((a,id)=>{if(!ids.has(id)){scene.remove(a.object);remoteAgents.delete(id)}});remoteRef.current.forEach(u=>{const a=remoteAgents.get(u.userId);if(!a)addRemote(u);else{a.target.set(u.x,0,u.z);if(a.online!==u.online){a.object.remove(a.label);a.online=u.online;a.label=card(u.name,false,u.online);a.label.position.y=2.65;a.object.add(a.label)}if(u.message!==a.message){if(a.bubble)a.object.remove(a.bubble);a.message=u.message;a.bubble=u.message?card(u.message,true):null;if(a.bubble){a.bubble.position.y=3.65;a.object.add(a.bubble)}}}})}
        remoteAgents.forEach((a,id)=>{
          const d=a.target.clone().sub(a.object.position);
          const presence=remoteRef.current.find(u=>u.userId===id);
          const celebration=getCelebrationState(Boolean(presence?.birthdayToday),sessionStart,performance.now());
          if(celebration.visible!==a.birthdayVisible){
            a.birthdayVisible=celebration.visible;
            if(a.birthdayBadge){a.object.remove(a.birthdayBadge);a.birthdayBadge=null}
            if(celebration.visible){a.birthdayBadge=birthdayBadge();a.birthdayBadge.position.y=3.55;a.object.add(a.birthdayBadge)}
          }
          if(a.birthdayBadge)animateBirthdayBadge(a.birthdayBadge,performance.now());
          if(d.length()>.08){playRemote(a,"walk");d.normalize();a.object.position.addScaledVector(d,dt*2.4);a.object.rotation.y=Math.atan2(d.x,d.z)}
          else if(presence?.online&&presence.action==="dance")playRemote(a,"emote-yes");
          else if(presence?.online&&presence.action==="sit")playRemote(a,"sit");
          else if(celebration.dancing)playRemote(a,"emote-yes");
          else playRemote(a,"idle");
        });
        if (mine && mineMixer) {
          const ownCelebration = getCelebrationState(birthdayTodayRef.current, sessionStart, performance.now());
          if (ownCelebration.visible !== selfBirthdayVisible) {
            selfBirthdayVisible = ownCelebration.visible;
            if (selfBirthdayBadge) { mine.remove(selfBirthdayBadge); selfBirthdayBadge = null; }
            if (ownCelebration.visible) {
              selfBirthdayBadge = birthdayBadge();
              selfBirthdayBadge.position.y = 3.55;
              mine.add(selfBirthdayBadge);
            }
          }
          if (selfBirthdayBadge) animateBirthdayBadge(selfBirthdayBadge, performance.now());
          if (messageRef.current !== shownMessage) {
            if (bubble) mine.remove(bubble);
            shownMessage = messageRef.current;
            bubble = shownMessage ? card(shownMessage, true) : null;
            if (bubble) {
              bubble.position.y = 3.65;
              mine.add(bubble);
            }
          }
          if (actionRef.current === "dance") play("emote-yes");
          else if (actionRef.current === "wave") play("interact-right");
          else {
            const d = target.clone().sub(mine.position);
            if (auto && d.length() < 0.35 && now >= autoPauseUntil) {
              autoPauseUntil = now + 4 + Math.random() * 7;
              target.set(
                THREE.MathUtils.randFloat(-11, 11),
                0,
                THREE.MathUtils.randFloat(-5.5, 9),
              );
            }
            if (auto && now < autoPauseUntil) play("idle");
            else if (d.length() > 0.18) {
              play("walk");
              d.normalize();
              mine.position.addScaledVector(d, dt * (auto ? 0.72 : 2.4));
              mine.rotation.y = Math.atan2(d.x, d.z);
            } else if (ownCelebration.dancing && !seating && performance.now() >= manualActionUntilRef.current) play("emote-yes");
            else play(seating ? "sit" : "idle");
          }
          positionStateRef.current = {
            ownerId: positionOwnerId,
            x: mine.position.x,
            z: mine.position.z,
            targetX: target.x,
            targetZ: target.z,
            automatic: auto,
            sitting: seating,
          };
          if(created&&now-lastPresencePush>.9&&now-started>1){lastPresencePush=now;stateCallbackRef.current(mine.position.x,mine.position.z,actionRef.current==="dance"?"dance":mode||"idle")}
        }
        renderer.render(scene, camera);
      };
    frame();
    const resize = () => {
      const a = el.clientWidth / el.clientHeight,
        fr = 12;
      camera.left = -fr * a;
      camera.right = fr * a;
      camera.top = fr;
      camera.bottom = -fr;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown",onPointerDown);
      canvas.removeEventListener("pointermove",onPointerMove);
      canvas.removeEventListener("pointerup",onPointerUp);
      canvas.removeEventListener("pointercancel",onPointerUp);
      canvas.removeEventListener("wheel",onWheel);
      cameraControlsRef.current={zoom:()=>{},reframe:()=>{}};
      renderer.dispose();
      el.replaceChildren();
    };
  }, [assetBase, avatar, created, initialPosition, name, positionOwnerId]);
  return <><div ref={host} className="office-canvas"/><nav className="camera-controls" aria-label="Controles da câmera"><button type="button" aria-label="Aumentar zoom" onClick={()=>cameraControlsRef.current.zoom(1)}>+</button><button type="button" aria-label="Diminuir zoom" onClick={()=>cameraControlsRef.current.zoom(-1)}>−</button>{cameraAdjusted&&<button className="camera-reframe" type="button" aria-label="Reenquadrar cenário" onClick={()=>cameraControlsRef.current.reframe()}>Reenquadrar</button>}</nav></>;
}
