"use client";

import { useEffect, useRef, useState } from "react";
import { title, type Piece } from "@/lib/writing";
import type * as Three from "three";

type Props = {
  pieces: Piece[];
  initialIndex: number;
  reducedMotion: boolean;
  disabled?: boolean;
  discardingId?: string | null;
  onDragStart: (index: number, x: number, y: number) => void;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (cancelled?: boolean) => void;
  onFocus: (index: number) => void;
  onPreview: (index: number, instant?: boolean, fromDrag?: boolean) => void;
};

/** Upright files in a wooden drawer. Render only while something is moving. */
export function ArchiveDrawerScene({
  pieces,
  initialIndex,
  reducedMotion,
  disabled = false,
  discardingId,
  onFocus,
  onPreview,
  onDragStart,
  onDragMove,
  onDragEnd,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<Map<number, HTMLButtonElement>>(new Map());
  const callbacks = useRef({
    onFocus,
    onPreview,
    onDragStart,
    onDragMove,
    onDragEnd,
  });
  callbacks.current = {
    onFocus,
    onPreview,
    onDragStart,
    onDragMove,
    onDragEnd,
  };
  const discarding = useRef(discardingId);
  discarding.current = discardingId;
  const contents = useRef(pieces);
  contents.current = pieces;
  const start = useRef(initialIndex);
  start.current = initialIndex;
  const controls = useRef<{
    move: (delta: number, instant?: boolean) => void;
    choose: (index: number, instant?: boolean) => void;
    edge: (last: boolean, instant?: boolean) => void;
    collapse: (instant?: boolean) => void;
    sync: (index: number) => void;
  } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const signature = pieces.map((piece) => piece.id).join(",");
  useEffect(() => {
    controls.current?.sync(initialIndex);
  }, [initialIndex]);
  useEffect(() => {
    if (disabled) controls.current?.collapse(true);
  }, [disabled]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let alive = true;
    let dispose = () => {};
    void Promise.all([import("three"), document.fonts.ready]).then(([T]) => {
      if (!alive) return;
      let renderer: Three.WebGLRenderer;
      try {
        renderer = new T.WebGLRenderer({
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        });
      } catch {
        setFailed(true);
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFShadowMap;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.domElement.setAttribute("aria-hidden", "true");
      element.prepend(renderer.domElement);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(35, 1, 0.1, 80);
      const raycaster = new T.Raycaster();
      const pointer = new T.Vector2();
      const resources: Array<{ dispose: () => void }> = [];
      const own = <V extends { dispose: () => void }>(value: V): V => {
        resources.push(value);
        return value;
      };
      const manager = new T.LoadingManager();
      const texturesReady = new Promise<void>((resolve) => {
        manager.onLoad = () => resolve();
      });
      const loader = new T.TextureLoader(manager);
      let revealFrame = 0;
      let frame = 0;
      let position = Math.max(
        0,
        Math.min(start.current, contents.current.length - 1),
      );
      let target = position;
      let focused = Math.round(position);
      let navigation: { from: number; start: number } | null = null;
      let returnStart = 0;
      let pull: { index: number; amount: number; started: number } | null =
        null;
      let wheelTimer: ReturnType<typeof setTimeout> | undefined;
      let hovered: number | null = null;
      let dragged: number | null = null;
      let lastFrame = performance.now();
      let holdTimer: ReturnType<typeof setTimeout> | undefined;
      // The existing --archive-ease curve: cubic-bezier(.16, 1, .3, 1).
      const ease = (progress: number) => {
        if (progress >= 1) return 1;
        let t = progress;
        for (let step = 0; step < 6; step++) {
          const x =
            3 * 0.16 * (1 - t) ** 2 * t + 3 * 0.3 * (1 - t) * t ** 2 + t ** 3;
          const slope =
            3 * 0.16 * (1 - t) ** 2 +
            6 * (0.3 - 0.16) * (1 - t) * t +
            3 * (1 - 0.3) * t ** 2;
          t = Math.max(0, Math.min(1, t - (x - progress) / slope));
        }
        return 1 - (1 - t) ** 3;
      };
      const request = () => {
        if (alive && !frame) frame = requestAnimationFrame(draw);
      };
      const renderNow = () => {
        if (!alive) return;
        cancelAnimationFrame(frame);
        frame = 0;
        draw(performance.now());
      };
      const texture = (path: string, repeatX: number, repeatY: number) => {
        const result = own(loader.load(path, renderNow));
        result.colorSpace = T.SRGBColorSpace;
        result.wrapS = result.wrapT = T.RepeatWrapping;
        result.repeat.set(repeatX, repeatY);
        result.anisotropy = Math.min(
          4,
          renderer.capabilities.getMaxAnisotropy(),
        );
        return result;
      };
      const wood = texture("/textures/walnut.png", 1, 2);
      const grain = texture("/textures/paper-white.png", 3, 2);
      const paperGrain = texture("/textures/paper-bond.png", 2, 1);
      const woodMaterial = own(
        new T.MeshStandardMaterial({
          color: "#e8d8ba",
          emissive: "#382216",
          emissiveIntensity: 0.3,
          map: wood,
          roughness: 0.58,
          metalness: 0.06,
        }),
      );
      const darkWood = own(
        new T.MeshStandardMaterial({
          color: "#80694e",
          map: wood,
          roughness: 0.7,
        }),
      );
      const brass = own(
        new T.MeshStandardMaterial({
          color: "#a8864e",
          metalness: 0.72,
          roughness: 0.38,
        }),
      );
      const folderMaterials = ["#2d5560", "#30505a", "#365c64", "#2d4952"].map(
        (color) =>
          own(
            new T.MeshStandardMaterial({
              color,
              map: grain,
              roughness: 0.93,
              side: T.DoubleSide,
            }),
          ),
      );
      const paperMaterial = own(
        new T.MeshStandardMaterial({
          color: "#eee3ca",
          map: paperGrain,
          roughness: 1,
          side: T.DoubleSide,
        }),
      );
      const box = (
        w: number,
        h: number,
        d: number,
        material: Three.Material,
        x: number,
        y: number,
        z: number,
        parent: Three.Object3D = scene,
      ) => {
        const mesh = new T.Mesh(own(new T.BoxGeometry(w, h, d)), material);
        mesh.position.set(x, y, z);
        mesh.castShadow = mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      };
      // Raised rails, an inset base and a low front lip let the files occlude one another naturally.
      box(6.8, 0.22, 12.8, darkWood, 0, -0.12, -3.6);
      box(0.29, 1.5, 12.8, woodMaterial, -3.4, 0.57, -3.6);
      box(0.29, 1.5, 12.8, woodMaterial, 3.4, 0.57, -3.6);
      box(7.08, 0.88, 0.3, woodMaterial, 0, 0.32, 2.8);
      box(7.08, 1.4, 0.25, woodMaterial, 0, 0.58, -10);
      box(0.1, 0.07, 12.5, brass, -3.19, 1.31, -3.55);
      box(0.1, 0.07, 12.5, brass, 3.19, 1.31, -3.55);
      box(1.82, 0.39, 0.045, brass, 0, 0.33, 2.98);
      box(1.64, 0.27, 0.05, darkWood, 0, 0.33, 3.01);
      const plaque = document.createElement("canvas");
      plaque.width = 512;
      plaque.height = 96;
      const inscription = plaque.getContext("2d")!;
      inscription.fillStyle = "#37291d";
      inscription.fillRect(0, 0, 512, 96);
      inscription.fillStyle = "#deceb0";
      inscription.textAlign = "center";
      inscription.font = "38px Georgia, serif";
      inscription.fillText("A R C H I V E", 256, 61);
      const plaqueMap = own(new T.CanvasTexture(plaque));
      plaqueMap.colorSpace = T.SRGBColorSpace;
      const plaqueFace = new T.Mesh(
        own(new T.PlaneGeometry(1.6, 0.255)),
        own(new T.MeshStandardMaterial({ map: plaqueMap, roughness: 0.5 })),
      );
      plaqueFace.position.set(0, 0.33, 3.043);
      scene.add(plaqueFace);
      const screwGeometry = own(new T.CylinderGeometry(0.026, 0.026, 0.02, 8));
      for (const x of [-0.87, 0.87])
        for (const y of [0.19, 0.47]) {
          const screw = new T.Mesh(screwGeometry, brass);
          screw.rotation.x = Math.PI / 2;
          screw.position.set(x, y, 3.011);
          scene.add(screw);
        }

      const makeWriting = (piece: Piece, label: boolean) => {
        const canvas = document.createElement("canvas");
        canvas.width = label ? 1024 : 768;
        canvas.height = label ? 192 : 480;
        const context = canvas.getContext("2d")!;
        context.fillStyle = label ? "#e3cba4" : "#eee4ce";
        context.fillRect(0, 0, canvas.width, canvas.height);
        // Deterministic fibers; no raster generator or per-frame texture upload.
        for (let i = 0; i < 2300; i++) {
          const x = (i * 97) % canvas.width,
            y = (i * 131) % canvas.height;
          context.fillStyle = i % 2 ? "#6e4f2420" : "#ffffff35";
          context.fillRect(x, y, 2, 1);
        }
        context.fillStyle = "#362c21";
        context.font = label
          ? "66px Courier Prime, monospace"
          : "bold 32px Courier Prime, monospace";
        const name = title(piece);
        context.fillText(
          name.length > 36 ? name.slice(0, 35) + "…" : name,
          label ? 42 : 60,
          label ? 78 : 95,
          label ? 938 : 648,
        );
        context.font = label
          ? "27px Georgia, serif"
          : "22px Courier Prime, monospace";
        context.fillStyle = "#695642";
        context.fillText(
          new Date(piece.torn || piece.created).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          label ? 44 : 60,
          label ? 137 : 137,
        );
        if (!label) {
          context.fillStyle = "#453a2c";
          const words = piece.document.marks
            .map((mark) => (mark.kind === "seam" ? "\n" : mark.text))
            .join("")
            .split(/\s+/);
          let line = "",
            y = 210;
          for (const word of words) {
            if (context.measureText(line + word).width > 645) {
              context.fillText(line, 60, y);
              y += 38;
              line = "";
              if (y > 850) break;
            }
            line += word + " ";
          }
          context.fillText(line, 60, y);
        }
        const map = new T.CanvasTexture(canvas);
        map.colorSpace = T.SRGBColorSpace;
        return map;
      };
      type FileModel = {
        group: Three.Group;
        cover: Three.Mesh;
        paper: Three.Group;
        tab: Three.Mesh;
        amount: number;
        from: number;
        hover: number;
        velocity: number;
        owned: Array<{ dispose: () => void }>;
      };
      const files = new Map<number, FileModel>();
      const createFile = (index: number) => {
        const group = new T.Group();
        scene.add(group);
        const owned: Array<{ dispose: () => void }> = [];
        const fileOwn = <V extends { dispose: () => void }>(value: V): V => {
          owned.push(value);
          return value;
        };
        const card = folderMaterials[index % folderMaterials.length];
        const back = new T.Mesh(
          fileOwn(new T.BoxGeometry(5.97, 2.5, 0.025)),
          card,
        );
        back.position.set(0, 1.38, -0.11);
        back.castShadow = back.receiveShadow = true;
        group.add(back);
        const paper = new T.Group();
        group.add(paper);
        for (let sheet = 0; sheet < 3; sheet++) {
          const page = new T.Mesh(
            fileOwn(new T.BoxGeometry(5.78 - sheet * 0.035, 2.36, 0.012)),
            paperMaterial,
          );
          page.position.set(
            (sheet - 1) * 0.018,
            1.38 + sheet * 0.018,
            -0.075 + sheet * 0.022,
          );
          page.castShadow = page.receiveShadow = true;
          paper.add(page);
        }
        const pageTexture = fileOwn(
          makeWriting(contents.current[index], false),
        );
        const printed = new T.Mesh(
          fileOwn(new T.PlaneGeometry(5.7, 2.35)),
          fileOwn(
            new T.MeshStandardMaterial({ map: pageTexture, roughness: 1 }),
          ),
        );
        printed.position.set(0, 1.42, -0.015);
        paper.add(printed);
        const cover = new T.Mesh(
          fileOwn(new T.BoxGeometry(5.97, 2.27, 0.035)),
          card,
        );
        cover.position.set(0, 1.18, 0.035);
        cover.castShadow = cover.receiveShadow = true;
        cover.userData.index = index;
        group.add(cover);
        const tabShape = new T.Shape();
        const w = 2.45,
          h = 0.48,
          r = 0.065;
        tabShape.moveTo(-w / 2, 0);
        tabShape.lineTo(w / 2, 0);
        tabShape.lineTo(w / 2, h - r);
        tabShape.quadraticCurveTo(w / 2, h, w / 2 - r, h);
        tabShape.lineTo(-w / 2 + r, h);
        tabShape.quadraticCurveTo(-w / 2, h, -w / 2, h - r);
        tabShape.closePath();
        const tabMap = fileOwn(makeWriting(contents.current[index], true));
        const tabMaterial = fileOwn(
          new T.MeshStandardMaterial({
            color: "#e5cda7",
            map: grain,
            roughness: 0.95,
            side: T.DoubleSide,
          }),
        );
        const tab = new T.Mesh(
          fileOwn(
            new T.ExtrudeGeometry(tabShape, {
              depth: 0.026,
              bevelEnabled: false,
            }),
          ),
          tabMaterial,
        );
        const tabX = [0, -1.52, 1.52][index % 3];
        tab.position.set(tabX, 2.31, 0.01);
        tab.castShadow = tab.receiveShadow = true;
        tab.userData.index = index;
        group.add(tab);
        const writing = new T.Mesh(
          fileOwn(new T.PlaneGeometry(w - 0.08, h - 0.035)),
          fileOwn(new T.MeshStandardMaterial({ map: tabMap, roughness: 0.94 })),
        );
        writing.position.set(0, h / 2, 0.028);
        tab.add(writing);
        const model = {
          group,
          cover,
          paper,
          tab,
          amount: 0,
          from: 0,
          hover: 0,
          velocity: 0,
          owned,
        };
        files.set(index, model);
        return model;
      };
      scene.add(new T.HemisphereLight("#fff0d5", "#30241c", 1.3));
      const lamp = new T.DirectionalLight("#ffe5bd", 2.7);
      lamp.position.set(-4, 8, 6);
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(1024, 1024);
      lamp.shadow.camera.left = -8;
      lamp.shadow.camera.right = 8;
      lamp.shadow.camera.top = 10;
      lamp.shadow.camera.bottom = -10;
      lamp.shadow.normalBias = 0.025;
      lamp.shadow.bias = -0.0002;
      lamp.target.position.set(0, 0, -3);
      scene.add(lamp, lamp.target);
      const fill = new T.DirectionalLight("#d2e0e5", 0.7);
      fill.position.set(4, 4, -7);
      scene.add(fill);
      scene.fog = new T.Fog("#292019", 16, 30);
      const projection = new T.Vector3();
      function draw(time: number) {
        frame = 0;
        if (!alive) return;
        const dt = Math.min(0.032, Math.max(0.001, (time - lastFrame) / 1000));
        lastFrame = time;
        const travel = navigation
          ? Math.min(1, (time - navigation.start) / 220)
          : 1;
        if (navigation)
          position =
            navigation.from + (target - navigation.from) * ease(travel);
        if (travel === 1) {
          position = target;
          navigation = null;
        }
        const settle = reducedMotion
          ? 1
          : Math.min(1, (time - returnStart) / 220);
        let moving = navigation !== null;
        // Limit geometry and textures to the visible section of even a large archive.
        const first = Math.max(0, Math.floor(position) - 12),
          last = Math.min(
            contents.current.length - 1,
            Math.ceil(position) + 13,
          );
        for (const [index, file] of files)
          if (index < first || index > last) {
            scene.remove(file.group);
            file.owned.forEach((item) => item.dispose());
            files.delete(index);
          }
        for (let index = first; index <= last; index++) {
          const file = files.get(index) || createFile(index);
          const distance = index - position;
          file.group.visible =
            dragged !== index &&
            contents.current[index].id !== discarding.current;
          // A damped spring lets a hover reverse without restarting its lift.
          const hoverTarget =
            !reducedMotion && index === hovered && !pull ? 0.18 : 0;
          file.velocity +=
            ((hoverTarget - file.hover) * 240 - file.velocity * 26) * dt;
          file.hover += file.velocity * dt;
          if (
            Math.abs(hoverTarget - file.hover) > 0.001 ||
            Math.abs(file.velocity) > 0.001
          )
            moving = true;
          else {
            file.hover = hoverTarget;
            file.velocity = 0;
          }
          file.amount =
            pull?.index === index
              ? pull.amount * ease(Math.min(1, (time - pull.started) / 180))
              : file.from * (1 - ease(settle));
          if (!pull && settle < 1 && file.amount !== 0) moving = true;
          if (pull?.index === index && time - pull.started < 180) moving = true;
          // Browsed folders stay in the drawer, leaning towards its front lip.
          // Make room behind that folded stack instead of lowering or hiding it.
          const passed = Math.max(0, -distance);
          const fold = 1 - Math.exp(-passed * 1.6);
          const selectedZ = 1.72 - 1.7 * (1 - Math.exp(-position * 1.6));
          file.group.position.set(
            0,
            0.06 + file.hover,
            selectedZ +
              (distance >= 0
                ? -distance * 0.85
                : 0.35 * (1 - Math.exp(-passed * 0.6))) +
              file.amount * 0.9,
          );
          file.group.rotation.x = -0.095 + fold * 0.92 + file.amount * 0.32;
          file.paper.position.y = file.amount * 0.65;
          file.cover.rotation.x = file.amount * 0.03;
          const tabMaterial = file.tab.material as Three.MeshStandardMaterial;
          tabMaterial.emissive.set("#a17b36");
          tabMaterial.emissiveIntensity =
            (index === focused ? 0.12 : 0) + (index === hovered ? 0.07 : 0);
          const button = labels.current.get(index);
          if (button) {
            file.group.updateMatrixWorld(true);
            let left = Infinity,
              top = Infinity,
              right = -Infinity,
              bottom = -Infinity;
            // Project the actual tab corners, rather than estimating a screen rectangle.
            for (const x of [-1.225, 1.225])
              for (const y of [0, 0.48]) {
                projection
                  .set(x, y, 0.03)
                  .applyMatrix4(file.tab.matrixWorld)
                  .project(camera);
                const px = (projection.x * 0.5 + 0.5) * element!.clientWidth;
                const py = (-projection.y * 0.5 + 0.5) * element!.clientHeight;
                left = Math.min(left, px);
                right = Math.max(right, px);
                top = Math.min(top, py);
                bottom = Math.max(bottom, py);
              }
            button.style.left = `${left}px`;
            button.style.top = `${top}px`;
            button.style.width = `${right - left}px`;
            button.style.height = `${Math.max(26, bottom - top)}px`;
            button.style.zIndex = String(100 - Math.round(distance));
            button.hidden =
              !file.group.visible ||
              distance > 11 ||
              bottom < 0 ||
              top > element!.clientHeight;
          }
        }
        for (const [index, button] of labels.current)
          if (!files.has(index)) button.hidden = true;
        renderer.render(scene, camera);
        if (moving) request();
      }
      const releasePull = (instant = false) => {
        pull = null;
        returnStart =
          instant || reducedMotion
            ? performance.now() - 220
            : performance.now();
        for (const file of files.values()) file.from = file.amount;
        setPulling(false);
      };
      const focus = (
        next: number,
        instant = false,
        scrub = false,
        notify = true,
      ) => {
        clearTimeout(wheelTimer);
        target = Math.max(0, Math.min(contents.current.length - 1, next));
        releasePull(instant || scrub);
        navigation =
          instant || reducedMotion || scrub
            ? null
            : { from: position, start: performance.now() };
        if (!navigation) position = target;
        const nextFocus = Math.round(target);
        if (nextFocus !== focused) {
          focused = nextFocus;
          if (notify) callbacks.current.onFocus(nextFocus);
        }
        renderNow();
        if (instant)
          labels.current.get(focused)?.focus({ preventScroll: true });
      };
      const choose = (index: number, instant = false) => {
        // Tabs select; the selected folder opens directly into its paper preview.
        if (Math.abs(target - index) > 0.1) {
          focus(index, instant);
          return;
        }
        callbacks.current.onPreview(index, instant);
      };
      controls.current = {
        move: (delta, instant) => focus(Math.round(target) + delta, instant),
        choose,
        edge: (last, instant) =>
          focus(last ? contents.current.length - 1 : 0, instant),
        collapse: (instant) => {
          clearTimeout(holdTimer);
          if (dragged !== null) callbacks.current.onDragEnd(true);
          dragged = null;
          suppressClick = suppressClick || !!pressed?.moved;
          releaseCapture();
          pressed = null;
          releasePull(instant);
          renderNow();
        },
        sync: (index) => {
          if (Math.round(target) !== index) focus(index, true, false, false);
        },
      };
      const resize = () => {
        const width = element.clientWidth,
          height = element.clientHeight;
        if (!width || !height) return;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.fov = camera.aspect > 1.5 ? 25 : 35;
        // Keep the drawer front and its title tabs in frame on a narrow phone.
        const extra = Math.max(0, 1.25 / camera.aspect - 1) * 6.5;
        camera.position.set(0, 6.8 + extra * 0.45, 11.6 + extra);
        camera.lookAt(0, 0.05, -2.5);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        renderNow();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      // Finish font, texture and shader work while hidden. A late GPU upload
      // must not swallow the visible part of the drawer's entrance.
      void texturesReady.then(async () => {
        if (!alive) return;
        await renderer.compileAsync(scene, camera);
        if (!alive) return;
        renderNow();
        revealFrame = requestAnimationFrame(() => {
          revealFrame = requestAnimationFrame(() => {
            if (alive) setReady(true);
          });
        });
      });
      const pick = (event: PointerEvent) => {
        const bounds = element.getBoundingClientRect();
        pointer.set(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(
          [...files.values()]
            .filter((file) => file.group.visible)
            .flatMap((file) => [file.cover, file.tab]),
          false,
        )[0];
        return hit ? (hit.object.userData.index as number) : null;
      };
      let pressed: {
        x: number;
        y: number;
        target: number;
        moved: boolean;
        button: boolean;
        folder: number | null;
        pointerId: number;
        capture: HTMLElement;
        gesture: "browse" | "pull" | null;
        axis: "x" | "y" | null;
      } | null = null;
      let suppressClick = false;
      function releaseCapture() {
        if (pressed?.capture.hasPointerCapture(pressed.pointerId))
          pressed.capture.releasePointerCapture(pressed.pointerId);
      }
      const down = (event: PointerEvent) => {
        if (event.button !== 0 || pressed || element.closest("[inert]")) return;
        suppressClick = false;
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
          ".archive-drawer-hit",
        );
        const folder = button
          ? contents.current.findIndex(
              (piece) => piece.id === button.dataset.folderId,
            )
          : pick(event);
        pressed = {
          x: event.clientX,
          y: event.clientY,
          target,
          moved: false,
          button: !!button,
          folder,
          pointerId: event.pointerId,
          capture: event.target as HTMLElement,
          gesture: null,
          axis: null,
        };
        if (event.isTrusted) pressed.capture.setPointerCapture(event.pointerId);
        element.style.cursor = "grabbing";
        if (folder !== null)
          holdTimer = setTimeout(() => {
            if (!pressed || pressed.moved) return;
            focus(folder);
            pull = {
              index: folder,
              amount: reducedMotion ? 0 : 0.3,
              started: performance.now(),
            };
            setPulling(true);
            renderNow();
          }, 180);
      };
      const move = (event: PointerEvent) => {
        if (pressed && event.pointerId === pressed.pointerId) {
          const dx = event.clientX - pressed.x,
            dy = event.clientY - pressed.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 7) {
            clearTimeout(holdTimer);
            pressed.moved = true;
            if (!pressed.gesture) {
              pressed.axis = Math.abs(dy) > Math.abs(dx) ? "y" : "x";
              pressed.gesture = pressed.folder !== null ? "pull" : "browse";
              if (pressed.gesture === "pull") {
                focus(pressed.folder!);
                dragged = pressed.folder;
                setPulling(true);
                callbacks.current.onDragStart(dragged!, pressed.x, pressed.y);
              }
            }
            if (pressed.gesture === "pull") {
              callbacks.current.onDragMove(event.clientX, event.clientY);
              renderNow();
              // A deliberate upward pull opens while the pointer is still held.
              // Sideways/downward travel keeps the file in hand for the basket.
              if (dy < -90 && Math.abs(dx) < 64) {
                const index = pressed.folder!;
                suppressClick = true;
                releaseCapture();
                pressed = null;
                dragged = null;
                callbacks.current.onDragEnd(true);
                releasePull(true);
                callbacks.current.onPreview(index, false, true);
                renderNow();
              }
            } else
              focus(
                pressed.target - (pressed.axis === "y" ? dy : dx) / 100,
                false,
                true,
              );
          }
        } else if (!pressed) {
          const button = (
            event.target as HTMLElement
          ).closest<HTMLButtonElement>(".archive-drawer-hit");
          const index = button
            ? contents.current.findIndex(
                (piece) => piece.id === button.dataset.folderId,
              )
            : pick(event);
          element.style.cursor = "grab";
          if (
            event.pointerType === "mouse" &&
            window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
            hovered !== index
          ) {
            hovered = index;
            renderNow();
          }
        }
      };
      const up = (event: PointerEvent) => {
        if (!pressed || event.pointerId !== pressed.pointerId) return;
        clearTimeout(holdTimer);
        releaseCapture();
        if (pressed.moved) {
          suppressClick = true;
          if (pressed.gesture === "pull") {
            callbacks.current.onDragMove(event.clientX, event.clientY);
            callbacks.current.onDragEnd();
            dragged = null;
            releasePull();
            renderNow();
          } else focus(Math.round(target));
        } else {
          releasePull();
          renderNow();
          if (!pressed.button && pressed.folder !== null)
            choose(pressed.folder);
        }
        pressed = null;
        element.style.cursor = "grab";
      };
      const click = (event: MouseEvent) => {
        if (suppressClick) {
          suppressClick = false;
          event.preventDefault();
          event.stopPropagation();
        }
      };
      const cancel = () => {
        clearTimeout(holdTimer);
        releaseCapture();
        if (dragged !== null) callbacks.current.onDragEnd(true);
        dragged = null;
        suppressClick = !!pressed?.moved;
        pressed = null;
        releasePull();
        focus(Math.round(target));
      };
      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        const delta =
          Math.abs(event.deltaY) > Math.abs(event.deltaX)
            ? event.deltaY
            : event.deltaX;
        const pixels =
          delta *
          (event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? element.clientHeight
              : 1);
        focus(target + pixels / 160, false, true);
        wheelTimer = setTimeout(() => focus(Math.round(target)), 100);
      };
      const leave = () => {
        if (hovered !== null) {
          hovered = null;
          renderNow();
        }
      };
      element.addEventListener("click", click, true);
      element.addEventListener("pointerdown", down);
      element.addEventListener("pointermove", move);
      element.addEventListener("pointerup", up);
      element.addEventListener("pointercancel", cancel);
      window.addEventListener("blur", cancel);
      element.addEventListener("pointerleave", leave);
      element.addEventListener("wheel", wheel, { passive: false });
      dispose = () => {
        cancelAnimationFrame(revealFrame);
        cancelAnimationFrame(frame);
        clearTimeout(wheelTimer);
        clearTimeout(holdTimer);
        if (dragged !== null) callbacks.current.onDragEnd(true);
        releaseCapture();
        observer.disconnect();
        controls.current = null;
        element.removeEventListener("click", click, true);
        element.removeEventListener("pointerdown", down);
        element.removeEventListener("pointermove", move);
        element.removeEventListener("pointerup", up);
        element.removeEventListener("pointercancel", cancel);
        window.removeEventListener("blur", cancel);
        element.removeEventListener("pointerleave", leave);
        element.removeEventListener("wheel", wheel);
        files.forEach((file) => file.owned.forEach((item) => item.dispose()));
        resources.forEach((item) => item.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      };
    });
    return () => {
      alive = false;
      dispose();
    };
  }, [signature, reducedMotion]);

  return (
    <div className="archive-drawer-3d">
      <div
        ref={host}
        className={`archive-drawer-canvas ${ready ? "is-ready" : ""} ${failed ? "has-fallback" : ""}`}
        role="group"
        aria-label="Archive drawer. Scroll, swipe or use arrow keys to browse folders. Click a title tab to select, then click or pull up to read. Drag a folder to the wastebasket to discard it. Enter reads the selected folder."
        tabIndex={-1}
        onKeyDown={(event) => {
          const directions: Record<string, number> = {
            ArrowRight: 1,
            ArrowDown: 1,
            ArrowLeft: -1,
            ArrowUp: -1,
          };
          if (event.key === "Escape" && pulling) {
            event.preventDefault();
            event.stopPropagation();
            controls.current?.collapse(true);
          } else if (directions[event.key]) {
            event.preventDefault();
            event.stopPropagation();
            controls.current?.move(directions[event.key], true);
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            event.stopPropagation();
            controls.current?.edge(event.key === "End", true);
          } else if (
            event.key === "Enter" &&
            event.target === event.currentTarget
          ) {
            event.preventDefault();
            controls.current?.choose(start.current, true);
          }
        }}
      >
        {pieces.map((piece, index) => (
          <button
            key={piece.id}
            ref={(node) => {
              if (node) labels.current.set(index, node);
              else labels.current.delete(index);
            }}
            className="archive-drawer-hit"
            data-folder-id={piece.id}
            aria-label={
              index === initialIndex
                ? `Preview paper ${title(piece)}`
                : `Select folder ${title(piece)}`
            }
            aria-current={index === initialIndex ? "true" : undefined}
            aria-expanded={pulling && index === initialIndex}
            tabIndex={index === initialIndex || failed ? 0 : -1}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (failed) callbacks.current.onPreview(index, true);
                else controls.current?.choose(index, true);
              }
            }}
            onClick={(event) =>
              failed
                ? callbacks.current.onPreview(index, event.detail === 0)
                : controls.current?.choose(index, event.detail === 0)
            }
          >
            <span>{title(piece)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
