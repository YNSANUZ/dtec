"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
type Props = {
  name: string;
  avatar: string;
  action: "idle" | "dance" | "wave";
  message: string;
  created: boolean;
  remoteUsers: Array<{userId:string;name:string;avatar:string;x:number;z:number;action:string;message:string;lastSeen:number}>;
  onStateChange: (x:number,z:number,action:string) => void;
  onAvatarClick: () => void;
  onBirthdayClick: () => void;
};
const people = [
  { n: "Helio", m: "a", x: -6, z: 2 },
  { n: "Herbert", m: "c", x: -1, z: -1 },
  { n: "Edvar", m: "f", x: 4, z: 0 },
  { n: "Otoniel", m: "j", x: -6, z: 7 },
  { n: "Tiago Salomão", m: "n", x: 2, z: 7 },
  { n: "Gabriel", m: "r", x: 8, z: 7 },
  { n: "Bruno", m: "a", x: 8, z: 2 },
];
function card(text: string, bubble = false) {
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
  remoteUsers,
  onStateChange,
  onAvatarClick,
  onBirthdayClick,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    actionRef = useRef(action),
    messageRef = useRef(message),
    remoteRef = useRef(remoteUsers),
    stateCallbackRef = useRef(onStateChange);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);
  useEffect(() => {
    messageRef.current = message;
  }, [message]);
  useEffect(() => { remoteRef.current = remoteUsers; }, [remoteUsers]);
  useEffect(() => { stateCallbackRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current,
      scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbcc7d3);
    const camera = new THREE.OrthographicCamera(-15, 15, 9, -9, 0.1, 100);
    camera.position.set(18, 21, 22);
    camera.lookAt(0, 0, 2);
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
    const board = box(5.8, 3.05, 0.18, 0xb57a3d, 2.2, 2.35, -7.05),
      panel = box(5.35, 2.62, 0.08, 0xf3e4bd, 2.2, 2.35, -6.93);
    const mural = canvasPlane(
      (ctx) => {
        ctx.fillStyle = "#f3e4bd";
        ctx.fillRect(0, 0, 1024, 640);
        ctx.fillStyle = "#153a6b";
        ctx.font = "900 56px Arial";
        ctx.fillText("MURAL DE INFORMAÇÕES", 65, 92);
        ctx.strokeStyle = "#c69a57";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(64, 118);
        ctx.lineTo(960, 118);
        ctx.stroke();
        const rows = [
          ["TAXA GOOGLE", "#e7f3c3"],
          ["PAINTBALL", "#cde5ff"],
          ["FUTEBOL", "#d9f3d2"],
          ["KART", "#ffd9bd"],
        ];
        rows.forEach(([text, color], i) => {
          const y = 150 + i * 112;
          ctx.fillStyle = color;
          ctx.roundRect(72, y, 880, 88, 18);
          ctx.fill();
          ctx.fillStyle = "#17335d";
          ctx.font = "800 48px Arial";
          ctx.fillText(String(text), 125, y + 59);
          ctx.fillStyle = i % 2 ? "#f1a51d" : "#dd5b54";
          ctx.beginPath();
          ctx.arc(900, y + 43, 10, 0, Math.PI * 2);
          ctx.fill();
        });
      },
      5.15,
      2.48,
    );
    mural.position.set(2.2, 2.35, -6.82);
    scene.add(mural);
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
    type Agent = {
      object: THREE.Object3D;
      mixer: THREE.AnimationMixer;
      clips: Map<string, THREE.AnimationClip>;
      action: THREE.AnimationAction | null;
      mode: "walk" | "idle" | "sit";
      target: THREE.Vector3;
      nextAt: number;
      seat?: THREE.Mesh;
    };
    type RemoteAgent = {object:THREE.Object3D;mixer:THREE.AnimationMixer;clips:Map<string,THREE.AnimationClip>;action:THREE.AnimationAction|null;target:THREE.Vector3;bubble:THREE.Sprite|null;message:string};
    const loader = new GLTFLoader(),
      mixers: THREE.AnimationMixer[] = [],
      agents: Agent[] = [],
      remoteAgents = new Map<string,RemoteAgent>();
    let mine: THREE.Object3D | null = null,
      mineMixer: THREE.AnimationMixer | null = null,
      current: THREE.AnimationAction | null = null,
      bubble: THREE.Sprite | null = null,
      shownMessage = "",
      auto = true,
      seating = false,
      autoPauseUntil = 0,
      target = new THREE.Vector3(0, 0, 5),
      clips = new Map<string, THREE.AnimationClip>();
    const add = (
      model: string,
      n: string,
      x: number,
      z: number,
      self = false,
    ) =>
      loader.load(`/models/kenney/character-${model}.glb`, (g) => {
        const o = clone(g.scene);
        o.scale.setScalar(0.85);
        o.position.set(x, 0, z);
        o.traverse((v) => {
          if ((v as THREE.Mesh).isMesh) (v as THREE.Mesh).castShadow = true;
        });
        const l = card(n);
        l.position.y = 2.65;
        o.add(l);
        scene.add(o);
        const mx = new THREE.AnimationMixer(o);
        mixers.push(mx);
        const map = new Map(g.animations.map((c) => [c.name.toLowerCase(), c]));
        if (self) {
          mine = o;
          mineMixer = mx;
          clips = map;
        } else
          agents.push({
            object: o,
            mixer: mx,
            clips: map,
            action: null,
            mode: "idle",
            target: o.position.clone(),
            nextAt: performance.now() / 1000 + 2 + Math.random() * 7,
          });
      });
    people.forEach((p) => add(p.m, p.n, p.x, p.z));
    add(avatar, created ? name : "Você", 0, 5, true);
    const addRemote=(u:(typeof remoteRef.current)[number])=>loader.load(`/models/kenney/character-${u.avatar}.glb`,g=>{
      if(remoteAgents.has(u.userId))return;
      const o=clone(g.scene);o.scale.setScalar(.85);o.position.set(u.x,0,u.z);o.traverse(v=>{if((v as THREE.Mesh).isMesh)(v as THREE.Mesh).castShadow=true});
      const label=card(u.name);label.position.y=2.65;o.add(label);scene.add(o);
      const mixer=new THREE.AnimationMixer(o);mixers.push(mixer);remoteAgents.set(u.userId,{object:o,mixer,clips:new Map(g.animations.map(c=>[c.name.toLowerCase(),c])),action:null,target:new THREE.Vector3(u.x,0,u.z),bubble:null,message:""});
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
        onAvatarClick();
        return;
      }
      if (ray.intersectObjects([board, panel], false).length) {
        onBirthdayClick();
        return;
      }
      const seat = ray.intersectObjects(chairs, false)[0];
      if (seat) {
        auto = false;
        seating = true;
        const p = seat.object.userData.seat;
        target.set(p.x, 0, p.z);
        return;
      }
      if (ray.ray.intersectPlane(floor, hit)) {
        auto = false;
        seating = false;
        target.set(
          THREE.MathUtils.clamp(hit.x, -12.5, 12.5),
          0,
          THREE.MathUtils.clamp(hit.z, -6, 10),
        );
      }
    };
    renderer.domElement.addEventListener("pointerup", click);
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
    const playAgent = (a: Agent, key: string) => {
      const clip = a.clips.get(key) || a.clips.get("idle");
      if (!clip) return;
      a.action?.fadeOut(0.18);
      a.action = a.mixer.clipAction(clip);
      a.action.reset().fadeIn(0.18).play();
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
        agents.forEach((a) => {
          if (a.mode === "walk") {
            const d = a.target.clone().sub(a.object.position);
            if (d.length() > 0.18) {
              d.normalize();
              a.object.position.addScaledVector(d, dt * 0.72);
              a.object.rotation.y = Math.atan2(d.x, d.z);
            } else {
              a.mode = a.seat ? "sit" : "idle";
              playAgent(a, a.mode);
              a.nextAt =
                now +
                (a.mode === "sit"
                  ? 12 + Math.random() * 16
                  : 5 + Math.random() * 9);
            }
          } else if (now >= a.nextAt) {
            if (a.mode === "sit") a.seat = undefined;
            const chooseSeat = Math.random() < 0.3;
            if (chooseSeat) {
              const seat = chairs[Math.floor(Math.random() * chairs.length)];
              a.seat = seat;
              const p = seat.userData.seat;
              a.target.set(p.x, 0, p.z);
            } else
              a.target.set(
                THREE.MathUtils.randFloat(-11, 11),
                0,
                THREE.MathUtils.randFloat(-5.5, 9),
              );
            a.mode = "walk";
            playAgent(a, "walk");
          }
        });
        if(now-lastRemoteRefresh>1){lastRemoteRefresh=now;const ids=new Set(remoteRef.current.map(u=>u.userId));remoteAgents.forEach((a,id)=>{if(!ids.has(id)){scene.remove(a.object);remoteAgents.delete(id)}});remoteRef.current.forEach(u=>{const a=remoteAgents.get(u.userId);if(!a)addRemote(u);else{a.target.set(u.x,0,u.z);if(u.message!==a.message){if(a.bubble)a.object.remove(a.bubble);a.message=u.message;a.bubble=u.message?card(u.message,true):null;if(a.bubble){a.bubble.position.y=3.65;a.object.add(a.bubble)}}}})}
        remoteAgents.forEach(a=>{const d=a.target.clone().sub(a.object.position);if(d.length()>.08){playRemote(a,"walk");d.normalize();a.object.position.addScaledVector(d,dt*2.4);a.object.rotation.y=Math.atan2(d.x,d.z)}else playRemote(a,"idle")});
        if (mine && mineMixer) {
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
            } else play(seating ? "sit" : "idle");
          }
          if(now-lastPresencePush>.9&&now-started>1){lastPresencePush=now;stateCallbackRef.current(mine.position.x,mine.position.z,actionRef.current==="dance"?"dance":mode||"idle")}
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
      renderer.domElement.removeEventListener("pointerup", click);
      renderer.dispose();
      el.replaceChildren();
    };
  }, [avatar, created, name, onAvatarClick, onBirthdayClick]);
  return <div ref={host} className="office-canvas" />;
}
