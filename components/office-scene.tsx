"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { MuralId } from "@/lib/mural-types";
import { getCharacterCelebrationState } from "@/lib/birthdays/celebration";
import { resolveRoomPositionState, type RoomPositionState } from "@/lib/room/position-state";
import { resolveRoomCameraState, type RoomCameraState } from "@/lib/room/camera-state";
import { WORKSTATIONS, PUFF_COLOR, danceLean, characterMotion, roomFrameHalfHeight } from "@/lib/room/scene-layout";
import { drawRoleBadge, type BadgeRole } from "@/lib/room/role-badge";
import type { ScenePanel } from "@/lib/rooms/board-types";
type Props = {
  environment?: "dtec" | "lobby";
  name: string;
  role?: BadgeRole;
  roomIdentity?: {title:string;description:string};
  avatar: string;
  action: "idle" | "dance" | "wave";
  message: string;
  created: boolean;
  initialPosition: { x: number; z: number };
  remoteUsers: Array<{userId:string;name:string;avatar:string;x:number;z:number;action:string;message:string;online:boolean;birthdayToday:boolean;role?:BadgeRole}>;
  birthdayToday: boolean;
  positionOwnerId: string;
  onStateChange: (x:number,z:number,action:string) => void;
  onCharacterClick: (userId:string|null) => void;
  onMuralClick: (id: MuralId) => void;
  panels?: ScenePanel[];
  onPanelClick?: (id:string) => void;
};
function card(text: string, bubble = false, online = false, role: BadgeRole = "member") {
  const c = document.createElement("canvas");
  c.width = bubble ? 700 : 512;
  c.height = bubble ? 180 : 128;
  const x = c.getContext("2d")!;
  x.fillStyle = bubble ? "white" : online ? "#15803d" : "#64748b";
  x.roundRect(
    7,
    7,
    c.width - 14,
    c.height - (bubble ? 38 : 14),
    bubble ? 38 : 34,
  );
  x.fill();
  if (!bubble) drawRoleBadge(x, role, 423, 18, 80);
  x.fillStyle = bubble ? "#17264a" : "white";
  x.font = `${bubble ? 600 : 700} ${bubble ? 42 : 45}px Arial`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, bubble ? c.width / 2 : 219, bubble ? 78 : 64, bubble ? c.width - 70 : 370);

  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthTest: false,
    }),
  );
  if (!bubble) s.userData.roleBadge = role;
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

function disposeBirthdayBadge(sprite: THREE.Sprite | null) {
  if (!sprite) return;
  sprite.removeFromParent();
  sprite.material.map?.dispose();
  sprite.material.dispose();
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
  environment = "dtec",
  name,
  role = "member",
  roomIdentity,
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
  panels,
  onPanelClick,
}: Props) {
  const assetBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const host = useRef<HTMLDivElement>(null),
    roleRef = useRef(role),
    identityRef = useRef(roomIdentity),
    updateIdentityRef = useRef<()=>void>(()=>{}),
    actionRef = useRef(action),
    messageRef = useRef(message),
    remoteRef = useRef(remoteUsers),
    stateCallbackRef = useRef(onStateChange),
    // Parent presence polls replace callback identities; those must not tear down the live world.
    characterClickRef = useRef(onCharacterClick),
    muralClickRef = useRef(onMuralClick),
    panelsRef = useRef(panels),
    panelClickRef = useRef(onPanelClick),
    updatePanelsRef = useRef<()=>void>(()=>{}),
    birthdayClocksRef = useRef({ ownerId: positionOwnerId, starts: new Map<string, number>() }),
    birthdayTodayRef = useRef(birthdayToday),
    positionStateRef = useRef<RoomPositionState | null>(null),
    cameraViewRef = useRef<RoomCameraState | null>(null),
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
  useEffect(() => { identityRef.current=roomIdentity;updateIdentityRef.current(); },[roomIdentity]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { remoteRef.current = remoteUsers; }, [remoteUsers]);
  useEffect(() => { stateCallbackRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { characterClickRef.current = onCharacterClick; }, [onCharacterClick]);
  useEffect(() => { muralClickRef.current = onMuralClick; }, [onMuralClick]);
  useEffect(() => { panelClickRef.current=onPanelClick; },[onPanelClick]);
  useEffect(() => { panelsRef.current=panels;updatePanelsRef.current(); },[panels]);
  useEffect(() => { birthdayTodayRef.current = birthdayToday; }, [birthdayToday]);
  useEffect(() => {
    if (!host.current) return;
    if (birthdayClocksRef.current.ownerId !== positionOwnerId) birthdayClocksRef.current = { ownerId: positionOwnerId, starts: new Map() };
    const birthdayStarts = birthdayClocksRef.current.starts;
    const savedPosition = resolveRoomPositionState(positionStateRef.current, positionOwnerId, initialPosition, created);
    // Record the restoration phase even while the GLTF is still loading.
    positionStateRef.current = savedPosition;
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
    const savedCamera = resolveRoomCameraState(cameraViewRef.current, { radius: initialOrbit.radius, phi: initialOrbit.phi, theta: initialOrbit.theta });
    orbit.set(savedCamera.radius, savedCamera.phi, savedCamera.theta);
    camera.zoom = savedCamera.zoom;
    camera.updateProjectionMatrix();
    camera.position.copy(new THREE.Vector3().setFromSpherical(orbit).add(cameraFocus));
    camera.lookAt(cameraFocus);
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
    syncCameraButton();
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
    // Real 1:1 geometry, not a camera illusion. Existing saved positions and
    // server movement bounds remain unchanged inside this larger platform.
    box(28, 0.5, 28, 0xead7b8, 0, -0.25, 2);
    box(28, 4, 0.45, 0xf4efe6, 0, 2, -11.9);
    box(0.45, 4, 28, 0xf1ece5, -13.8, 2, 2);
    // Lounge: cushions, arms, coffee table and an individual armchair.
    box(8, 0.08, 4, 0x243b60, -5.8, 0.05, -3.6);
    box(5.3, 0.65, 1.7, 0x9594af, -6.6, 0.38, -4.4);
    box(5.3, 1.1, 0.4, 0xb8b7cc, -6.6, 1, -5.15);
    for (const x of [-9.05, -4.15]) box(0.4, 0.9, 1.7, 0xb8b7cc, x, 0.8, -4.4);
    for (const x of [-8.2, -6.6, -5]) box(1.48, 0.22, 1.35, 0xcac9d9, x, 0.82, -4.3);
    box(1.8, 0.7, 1.7, 0xb8b7cc, -2.2, 0.4, -4.3);
    box(1.8, 1.1, 0.35, 0x9594af, -2.2, 1, -5);
    box(3.3, 0.2, 1.5, 0xe09b42, -6.1, 0.65, -2.5);
    for (const x of [-7.5, -4.7]) box(0.14, 0.55, 1.2, 0x25344a, x, 0.28, -2.5);
    // Exactly ten workstations and ten existing-style square puffs.
    for (const z of [1.5, 5.5]) {
      box(12.5, 0.08, 3.25, 0xd9d4c9, 1, 0.05, z + 0.55);
      box(12.5, 0.3, 1.6, 0xdb9547, 1, 0.95, z);
      for (const x of [-5, 7]) for (const dz of [-0.55, 0.55]) box(0.18, 0.8, 0.18, 0x553b28, x, 0.4, z + dz);
    }
    WORKSTATIONS.forEach(({ x, z }) => {
      box(1.2, 0.75, 0.12, 0x172638, x, 1.62, z);
      box(0.25, 0.22, 0.2, 0x172638, x, 1.17, z);
      box(0.75, 0.04, 0.3, 0xfaf9f4, x, 1.12, z + 0.4);
      box(0.45, 0.2, 0.45, 0xf2ecdf, x - 0.8, 1.22, z);
      box(0.3, 0.42, 0.3, 0x3a8f41, x - 0.8, 1.5, z);
      const puff = box(0.85, 0.72, 0.85, PUFF_COLOR, x, 0.36, z + 1.3);
      puff.userData.seat = { x, z: z + 1.3 };
      chairs.push(puff);
    });
    // Lightweight decorative areas: no extra real-time shadow lights.
    box(4.4, 0.08, 5.5, 0x243b60, -10.4, 0.05, 4.7);
    for (const [index, color] of [0xef34c8, 0x15cfea, 0x2877f5, 0xfad540].entries()) {
      const pad = box(1.45, 0.16, 1.45, color, -11.3 + index % 2 * 1.8, 0.16, 3.5 + Math.floor(index / 2) * 1.8);
      (pad.material as THREE.MeshStandardMaterial).emissive.setHex(color);
      (pad.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35;
    }
    box(4.2, 2.4, 0.18, 0x14233a, -13.45, 2, 4.5).rotation.y = Math.PI / 2;
    box(3.8, 0.08, 5.3, 0x243b60, 10.2, 0.05, 4.8);
    box(1.6, 0.25, 2.5, 0x263341, 10, 0.25, 3.3);
    for (const x of [9.4, 10.6]) box(0.14, 1.3, 0.14, 0x263341, x, 0.85, 2.25);
    box(1.7, 0.08, 0.25, 0x15cfea, 10, 1.5, 2.25);
    box(1.5, 0.1, 2.1, 0x2877f5, 10.3, 0.13, 6.3);
    for (let i = 0; i < 5; i++) {
      box(0.7, 0.22, 0.35, 0x263341, 9.5 + i % 2 * 1.1, 0.45, 7.7 + Math.floor(i / 2) * 0.4);
    }
    // One private 128px texture shared by all fixtures: a painted glow, not a light.
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 128;
    const glowContext = glowCanvas.getContext("2d")!;
    const glowGradient = glowContext.createRadialGradient(64, 64, 0, 64, 64, 64);
    glowGradient.addColorStop(0, "rgba(255,225,126,.7)");
    glowGradient.addColorStop(.45, "rgba(255,217,110,.28)");
    glowGradient.addColorStop(1, "rgba(255,217,110,0)");
    glowContext.fillStyle = glowGradient;
    glowContext.fillRect(0, 0, 128, 128);
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const glowMaterial = new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, depthWrite: false, toneMapped: false });
    const glowGeometry = new THREE.PlaneGeometry(2.4, 3);
    const glowAt = (x:number,z:number,left=false) => {
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.set(x, 2.5, z);
      if(left)glow.rotation.y=Math.PI/2;
      glow.userData.decorativeLedGlow=true;
      scene.add(glow);
    };
    for (const z of [-5.5, -1.5, 2.5, 6.5, 10.5]) {
      box(.2, .2, .25, 0x172638, -13.45, 3.8, z);
      glowAt(-13.54,z,true);
    }
    for (const x of [-12, -8, -4, 0, 4, 8, 12]) {
      box(0.25, 0.2, 0.2, 0x172638, x, 3.8, -11.6);
      const led = box(0.6, 0.05, 0.06, 0xffdc8b, x, 3.65, -11.6);
      (led.material as THREE.MeshStandardMaterial).emissive.setHex(0xffdc8b);
      (led.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
      glowAt(x,-11.65);
    }
    // Door and block-shaped indoor plants follow the reference, not a tree row.
    const plantAt = (x:number,z:number) => {
      box(.8,.7,.8,0xf8efe1,x,.35,z);
      box(.14,.65,.14,0x715133,x,.95,z);
      for (const [dx,dy,dz] of [[0,1.45,0],[-.27,1.2,0],[.27,1.2,0],[0,1.2,.27]]) {
        box(.55,.55,.55,0x248333,x+dx,dy,z+dz);
      }
    };
    for(const [x,z] of [[-12.2,-6.1],[-12.2,-.6],[12,-6.1],[12,10]])plantAt(x,z);
    const door = box(.16,3.15,1.85,0x172638,-13.45,1.57,.9);
    door.userData.decorativeDoor=true;
    box(.17,2.78,1.49,0x92d4e7,-13.34,1.57,.9);
    for (const z of [.08,1.72])box(.22,3.15,.12,0x172638,-13.23,1.57,z);
    box(.25,.12,.35,0xffbb36,-13.18,1.55,1.48);
    box(1.4,.05,2.1,0x243b60,-12.5,.05,.9);
    // A bright screen motif and two speakers; all remain ordinary static meshes.
    for(const z of [2.1,6.9]){
      box(.8,1.75,.8,0x172638,-12.7,.88,z);
      for(const y of [.5,1.2]){
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.23,.055,5,12),new THREE.MeshBasicMaterial({color:z<4?0xe936ce:0x15cfea}));
        ring.position.set(-12.24,y,z);ring.rotation.y=Math.PI/2;scene.add(ring);
      }
    }
    const gameScreen=canvasPlane(ctx=>{
      ctx.fillStyle="#081629";ctx.fillRect(0,0,1024,640);
      ctx.strokeStyle="#21dcf4";ctx.lineWidth=25;
      ctx.beginPath();ctx.arc(460,160,45,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(460,210);ctx.lineTo(450,375);ctx.lineTo(350,550);ctx.moveTo(450,375);ctx.lineTo(565,530);ctx.moveTo(455,240);ctx.lineTo(300,305);ctx.moveTo(455,240);ctx.lineTo(590,110);ctx.stroke();
      for(let i=0;i<6;i++)for(let j=0;j<=i%4+1;j++){ctx.fillStyle=["#ee39d3","#21dcf4","#fad540"][i%3];ctx.fillRect(680+i*40,540-j*60,28,45);}
      ctx.fillStyle="#f43ed1";ctx.font="bold 120px Arial";ctx.fillText("↑",100,140);ctx.fillText("↑",840,140);
    },3.6,2.1);
    gameScreen.rotation.y=Math.PI/2;gameScreen.position.set(-13.31,2,4.5);scene.add(gameScreen);
    // Visible treadmill belt, side rails and a simple rack of dumbbells.
    box(1.15,.05,2.1,0x0b1725,10,.4,3.3);
    box(1.45,.45,.12,0x172638,10,1.32,2.13);
    for(const x of [9.4,10.6])box(.12,.12,1.35,0x172638,x,1.05,2.8);
    box(2.1,.12,.6,0x172638,10.2,.65,8.05);
    for(const x of [9.35,10,10.65]){
      box(.6,.1,.1,0x9594af,x,.78,8.05);
      for(const dx of [-.24,.24])box(.14,.3,.3,0x172638,x+dx,.78,8.05);
    }
    const muralBoards: THREE.Object3D[] = [];
    const defaultMuralSpecs: Array<{id:MuralId;title:string;rows:string[];color:number}> = environment === "lobby" ? [] : [
      {id:"information",title:"INFORMAÇÕES",rows:["Comunicados","Recados","Lembretes","Vaquinhas"],color:0x48a07b},
      {id:"demands",title:"LEMBRETES",rows:["Equipamentos","Solicitações","Atividades","Acompanhamento"],color:0x3c73bd},
      {id:"leisure",title:"LAZER",rows:["Futebol","Paintball","Kart","Confraternizações"],color:0x4b9b72},
      {id:"birthdays",title:"ANIVERSARIANTES",rows:["Próximos aniversários","Datas especiais"],color:0x9b70ce},
    ];
    let panelSignature="";
    const rebuildPanels=()=>{
      const specs=panelsRef.current?.map(panel=>({...panel,color:0x3c73bd}))??defaultMuralSpecs;
      const signature=JSON.stringify(specs);
      if(signature===panelSignature)return;panelSignature=signature;
      muralBoards.splice(0).forEach(object=>{
        scene.remove(object);
        const mesh=object as THREE.Mesh;mesh.geometry.dispose();
        for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
          (material as THREE.MeshBasicMaterial).map?.dispose();material.dispose();
        }
      });
      const spacing=Math.min(4.85,18.5/Math.max(1,specs.length)),width=spacing-.25;
      specs.forEach((spec,index)=>{
      const x=4.3+(index-(specs.length-1)/2)*spacing;
      const frame=box(width,2.85,0.18,0xb57a3d,x,2.35,-11.55);
      const panel=box(width-.2,2.58,0.08,0xf3e4bd,x,2.35,-11.43);
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
      },width-.25,2.52);
      mural.position.set(x,2.35,-11.32);
      frame.userData.muralIndex=index;
      panel.userData.muralIndex=index;
      mural.userData.muralIndex=index;
      for(const object of [frame,panel,mural]){
        object.userData.panelId=spec.id;
        object.userData.customPanel=panelsRef.current!==undefined;
      }
      scene.add(mural);
      muralBoards.push(frame,panel,mural);
      });
    };
    updatePanelsRef.current=rebuildPanels;
    rebuildPanels();
    const drawSector = (ctx:CanvasRenderingContext2D) => {
      ctx.clearRect(0,0,1024,640);ctx.textAlign="left";ctx.fillStyle="#0b4b83";
      const title=identityRef.current?.title??(environment==="lobby"?"CUBOCHAT":"DTEC");
      ctx.font="900 150px Arial";ctx.fillText(title,52,250,920);
      ctx.fillStyle="#1d2e48";ctx.font="700 42px Arial";
      const description=identityRef.current?.description??(environment==="lobby"?"Encontre sua sala e seus amigos":"Diretoria de Tecnologia da Informação");
      // Fit the full 280-character description, including long unbroken words.
      const characters=Array.from(description);let line="",lines:string[]=[];
      for(const character of characters){
        if(character==="\n"||ctx.measureText(line+character).width>880){lines.push(line);line=character==="\n"?"":character;}
        else line+=character;
      }
      if(line)lines.push(line);
      if(lines.length>6){ctx.font="700 29px Arial";lines=[];line="";
        for(const character of characters){if(character==="\n"||ctx.measureText(line+character).width>880){lines.push(line);line=character==="\n"?"":character;}else line+=character;}if(line)lines.push(line);
      }
      lines.slice(0,8).forEach((text,index)=>ctx.fillText(text,58,320+index*34,880));
      ctx.fillStyle="#20a685";ctx.fillRect(58,606,360,12);
    };
    const sector=canvasPlane(drawSector,7.3,3.65);
    updateIdentityRef.current=()=>{
      const texture=(sector.material as THREE.MeshBasicMaterial).map!;
      drawSector((texture.image as HTMLCanvasElement).getContext("2d")!);texture.needsUpdate=true;
    };
    sector.position.set(-13.54, 2.15, -3.5);
    sector.rotation.y = Math.PI / 2;
    scene.add(sector);
    type RemoteAgent = {
      object: THREE.Object3D;
      model: THREE.Object3D;
      avatar: string;
      mixer: THREE.AnimationMixer;
      clips: Map<string, THREE.AnimationClip>;
      action: THREE.AnimationAction | null;
      target: THREE.Vector3;
      bubble: THREE.Sprite | null;
      label: THREE.Sprite;
      name: string;
      online: boolean;
      role: BadgeRole;
      message: string;
      birthdayBadge: THREE.Sprite | null;
      birthdayVisible: boolean;
    };
    const loader = new GLTFLoader(),
      mixers: THREE.AnimationMixer[] = [],
      remoteAgents = new Map<string,RemoteAgent>(),
      remoteLoads = new Map<string, { avatar: string }>();
    let alive = true,
      mine: THREE.Object3D | null = null,
      mineMixer: THREE.AnimationMixer | null = null,
      selfLabel: THREE.Sprite | null = null,
      selfRole: BadgeRole = created ? roleRef.current : "visitor",
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
        if (!alive) return;
        const o = clone(g.scene);
        o.scale.setScalar(0.85);
        o.position.set(x, 0, z);
        o.rotation.y = savedPosition.facing;
        o.traverse((v) => {
          if ((v as THREE.Mesh).isMesh) (v as THREE.Mesh).castShadow = true;
        });
        const l = card(n, false, online, selfRole);
        selfLabel = l;
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
    const stopRemoteMixer = (a: RemoteAgent) => {
      a.mixer.stopAllAction();
      a.mixer.uncacheRoot(a.model);
      const skeletons = new Set<THREE.Skeleton>();
      a.model.traverse(object => {
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((object as THREE.SkinnedMesh).skeleton);
      });
      // SkeletonUtils clones skeletons, unlike the shared geometry/materials.
      skeletons.forEach(skeleton => skeleton.dispose());
      const index = mixers.indexOf(a.mixer);
      if (index >= 0) mixers.splice(index, 1);
    };
    const loadRemote = (u: (typeof remoteRef.current)[number]) => {
      if (remoteLoads.get(u.userId)?.avatar === u.avatar) return;
      const request = { avatar: u.avatar };
      remoteLoads.set(u.userId, request);
      loader.load(`${assetBase}/models/kenney/character-${u.avatar}.glb`, g => {
        if (!alive || remoteLoads.get(u.userId) !== request) return;
        remoteLoads.delete(u.userId);
        const latest = remoteRef.current.find(user => user.userId === u.userId);
        if (!latest || latest.avatar !== request.avatar) return;
        const model = clone(g.scene);
        model.traverse(v => { if ((v as THREE.Mesh).isMesh) (v as THREE.Mesh).castShadow = true; });
        const mixer = new THREE.AnimationMixer(model);
        const clips = new Map(g.animations.map(c => [c.name.toLowerCase(), c]));
        const a = remoteAgents.get(u.userId);
        if (a) {
          // Keep the live transform and overlays in their persistent parent.
          stopRemoteMixer(a);
          a.object.remove(a.model);
          a.model = model;
          a.avatar = request.avatar;
          a.mixer = mixer;
          a.clips = clips;
          a.action = null;
          a.object.add(model);
        } else {
          const object = new THREE.Group();
          object.scale.setScalar(.85);
          object.position.set(latest.x, 0, latest.z);
          object.userData.roomUserId = latest.userId;
          const label = card(latest.name, false, latest.online, latest.role ?? "member");
          label.position.y = 2.65;
          object.add(model, label);
          scene.add(object);
          remoteAgents.set(latest.userId, {
            object, model, avatar: request.avatar, mixer, clips, action: null,
            target: new THREE.Vector3(latest.x, 0, latest.z), bubble: null, label,
            name: latest.name, online: latest.online, role: latest.role ?? "member", message: "", birthdayBadge: null, birthdayVisible: false,
          });
        }
        // Clones share GLTF geometry/materials; do not dispose those on swaps.
        mixers.push(mixer);
      }, undefined, () => {
        // Retain the visible model; a subsequent presence poll may retry.
        if (remoteLoads.get(u.userId) === request) remoteLoads.delete(u.userId);
      });
    };
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
          if(muralHit.object.userData.customPanel){panelClickRef.current?.(String(muralHit.object.userData.panelId));return;}
          const muralIndex = Math.floor(muralHit.object.userData.muralIndex as number);
          const muralId: MuralId[] = ["information", "demands", "leisure", "birthdays"];
          muralClickRef.current(muralId[muralIndex]);
        }
        return;
      }
      const muralHit=ray.intersectObjects(muralBoards,false)[0];
      if (muralHit) {
        if(muralHit.object.userData.customPanel){panelClickRef.current?.(String(muralHit.object.userData.panelId));return;}
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
        if (now - lastRemoteRefresh > 1) {
          lastRemoteRefresh = now;
          const ids = new Set(remoteRef.current.map(u => u.userId));
          remoteLoads.forEach((_request, id) => { if (!ids.has(id)) remoteLoads.delete(id); });
          remoteAgents.forEach((a, id) => {
            if (!ids.has(id)) { disposeBirthdayBadge(a.birthdayBadge); birthdayStarts.delete(`remote:${id}`); stopRemoteMixer(a); scene.remove(a.object); remoteAgents.delete(id); }
          });
          remoteRef.current.forEach(u => {
            const a = remoteAgents.get(u.userId);
            if (!a) loadRemote(u);
            else {
              a.target.set(u.x, 0, u.z);
              if (a.avatar !== u.avatar) loadRemote(u);
              else remoteLoads.delete(u.userId);
              // Refresh only the label, never the live world or avatar pose.
              if (a.online !== u.online || a.name !== u.name || a.role !== (u.role ?? "member")) {
                a.object.remove(a.label);
                a.label.material.map?.dispose();
                a.label.material.dispose();
                a.name = u.name;
                a.online = u.online;
                a.role = u.role ?? "member";
                a.label = card(u.name, false, u.online, a.role);
                a.label.position.y = 2.65;
                a.object.add(a.label);
              }
              if (u.message !== a.message) {
                if (a.bubble) a.object.remove(a.bubble);
                a.message = u.message;
                a.bubble = u.message ? card(u.message, true) : null;
                if (a.bubble) { a.bubble.position.y = 3.65; a.object.add(a.bubble); }
              }
            }
          });
        }
        remoteAgents.forEach((a,id)=>{
          const d=a.target.clone().sub(a.object.position);
          const presence=remoteRef.current.find(u=>u.userId===id);
          const celebration=getCharacterCelebrationState(birthdayStarts,`remote:${id}`,Boolean(presence?.birthdayToday),performance.now());
          if(celebration.visible!==a.birthdayVisible){
            a.birthdayVisible=celebration.visible;
            if(a.birthdayBadge){disposeBirthdayBadge(a.birthdayBadge);a.birthdayBadge=null}
            if(celebration.visible){a.birthdayBadge=birthdayBadge();a.birthdayBadge.position.y=3.55;a.object.add(a.birthdayBadge)}
          }
          if(a.birthdayBadge)animateBirthdayBadge(a.birthdayBadge,performance.now());
          const remoteDancing = Boolean(presence?.online && presence.action === "dance") || celebration.dancing;
          a.model.rotation.z = danceLean(remoteDancing, now);
          if(d.length()>.08){const distance=d.length();playRemote(a,characterMotion(true,remoteDancing,false).clip);d.normalize();a.object.position.addScaledVector(d,Math.min(distance,dt*2.4));a.object.rotation.y=Math.atan2(d.x,d.z)}
          else if(presence?.online&&presence.action==="dance")playRemote(a,"emote-yes");
          else if(presence?.online&&presence.action==="sit")playRemote(a,"sit");
          else if(celebration.dancing)playRemote(a,"emote-yes");
          else playRemote(a,"idle");
        });
        if (mine && mineMixer) {
          const nextRole = created ? roleRef.current : "visitor";
          if (selfLabel && selfRole !== nextRole) {
            selfLabel.removeFromParent(); selfLabel.material.map?.dispose(); selfLabel.material.dispose();
            selfRole = nextRole; selfLabel = card(created ? name : "Visitante", false, created, selfRole);
            selfLabel.position.y = 2.65; mine.add(selfLabel);
          }
          const ownCelebration = getCharacterCelebrationState(birthdayStarts, "self", birthdayTodayRef.current, performance.now());
          if (ownCelebration.visible !== selfBirthdayVisible) {
            selfBirthdayVisible = ownCelebration.visible;
            if (selfBirthdayBadge) { disposeBirthdayBadge(selfBirthdayBadge); selfBirthdayBadge = null; }
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
          mine.rotation.z = danceLean(actionRef.current === "dance" || ownCelebration.dancing, now);
          if (actionRef.current === "dance") {
            play("emote-yes");
            const d = target.clone().sub(mine.position);
            if (d.length() > 0.18 && !auto) {
              const distance = d.length();
              d.normalize();
              mine.position.addScaledVector(d, Math.min(distance, dt * 2.4));
              mine.rotation.y = Math.atan2(d.x, d.z);
            }
          }
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
              play(ownCelebration.dancing && !seating && performance.now() >= manualActionUntilRef.current ? "emote-yes" : "walk");
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
            facing: mine.rotation.y,
            automatic: auto,
            sitting: seating,
            interactive: created,
          };
          if(created&&now-lastPresencePush>.9&&now-started>1){lastPresencePush=now;stateCallbackRef.current(mine.position.x,mine.position.z,actionRef.current==="dance"?"dance":mode||"idle")}
        }
        renderer.render(scene, camera);
      };
    frame();
    const resize = () => {
      const a = el.clientWidth / el.clientHeight,
        fr = roomFrameHalfHeight(a);
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
      alive = false;
      updatePanelsRef.current=()=>{};
      updateIdentityRef.current=()=>{};
      remoteLoads.clear();
      disposeBirthdayBadge(selfBirthdayBadge);
      remoteAgents.forEach(agent => disposeBirthdayBadge(agent.birthdayBadge));
      cameraViewRef.current = { radius: orbit.radius, phi: orbit.phi, theta: orbit.theta, zoom: camera.zoom };
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown",onPointerDown);
      canvas.removeEventListener("pointermove",onPointerMove);
      canvas.removeEventListener("pointerup",onPointerUp);
      canvas.removeEventListener("pointercancel",onPointerUp);
      canvas.removeEventListener("wheel",onWheel);
      cameraControlsRef.current={zoom:()=>{},reframe:()=>{}};
      glowTexture.dispose();
      glowMaterial.dispose();
      glowGeometry.dispose();
      renderer.dispose();
      el.replaceChildren();
    };
  }, [assetBase, avatar, created, environment, initialPosition, name, positionOwnerId]);
  return <><div ref={host} className="office-canvas"/><nav className="camera-controls" aria-label="Controles da câmera"><button type="button" aria-label="Aumentar zoom" onClick={()=>cameraControlsRef.current.zoom(1)}>+</button><button type="button" aria-label="Diminuir zoom" onClick={()=>cameraControlsRef.current.zoom(-1)}>−</button>{cameraAdjusted&&<button className="camera-reframe" type="button" aria-label="Reenquadrar cenário" onClick={()=>cameraControlsRef.current.reframe()}>Reenquadrar</button>}</nav></>;
}
