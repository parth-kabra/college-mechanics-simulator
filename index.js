      /* MomentLab component API:
   const lab = new MomentLab(document.getElementById("root"), {T:"T", r:2, theta:30, alpha:"α"});
   lab.setInputs({T:100, r:"R"});  // number OR string per key (angles in degrees)
   lab.getState();                 // {modes, values, results}
   MomentLab.selfTest();           // console PASS/FAIL
   URL: ?T=100&r=0.5&theta=30&alpha=20  or  ?T=F&alpha=phi */
      const D = Math.PI / 180,
        EPS = 1e-9;
      const DEF = {
        T: {
          sym: "T",
          unit: "N",
          nom: 100,
          min: -1e6,
          max: 1e6,
          sl: [-1000, 1000, 1],
          rng: "T must be −1e6 to 1e6 N (negative = reversed direction)",
        },
        r: {
          sym: "r",
          unit: "m",
          nom: 1,
          min: 0.001,
          max: 1000,
          sl: [0.1, 10, 0.1],
          rng: "r must be 0.001–1000 m",
        },
        theta: {
          sym: "θ",
          unit: "°",
          nom: 35,
          min: -360,
          max: 360,
          sl: [-360, 360, 0.5],
          rng: "θ must be −360° to 360°",
        },
        alpha: {
          sym: "α",
          unit: "°",
          nom: 20,
          min: -360,
          max: 360,
          sl: [-360, 360, 0.5],
          rng: "α must be −360° to 360°",
        },
      };
      const KEYS = ["T", "r", "theta", "alpha"],
        isAng = (k) => k === "theta" || k === "alpha";
      /* ---------- parsing / validation ---------- */
      function parse(k, raw) {
        const d = DEF[k];
        let s = String(raw == null ? "" : raw).trim();
        if (s === "") return { mode: "sym", name: d.sym, txt: "", msg: "" };
        let t = s
          .replace(/\s*(°|degrees|degree|deg)$/i, "")
          .trim()
          .replace(/^([-+]?\d+),(\d+)$/, "$1.$2");
        if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) {
          const v = Number(t);
          if (isFinite(v)) {
            const c = Math.min(d.max, Math.max(d.min, v));
            return {
              mode: "num",
              val: c,
              txt: String(c),
              msg:
                c !== v
                  ? "Clamped to " +
                    c +
                    (isAng(k) ? "°" : "") +
                    " (" +
                    d.rng +
                    ")"
                  : "",
            };
          }
        }
        const n =
          s
            .replace(/[<>&"'`\\\/]/g, "")
            .trim()
            .slice(0, 8) || d.sym;
        return { mode: "sym", name: n, txt: n, msg: "" };
      }
      /* ---------- physics engine (pure) ---------- */
      const clean = (x) => (Math.abs(x) < EPS ? 0 : x);
      function fmt(x) {
        x = clean(x);
        if (x === 0) return "0";
        const a = Math.abs(x);
        return a >= 1e9 || a < 1e-6
          ? x.toExponential(4)
          : String(+x.toPrecision(5));
      }
      function solve(T, r, th, al) {
        const a = th * D,
          b = al * D,
          A = [-r * Math.cos(a), r * Math.sin(a)],
          F = [T * Math.cos(b), T * Math.sin(b)];
        const cross = (p) => (A[0] - p[0]) * F[1] - (A[1] - p[1]) * F[0]; // CCW positive
        const MO = -cross([0, 0]),
          MP = -cross([0, -r]); // CW positive
        const cO = T * r * Math.sin((al + th) * D),
          cP = T * r * (Math.cos(b) + Math.sin((al + th) * D));
        return {
          MO: clean(MO),
          MP: clean(MP),
          cO: clean(cO),
          cP: clean(cP),
          A,
          F,
          ok:
            Math.abs(MO - cO) < EPS * Math.max(1, T * r) &&
            Math.abs(MP - cP) < EPS * Math.max(1, T * r),
        };
      }
      const sense = (v) => (v > EPS ? "CW" : v < -EPS ? "CCW" : "");
      /* ---------- 3D helpers ---------- */
      const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
      class MomentLab {
        constructor(root, init = {}) {
          this.root = root;
          root.innerHTML = MomentLab.TPL;
          this.q = (s) => root.querySelector(s);
          this.S = {};
          KEYS.forEach((k) => (this.S[k] = parse(k, "")));
          this.layers = {};
          this.goal = null;
          this.reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
          this.buildFrame = 0;
          this.mathTimer = 0;
          this.frame = 0;
          try {
            this.initScene();
          } catch (e) {
            this.q("#stage").innerHTML =
              '<div class="err">3D view unavailable (WebGL failed). Results below still work.</div>';
            this.noGL = true;
          }
          KEYS.forEach((k) => {
            const tx = this.q(`[data-t=${k}]`),
              sl = this.q(`[data-s=${k}]`),
              d = DEF[k];
            sl.min = d.sl[0];
            sl.max = d.sl[1];
            sl.step = d.sl[2];
            tx.addEventListener("input", () => {
              this.S[k] = parse(k, tx.value);
              this.sync(k);
              this.refresh();
            });
            const norm = () => {
              const p = this.S[k];
              tx.value = p.mode === "num" ? String(p.val) : p.name;
              this.S[k].msg = "";
              this.sync(k);
            };
            tx.addEventListener("blur", norm);
            tx.addEventListener("keydown", (e) => {
              if (e.key === "Enter") norm();
            });
            sl.addEventListener("input", () =>
              this.setField(k, sl.value, true),
            );
            this.q(`[data-x=${k}]`).addEventListener("click", () =>
              this.setField(k, "", true),
            );
          });
          this.q("#rall").onclick = () =>
            this.setInputs({ T: 100, r: 1, theta: 30, alpha: 20 });
          this.q("#sall").onclick = () =>
            this.setInputs({ T: "", r: "", theta: "", alpha: "" });
          this.q("#copy").onclick = () => this.copy();
          root
            .querySelectorAll("[data-v]")
            .forEach((b) => (b.onclick = () => this.view(b.dataset.v)));
          root.querySelectorAll("[data-l]").forEach(
            (c) =>
              (c.onchange = () => {
                if (this.layers[c.dataset.l]) {
                  this.layers[c.dataset.l].visible = c.checked;
                  this.requestRender();
                }
              }),
          );
          this.q("#auto").onchange = (e) => {
            if (this.ctl) {
              this.ctl.autoRotate = e.target.checked;
              this.requestRender();
            }
          };
          const p = new URLSearchParams(location.search),
            o = {};
          KEYS.forEach((k) => {
            if (p.has(k)) o[k] = p.get(k);
          });
          this.setInputs(
            Object.assign({ T: "", r: "", theta: "", alpha: "" }, init, o),
          );
        }
        setInputs(o) {
          KEYS.forEach((k) => {
            if (k in o) this.S[k] = parse(k, o[k]);
          });
          KEYS.forEach((k) => {
            const p = this.S[k];
            this.q(`[data-t=${k}]`).value =
              p.mode === "num" ? String(p.val) : p.txt || "";
            this.sync(k);
          });
          this.refresh();
        }
        setField(k, raw, w) {
          this.S[k] = parse(k, raw);
          if (w)
            this.q(`[data-t=${k}]`).value =
              this.S[k].mode === "num"
                ? String(this.S[k].val)
                : this.S[k].txt || "";
          this.sync(k);
          this.refresh();
        }
        sync(k) {
          const p = this.S[k],
            sl = this.q(`[data-s=${k}]`),
            b = this.q(`[data-b=${k}]`);
          if (p.mode === "num") {
            sl.disabled = false;
            sl.value = p.val;
          } else sl.disabled = true;
          b.textContent = p.mode === "num" ? "NUMERIC" : "SYMBOLIC";
          b.className = "badge" + (p.mode === "num" ? "" : " sym");
          this.q(`[data-m=${k}]`).textContent = p.msg || "";
        }
        val(k) {
          const p = this.S[k];
          return p.mode === "num" ? p.val : DEF[k].nom;
        }
        nm(k) {
          const p = this.S[k];
          return p.mode === "sym" ? p.name : DEF[k].sym;
        }
        term(k) {
          const p = this.S[k];
          return p.mode === "num" ? fmt(p.val) + (isAng(k) ? "°" : "") : p.name;
        }
        allNum() {
          return KEYS.every((k) => this.S[k].mode === "num");
        }
        /* ---------- results ---------- */
        refresh() {
          const S = this.S,
            all = this.allNum(),
            Tz = S.T.mode === "num" && S.T.val === 0;
          const t = {
            T: this.term("T"),
            r: this.term("r"),
            th: this.term("theta"),
            al: this.term("alpha"),
          };
          const fO = `${t.T}·sin(${t.al} + ${t.th})·${t.r}`,
            fP = `${t.T}·${t.r}·[cos(${t.al}) + sin(${t.al} + ${t.th})]`;
          let R = { MO: null, MP: null };
          const card = (id, f, v) => {
            const val = this.q("#v" + id),
              se = this.q("#s" + id),
              fe = this.q("#f" + id);
            fe.textContent = "= " + f;
            if (Tz) {
              val.textContent = "0 N·m";
              se.textContent = "No force applied";
              se.className = "zero";
              return 0;
            }
            if (all) {
              const c = sense(v);
              val.textContent = fmt(Math.abs(v)) + " N·m";
              se.textContent = c
                ? c
                : "0 — line of action passes through this point";
              se.className = c ? "" : "zero";
              fe.textContent = "= " + f + "  = " + fmt(v) + " (CW +)";
              return v;
            }
            val.textContent = "(symbolic)";
            se.textContent = "CW (reference configuration)";
            se.className = "";
            return null;
          };
          let sol = null;
          if (all)
            sol = solve(
              this.val("T"),
              this.val("r"),
              this.val("theta"),
              this.val("alpha"),
            );
          R.MO = card("O", fO, sol && sol.MO);
          R.MP = card("P", fP, sol && sol.MP);
          this.res = { MO: R.MO, MP: R.MP };
          this.sol = sol;
          this.q("#ver").textContent = all
            ? `Verification: cross-product ${fmt(sol.MO)} / ${fmt(sol.MP)} vs closed form ${fmt(sol.cO)} / ${fmt(sol.cP)} ${sol.ok ? "✓" : "✗"}`
            : "Verification: needs all four values numeric";
          this.q("#ver").className = all && sol.ok ? "ok" : "";
          const tx = (k) => {
            const p = this.S[k],
              u = isAng(k) ? "^\\circ" : "";
            if (p.mode === "num")
              return p.val < 0
                ? "\\left(" + fmt(p.val) + u + "\\right)"
                : fmt(p.val) + u;
            return (
              "\\mathit{" +
              (p.name.replace(/[^\p{L}\p{N}]/gu, "") || DEF[k].sym) +
              "}"
            );
          };
          const X = { T: tx("T"), r: tx("r"), h: tx("theta"), a: tx("alpha") },
            cs = (x) => `\\cos\\left(${x}\\right)`,
            sn = (x) => `\\sin\\left(${x}\\right)`,
            sAH = sn(`${X.a}+${X.h}`);
          const rs = (v) =>
            `${fmt(Math.abs(v))}\\ \\mathrm{N\\,m}\\ \\text{${sense(v) || "(zero)"}}`;
          const st = [
            [
              "1. Geometry (origin at O, +x right, +y up)",
              `A=\\left(-r\\cos\\theta,\\ r\\sin\\theta\\right)=\\left(-${X.r}${cs(X.h)},\\ ${X.r}${sn(X.h)}\\right),\\quad O=(0,0),\\quad P=(0,-r)`,
            ],
            [
              "2. Resolve T at A (negative T simply reverses the arrow)",
              `T_x=T\\cos\\alpha=${X.T}${cs(X.a)},\\qquad T_y=T\\sin\\alpha=${X.T}${sn(X.a)}`,
            ],
            [
              "3. Moment about O (perpendicular component × arm, arm = r)",
              `\\begin{aligned}M_O&=\\left[T\\sin(\\alpha+\\theta)\\right]r\\\\&=${X.T}\\cdot${sAH}\\cdot${X.r}${all ? `\\\\&=${rs(sol.MO)}` : ""}\\end{aligned}`,
            ],
            [
              "4. Moment about P (Varignon: sum of component moments)",
              `\\begin{aligned}M_P&=T\\cos\\alpha\\,(r+r\\sin\\theta)+T\\sin\\alpha\\,(r\\cos\\theta)\\\\&=${X.T}${cs(X.a)}\\left(${X.r}+${X.r}${sn(X.h)}\\right)+${X.T}${sn(X.a)}\\left(${X.r}${cs(X.h)}\\right)\\end{aligned}`,
            ],
            [
              "5. Simplify",
              `\\begin{aligned}M_P&=Tr\\left[\\cos\\alpha+\\sin(\\alpha+\\theta)\\right]\\\\&=${X.T}\\cdot${X.r}\\left[${cs(X.a)}+${sAH}\\right]${all ? `\\\\&=${rs(sol.MP)}` : ""}\\end{aligned}`,
            ],
          ];
          const box = this.q("#steps");
          box.textContent = "";
          st.forEach(([t, m]) => {
            const d = document.createElement("div");
            d.className = "step";
            const b = document.createElement("b");
            b.textContent = t;
            const e = document.createElement("div");
            e.className = "mj";
            e.textContent = "\\[" + m + "\\]";
            d.append(b, e);
            box.appendChild(d);
          });
          const nt = document.createElement("div");
          nt.className = "sub";
          nt.textContent =
            (all
              ? ""
              : "Symbolic input: general expressions shown, no numeric result. ") +
            "Sign convention: CCW positive internally; results reported as CW / CCW.";
          box.appendChild(nt);
          this.renderMath();
          this.q("#mode").textContent = all
            ? "Calculated diagram"
            : "General diagram";
          const thv = this.S.theta;
          this.q("#note").textContent =
            thv.mode === "num" && (thv.val < 0 || thv.val > 90)
              ? "θ outside 0–90°: the plate no longer rests on the ground at P. P is still taken as the point (0, −r); the formulas remain valid."
              : "";
          this.queueBuild();
        }
        queueBuild() {
          if (this.buildFrame) return;
          this.buildFrame = setTimeout(() => {
            this.buildFrame = 0;
            if (!this.scene) return;
            try {
              this.build();
              this.requestRender();
            } catch (e) {
              console.error(e);
            }
          }, 40);
        }
        renderMath() {
          clearTimeout(this.mathTimer);
          this.mathTimer = setTimeout(() => {
            const el = this.q("#steps"),
              mj = window.MathJax;
            if (!mj || !mj.startup) return;
            this.mp = (this.mp || Promise.resolve())
              .then(() => mj.startup.promise)
              .then(() => {
                if (typeof mj.typesetPromise !== "function") return;
                if (typeof mj.typesetClear === "function")
                  mj.typesetClear([el]);
                return mj.typesetPromise([el]);
              })
              .catch((e) => console.warn(e));
          }, 120);
        }
        getState() {
          const modes = {},
            values = {};
          KEYS.forEach((k) => {
            modes[k] = this.S[k].mode;
            values[k] =
              this.S[k].mode === "num" ? this.S[k].val : this.S[k].name;
          });
          return { modes, values, results: this.res };
        }
        copy() {
          const s = `Moment about O: ${this.q("#vO").textContent} ${this.q("#sO").textContent}\nMoment about P: ${this.q("#vP").textContent} ${this.q("#sP").textContent}`;
          const fb = () => {
            const a = document.createElement("textarea");
            a.value = s;
            document.body.appendChild(a);
            a.select();
            try {
              document.execCommand("copy");
            } catch (e) {}
            a.remove();
          };
          navigator.clipboard
            ? navigator.clipboard.writeText(s).catch(fb)
            : fb();
          this.q("#copy").textContent = "Copied ✓";
          setTimeout(
            () => (this.q("#copy").textContent = "Copy results"),
            1200,
          );
        }
        /* ---------- 3D scene ---------- */
        initScene() {
          const c = this.q("#stage"),
            W = c.clientWidth || 600,
            H = c.clientHeight || 400;
          this.ren = new THREE.WebGLRenderer({ antialias: true, alpha: true });
          this.ren.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
          this.ren.setSize(W, H);
          c.appendChild(this.ren.domElement);
          this.scene = new THREE.Scene();
          this.cam = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
          this.tgt = V(0.3, 0.35, 0);
          this.ctl = new THREE.OrbitControls(this.cam, this.ren.domElement);
          this.ctl.target.copy(this.tgt);
          this.ctl.enableDamping = true;
          this.ctl.addEventListener("start", () => {
            this.goal = null;
            this.requestRender();
          });
          this.ctl.addEventListener("end", () => this.requestRender());
          this.view("front", true);
          this.root_g = new THREE.Group();
          this.scene.add(this.root_g);
          new ResizeObserver(() => {
            const w = c.clientWidth,
              h = c.clientHeight;
            if (!w || !h) return;
            this.ren.setSize(w, h);
            this.cam.aspect = w / h;
            this.cam.updateProjectionMatrix();
            this.requestRender();
          }).observe(c);
          this.requestRender();
        }
        requestRender() {
          if (!this.frame)
            this.frame = requestAnimationFrame(() => this.renderFrame());
        }
        renderFrame() {
          this.frame = 0;
          const pos = this.cam.position.clone(),
            quat = this.cam.quaternion.clone(),
            target = this.ctl.target.clone();
          if (this.goal) {
            this.cam.position.lerp(this.goal, this.reduce ? 1 : 0.14);
            if (this.cam.position.distanceTo(this.goal) < 0.01)
              this.goal = null;
          }
          this.ctl.update();
          this.ren.render(this.scene, this.cam);
          const moving =
            this.cam.position.distanceToSquared(pos) > 1e-10 ||
            1 - Math.abs(this.cam.quaternion.dot(quat)) > 1e-10 ||
            this.ctl.target.distanceToSquared(target) > 1e-10;
          if (this.goal || this.ctl.autoRotate || moving) this.requestRender();
        }
        view(n, snap) {
          const a = this.cam.aspect || 1.4,
            d = Math.max(11, 7.8 / (2 * Math.tan(17.5 * D) * a)),
            t = this.tgt;
          const dirs = {
            front: [0, 0, 1],
            iso: [0.6, 0.5, 0.62],
            top: [0, 1, 0.001],
            side: [1, 0, 0.001],
          };
          const v = V(...dirs[n])
            .normalize()
            .multiplyScalar(d)
            .add(t);
          if (n === "front" && !snap && this.ctl) this.ctl.target.copy(t);
          if (snap) {
            this.cam.position.copy(v);
            this.cam.lookAt(t);
            this.requestRender();
          } else {
            this.goal = v;
            this.requestRender();
          }
        }
        dispose(g) {
          g.traverse((o) => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              if (o.material.map) o.material.map.dispose();
              o.material.dispose();
            }
          });
        }
        build() {
          const old = this.root_g;
          this.scene.remove(old);
          this.dispose(old);
          const g = (this.root_g = new THREE.Group());
          this.scene.add(g);
          const L = {};
          ["comp", "arm", "ang", "mom", "line", "lab"].forEach((n) => {
            L[n] = new THREE.Group();
            L[n].visible = this.q(`[data-l=${n}]`).checked;
            g.add(L[n]);
          });
          this.layers = L;
          const all = this.allNum(),
            Tv = this.val("T"),
            th = this.val("theta"),
            al = this.val("alpha"),
            R = 1.6,
            a = th * D,
            b = al * D;
          const Tz = this.S.T.mode === "num" && Tv === 0;
          const A = V(-R * Math.cos(a), R * Math.sin(a)),
            O = V(0, 0),
            P = V(0, -R);
          const C = {
            T: 0xfb7185,
            c: 0x60a5fa,
            s: 0x4ade80,
            p: 0xfbbf24,
            O: 0xb49aff,
            P: 0x5edcf3,
            ink: 0xdce8f8,
            arm: 0x7185a2,
          };
          const mat = (c) => new THREE.MeshBasicMaterial({ color: c });
          const cyl = (p, q, rad, c, gr) => {
            const d = q.clone().sub(p),
              l = d.length();
            if (l < 1e-5) return;
            const m = new THREE.Mesh(
              new THREE.CylinderGeometry(rad, rad, l, 8),
              mat(c),
            );
            m.position.copy(p).add(q).multiplyScalar(0.5);
            m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
            gr.add(m);
          };
          const line = (p, q, rad, c, gr, pat) => {
            if (!pat) {
              cyl(p, q, rad, c, gr);
              return;
            }
            const d = q.clone().sub(p),
              l = d.length(),
              u = d.clone().normalize();
            let s = 0,
              i = 0;
            while (s < l) {
              const on = pat[i % pat.length],
                e = Math.min(l, s + on);
              if (i % 2 === 0)
                cyl(
                  p.clone().add(u.clone().multiplyScalar(s)),
                  p.clone().add(u.clone().multiplyScalar(e)),
                  rad,
                  c,
                  gr,
                );
              s = e + pat[(i + 1) % pat.length];
              i += 2;
            }
          };
          const head = (tip, dir, c, gr, sz = 0.2, w = 0.09) => {
            const m = new THREE.Mesh(new THREE.ConeGeometry(w, sz, 12), mat(c));
            m.position.copy(tip).sub(dir.clone().multiplyScalar(sz / 2));
            m.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
            gr.add(m);
          };
          const arrow = (p, q, rad, c, gr, pat) => {
            const d = q.clone().sub(p),
              l = d.length();
            if (l < 0.05) return;
            const u = d.clone().normalize(),
              h = Math.min(0.22, l * 0.5);
            line(
              p,
              q.clone().sub(u.clone().multiplyScalar(h * 0.8)),
              rad,
              c,
              gr,
              pat,
            );
            head(q, u, c, gr, h, rad * 3.2);
          };
          const label = (txt, pos, col, sz = 0.34, gr = L.lab) => {
            const cv = document.createElement("canvas"),
              x = cv.getContext("2d"),
              f = 'italic 44px "Times New Roman",serif';
            x.font = f;
            const w = Math.ceil(x.measureText(txt).width) + 20;
            cv.width = w;
            cv.height = 70;
            x.font = f;
            x.textBaseline = "middle";
            x.lineWidth = 10;
            x.strokeStyle = "#101a2a";
            x.strokeText(txt, 10, 36);
            x.fillStyle = col;
            x.fillText(txt, 10, 36);
            const s = new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: new THREE.CanvasTexture(cv),
                depthTest: false,
                transparent: true,
              }),
            );
            s.scale.set((sz * w) / 70, sz, 1);
            s.position.copy(pos);
            s.renderOrder = 9;
            gr.add(s);
          };
          const hex = (n) => "#" + n.toString(16).padStart(6, "0");
          /* ground */
          line(V(-3.6, -R), V(3.6, -R), 0.035, C.ink, g);
          for (let x = -3.5; x <= 3.5; x += 0.28)
            line(V(x, -R), V(x - 0.25, -R - 0.25), 0.012, C.arm, g);
          /* half-disk: semicircle from angle 180-θ to 360-θ (passes through P) */
          const sh = new THREE.Shape();
          sh.moveTo(0, 0);
          sh.lineTo(A.x, A.y);
          sh.absarc(0, 0, R, (180 - th) * D, (360 - th) * D, false);
          sh.lineTo(0, 0);
          const ex = new THREE.ExtrudeGeometry(sh, {
            depth: 0.35,
            bevelEnabled: false,
          });
          ex.translate(0, 0, -0.175);
          g.add(
            new THREE.Mesh(
              ex,
              new THREE.MeshBasicMaterial({
                color: 0x293d5d,
                transparent: true,
                opacity: 0.92,
              }),
            ),
          );
          const eg = new THREE.LineSegments(
            new THREE.EdgesGeometry(ex),
            new THREE.LineBasicMaterial({ color: C.ink }),
          );
          g.add(eg);
          /* points */
          [
            [A, "A"],
            [O, "O"],
            [P, "P"],
          ].forEach(([p, n]) => {
            const m = new THREE.Mesh(
              new THREE.SphereGeometry(0.07, 16, 12),
              mat(C.ink),
            );
            m.position.copy(p).setZ(0.2);
            g.add(m);
            label(
              n,
              p
                .clone()
                .add(
                  n === "A"
                    ? V(-0.25, 0.2, 0.3)
                    : n === "O"
                      ? V(0.22, 0.22, 0.3)
                      : V(0.05, -0.3, 0.3),
                ),
              "#edf4ff",
              0.4,
            );
          });
          /* r dimension & PO */
          line(O, P, 0.012, C.arm, L.arm, [0.1, 0.06]);
          label(
            this.S.r.mode === "num"
              ? "r = " + fmt(this.val("r")) + " m"
              : this.nm("r"),
            V(0.26, -R / 2, 0.3),
            "#c0cee2",
            0.3,
          );
          /* arm construction */
          const H = V(0, A.y);
          line(A, H, 0.012, C.arm, L.arm, [0.1, 0.06]);
          line(H, O, 0.012, C.arm, L.arm, [0.1, 0.06]);
          line(A, O, 0.015, C.ink, L.arm, [0.12, 0.05]);
          label(
            this.nm("r") + "cos" + this.nm("theta"),
            V(A.x / 2, A.y + 0.18, 0.3),
            "#a9bad3",
            0.26,
          );
          label(
            this.nm("r") + "sin" + this.nm("theta"),
            V(0.5, A.y / 2, 0.3),
            "#a9bad3",
            0.26,
          );
          /* reference horizontal at A & angle arcs */
          line(A, A.clone().add(V(2.4, 0)), 0.01, C.arm, L.ang, [0.08, 0.05]);
          const arc = (c, rad, a0, a1, col, gr, txt, tc) => {
            let p0 = null;
            for (let i = 0; i <= 24; i++) {
              const t = a0 + ((a1 - a0) * i) / 24,
                p = c.clone().add(V(rad * Math.cos(t), rad * Math.sin(t)));
              if (p0) cyl(p0, p, 0.013, col, gr);
              p0 = p;
            }
            const m = (a0 + a1) / 2;
            label(
              txt,
              c
                .clone()
                .add(
                  V((rad + 0.3) * Math.cos(m), (rad + 0.3) * Math.sin(m), 0.3),
                ),
              tc,
              0.28,
            );
          };
          arc(
            A,
            0.55,
            -a,
            0,
            C.arm,
            L.ang,
            this.nm("theta") +
              (this.S.theta.mode === "num" ? " = " + fmt(th) + "°" : ""),
            "#c5d2e7",
          );
          /* tension */
          const cap = (v, m) => Math.max(-m, Math.min(m, v));
          const len =
              this.S.T.mode === "num"
                ? 0.9 + 1.6 * (1 - Math.exp(-Math.abs(Tv) / 300))
                : 2.2,
            sg = Tv < 0 ? -1 : 1;
          if (!Tz) {
            const u = V(Math.cos(b), Math.sin(b));
            const tip = A.clone().add(u.clone().multiplyScalar(len * sg));
            line(
              A.clone().sub(u.clone().multiplyScalar(2.5)),
              A.clone().add(u.clone().multiplyScalar(5)),
              0.01,
              C.T,
              L.line,
              [0.1, 0.06],
            );
            arrow(A, tip, 0.035, C.T, g);
            label(
              this.nm("T") +
                (this.S.T.mode === "num" ? " = " + fmt(Tv) + " N" : ""),
              tip.clone().add(V(0.35, 0.18, 0.3)),
              hex(C.T),
              0.4,
            );
            arc(
              A,
              0.9,
              0,
              b,
              C.T,
              L.ang,
              this.nm("alpha") +
                (this.S.alpha.mode === "num" ? " = " + fmt(al) + "°" : ""),
              hex(C.T),
            );
            /* components */
            const tn = this.S.T.mode === "num",
              vv = (x, u) =>
                tn && this.S.alpha.mode === "num"
                  ? " = " + fmt(x) + " " + u
                  : "";
            const cx = sg * len * Math.cos(b),
              cy = sg * len * Math.sin(b),
              pp = sg * len * Math.sin((al + th) * D),
              pd = V(Math.sin(a), Math.cos(a));
            const Tn = this.nm("T"),
              An = this.nm("alpha"),
              Hn = this.nm("theta");
            if (Math.abs(cx) > 0.05) {
              arrow(
                A,
                A.clone().add(V(cx, 0)),
                0.02,
                C.c,
                L.comp,
                [0.14, 0.07],
              );
              label(
                Tn + "cos" + An + vv(Tv * Math.cos(b), "N"),
                A.clone().add(V(cx / 2 + 0.2, -0.25, 0.3)),
                hex(C.c),
                0.28,
                L.comp,
              );
            }
            if (Math.abs(cy) > 0.05) {
              arrow(
                A,
                A.clone().add(V(0, cy)),
                0.02,
                C.s,
                L.comp,
                [0.03, 0.06],
              );
              label(
                Tn + "sin" + An + vv(Tv * Math.sin(b), "N"),
                A.clone().add(V(-0.1, cy + 0.22, 0.3)),
                hex(C.s),
                0.28,
                L.comp,
              );
            }
            if (Math.abs(pp) > 0.05) {
              const q = A.clone().add(pd.clone().multiplyScalar(pp));
              arrow(A, q, 0.02, C.p, L.comp, [0.2, 0.05, 0.03, 0.05]);
              label(
                Tn +
                  "sin(" +
                  An +
                  "+" +
                  Hn +
                  ")" +
                  (tn &&
                  this.S.alpha.mode === "num" &&
                  this.S.theta.mode === "num"
                    ? " = " + fmt(Tv * Math.sin((al + th) * D)) + " N"
                    : ""),
                q.clone().add(V(0.15, 0.25, 0.3)),
                hex(C.p),
                0.28,
                L.comp,
              );
            }
          } else label("No force applied", V(-1.2, 2.4, 0.3), "#d97706", 0.36);
          /* moment arrows */
          const mom = (c, rad, cw, col, txt, zero) => {
            if (zero) {
              label(
                "0",
                c.clone().add(V(0.45, 0.45, 0.4)),
                hex(col),
                0.4,
                L.mom,
              );
              return;
            }
            const a0 = cw ? 200 * D : -20 * D,
              sw = 270 * D * (cw ? -1 : 1),
              pts = [];
            for (let i = 0; i <= 28; i++) {
              const t = a0 + (sw * i) / 28;
              pts.push(
                c.clone().add(V(rad * Math.cos(t), rad * Math.sin(t), 0.25)),
              );
            }
            for (let i = 1; i < pts.length; i++)
              cyl(pts[i - 1], pts[i], 0.028, col, L.mom);
            const d = pts[28].clone().sub(pts[27]).normalize();
            head(
              pts[28].clone().add(d.clone().multiplyScalar(0.08)),
              d,
              col,
              L.mom,
              0.2,
              0.08,
            );
            label(
              txt,
              c.clone().add(V(-0.55, -0.5, 0.4)),
              hex(col),
              0.3,
              L.mom,
            );
          };
          const sO = all && !Tz ? sense(this.sol.MO) : "CW",
            sP = all && !Tz ? sense(this.sol.MP) : "CW";
          const zO = Tz || (all && !sO),
            zP = Tz || (all && !sP);
          mom(
            O,
            0.4,
            sO !== "CCW",
            C.O,
            "M_" + "O" + (all && !zO ? " = " + fmt(Math.abs(this.sol.MO)) : ""),
            zO,
          );
          mom(
            P,
            0.4,
            sP !== "CCW",
            C.P,
            "M_P" + (all && !zP ? " = " + fmt(Math.abs(this.sol.MP)) : ""),
            zP,
          );
        }
      }
      MomentLab.TPL = `<div class="lab"><div class="card"><div class="eyebrow">Mechanics studio · Interactive lab</div><h1>Moment of a Force – Chapter 2, Q 2/45</h1>
<div class="sub">Moments of tension <i>T</i> about points <b>O</b> and <b>P</b> of a half-disk. <b id="mode"></b> · drag to orbit, scroll to zoom.</div>
<div class="stage" id="stage"></div>
<div class="bar"><button data-v="front" class="pri">Front (2D)</button><button data-v="iso">Isometric</button><button data-v="top">Top</button><button data-v="side">Side</button>
<label class="chk"><input type="checkbox" id="auto">Auto-rotate</label></div>
<div class="bar"><span class="chk">Layers:</span>
${[
  ["comp", "Components"],
  ["arm", "Moment arms"],
  ["ang", "Angles"],
  ["mom", "Moment arrows"],
  ["line", "Line of action"],
  ["lab", "Labels"],
]
  .map(
    (x) =>
      `<label class="chk"><input type="checkbox" data-l="${x[0]}" checked>${x[1]}</label>`,
  )
  .join("")}</div>
<div class="leg bar"><span><i style="background:#e11d48"></i>T</span><span><i style="background:#2563eb"></i>T cosα</span><span><i style="background:#16a34a"></i>T sinα</span><span><i style="background:#d97706"></i>T sin(α+θ)</span><span><i style="background:#7c3aed"></i>M about O</span><span><i style="background:#0891b2"></i>M about P</span></div>
<div class="project-panels">
<details class="project-accordion" open>
<summary><span class="accordion-icon" aria-hidden="true">▣</span><span class="accordion-heading"><span class="accordion-kicker">Curriculum catalog <b>Active</b></span><span class="accordion-title">Problem Statement Selection &amp; Specification</span></span></summary>
<div class="problem-preview"><img class="problem-image" src="problem.png" alt="Chapter 2, Question 2/45: determine the moments of tension T about points P and O."></div>
</details>
<details class="project-accordion" open>
<summary><span class="accordion-icon" aria-hidden="true">♙</span><span class="accordion-heading"><span class="accordion-kicker">Academic verification <b>Peer</b></span><span class="accordion-title">Author &amp; Student Credentials / Metadata</span></span></summary>
<div class="credential-grid">
<div class="credential"><span class="credential-label">Student name</span><span class="credential-value">Parth Kabra</span></div>
<div class="credential"><span class="credential-label">SRN</span><span class="credential-value">PES1UG26AM238</span></div>
<div class="credential accent"><span class="credential-label">Portfolio</span><span class="credential-value"><a href="https://parthkabra.vercel.app/" target="_blank" rel="noopener noreferrer">Visit portfolio ↗</a></span></div>
<div class="credential accent"><span class="credential-label">GitHub repository</span><span class="credential-value"><a href="https://github.com/parth-kabra/college-mechanics-simulator/" target="_blank" rel="noopener noreferrer">View Source Code</a></span></div>
</div>
</details>
</div></div>
<div><div class="card" style="margin-bottom:12px"><h2>Inputs</h2>
${[
  ["T", "T", "N", "Force"],
  ["r", "r", "m", "Radius"],
  ["theta", "θ", "°", "Theta"],
  ["alpha", "α", "°", "Alpha"],
]
  .map(
    (
      f,
    ) => `<div class="fld"><div class="row"><label for="i${f[0]}">${f[1]} (${f[2]})</label><input type="text" id="i${f[0]}" data-t="${f[0]}" aria-label="${f[3]} – number or symbol" autocomplete="off" spellcheck="false"><button data-x="${f[0]}" title="Reset to symbol" aria-label="Reset ${f[3]} to symbol">↺</button><span class="badge" data-b="${f[0]}"></span></div>
<input type="range" data-s="${f[0]}" aria-label="${f[3]} lever"><div class="msg" data-m="${f[0]}" role="status"></div></div>`,
  )
  .join("")}
<div class="sub">Angles in degrees, −360° to 360°. θ: measured below the horizontal at A (to line AO). α: measured counter-clockwise from the +x direction at A (positive = above). T may be negative: the arrow then points opposite to α. Type a number, or any text (e.g. F, φ) for the general case.</div><div class="note" id="note"></div>
<div class="bar"><button id="rall">Reset all</button><button id="sall">All symbolic (general case)</button></div></div>
<div class="card" aria-live="polite"><h2>Results</h2>
<div class="res"><div>Moment about <b>O</b></div><b class="v" id="vO"></b> <span id="sO"></span><div class="f" id="fO"></div></div>
<div class="res p"><div>Moment about <b>P</b></div><b class="v" id="vP"></b> <span id="sP"></span><div class="f" id="fP"></div></div>
<div id="ver" class="sub"></div>
<details open><summary>Step-by-step solution (LaTeX)</summary><div id="steps"></div></details>
<div class="bar"><button id="copy">Copy results</button></div></div></div></div>`;
      MomentLab.selfTest = function () {
        const cases = [
          [100, 0.5, 30, 20, 38.302, 85.286],
          [100, 1, 0, 0, 0, 100],
          [100, 1, 0, 90, 100, 100],
          [100, 1, 30, -30, 0, 86.603],
          [100, 1, 30, -60, -50, 0],
          [0, 2, 40, 10, 0, 0],
          [-100, 1, 30, -60, 50, 0],
          [100, 1, -30, 30, 0, 86.603],
          [-100, 0.5, 30, 20, -38.302, -85.286],
        ];
        cases.forEach((c, i) => {
          const s = solve(c[0], c[1], c[2], c[3]),
            ok =
              Math.abs(s.MO - c[4]) < 0.001 &&
              Math.abs(s.MP - c[5]) < 0.001 &&
              s.ok;
          console.log("Test " + (i + 1), ok ? "PASS" : "FAIL", s.MO, s.MP);
        });
        const p = parse("alpha", "φ"),
          q = parse("theta", "30 deg");
        console.log(
          "Test 7",
          p.mode === "sym" && q.val === 30 ? "PASS" : "FAIL",
        );
      };
      window.MomentLab = MomentLab;
      try {
        window.lab = new MomentLab(document.getElementById("root"), {
          T: 100,
          r: 1,
          theta: 30,
          alpha: 20,
        });
      } catch (e) {
        document.getElementById("root").innerHTML =
          '<div class="err">Failed to start: ' +
          String(e.message).replace(/[<>]/g, "") +
          "</div>";
      }
