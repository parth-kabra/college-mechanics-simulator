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
            .slice(0, 8);
        const nm = /\p{L}/u.test(n) ? n : d.sym;
        return { mode: "sym", name: nm, txt: nm, msg: "" };
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
          this.q("#export").onclick = () => this.exportPDF();
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
          this.q("#ver").classList.toggle("ok", !!(all && sol.ok));
          this.q("#ver").classList.toggle("bad", !!(all && !sol.ok));
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
          this.steps = st;
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
        renderMath(tries = 0) {
          clearTimeout(this.mathTimer);
          this.mathTimer = setTimeout(
            () => {
              const el = this.q("#steps"),
                mj = window.MathJax;
              if (!mj || !mj.startup || !mj.startup.promise) {
                if (tries < 40) this.renderMath(tries + 1);
                return;
              }
              this.mp = (this.mp || Promise.resolve())
                .then(() => mj.startup.promise)
                .then(() => {
                  if (typeof mj.typesetPromise !== "function") return;
                  if (typeof mj.typesetClear === "function")
                    mj.typesetClear([el]);
                  return mj.typesetPromise([el]);
                })
                .catch((e) => console.warn(e));
            },
            tries ? 250 : 120,
          );
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
          const s = `Moment about O: ${this.q("#vO").textContent} ${this.q("#sO").textContent}\nMoment about P: ${this.q("#vP").textContent} ${this.q("#sP").textContent}`,
            btn = this.q("#copy"),
            done = (ok) => {
              btn.textContent = ok ? "Copied ✓" : "Copy failed";
              setTimeout(() => (btn.textContent = "Copy results"), 1400);
            },
            fb = () => {
              const a = document.createElement("textarea");
              a.value = s;
              a.style.position = "fixed";
              a.style.opacity = "0";
              document.body.appendChild(a);
              a.select();
              let ok = false;
              try {
                ok = document.execCommand("copy");
              } catch (e) {}
              a.remove();
              done(ok);
            };
          if (navigator.clipboard && navigator.clipboard.writeText)
            navigator.clipboard.writeText(s).then(() => done(true), fb);
          else fb();
        }
        async exportPDF() {
          const btn = this.q("#export"),
            label = "Export PDF report";
          if (btn.disabled) return;
          btn.disabled = true;
          btn.textContent = "Preparing report…";
          try {
            const PDF = await ensureJsPDF();
            if (document.fonts && document.fonts.load)
              await Promise.all([
                document.fonts.load("400 12px Poppins"),
                document.fonts.load("600 12px Poppins"),
                document.fonts.load("700 12px Poppins"),
              ]).catch(() => {});
            await (window.MathJax && MathJax.startup && MathJax.startup.promise);
            const rep = new Report(this);
            await rep.compose();
            rep
              .toPDF(PDF)
              .save("Moment-of-Force_Q2-45_" + (rep.srn || "report") + ".pdf");
            btn.textContent = "Downloaded ✓";
          } catch (e) {
            console.error(e);
            btn.textContent = "Export failed";
            btn.title = String(e && e.message ? e.message : e);
          }
          setTimeout(() => {
            btn.disabled = false;
            btn.textContent = label;
          }, 1800);
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
<div class="leg bar"><span><i style="background:#fb7185"></i>T</span><span><i style="background:#60a5fa"></i>T cosα</span><span><i style="background:#4ade80"></i>T sinα</span><span><i style="background:#fbbf24"></i>T sin(α+θ)</span><span><i style="background:#b49aff"></i>M about O</span><span><i style="background:#5edcf3"></i>M about P</span></div>
<div class="project-panels">
<details class="project-accordion">
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
    ) => `<div class="fld" data-k="${f[0]}"><div class="row"><label for="i${f[0]}">${f[1]} (${f[2]})</label><input type="text" id="i${f[0]}" data-t="${f[0]}" aria-label="${f[3]} – number or symbol" autocomplete="off" spellcheck="false"><button data-x="${f[0]}" title="Reset to symbol" aria-label="Reset ${f[3]} to symbol">↺</button><span class="badge" data-b="${f[0]}"></span></div>
<input type="range" data-s="${f[0]}" aria-label="${f[3]} lever"><div class="msg" data-m="${f[0]}" role="status"></div></div>`,
  )
  .join("")}
<div class="sub">Angles in degrees, −360° to 360°. θ: measured below the horizontal at A (to line AO). α: measured counter-clockwise from the +x direction at A (positive = above). T may be negative: the arrow then points opposite to α. Type a number, or any text (e.g. F, φ) for the general case.</div><div class="note" id="note"></div>
<div class="bar"><button id="rall">Reset all</button><button id="sall">All symbolic (general case)</button></div></div>
<div class="card" aria-live="polite"><h2>Results</h2>
<div class="res"><div>Moment about <b>O</b></div><b class="v" id="vO"></b> <span id="sO"></span><div class="f" id="fO"></div></div>
<div class="res p"><div>Moment about <b>P</b></div><b class="v" id="vP"></b> <span id="sP"></span><div class="f" id="fP"></div></div>
<div id="ver" class="sub"></div>
<details><summary>Step-by-step solution (LaTeX)</summary><div id="steps"></div></details>
<div class="actions"><button id="copy">Copy results</button><button id="export" class="exp">Export PDF report</button></div></div></div></div>`;
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
          "Test " + (cases.length + 1),
          p.mode === "sym" && q.val === 30 ? "PASS" : "FAIL",
        );
      };
      /* ---------- PDF report export ---------- */
      const PAL = {
          T: "#e11d48",
          c: "#2563eb",
          s: "#16a34a",
          p: "#d97706",
          O: "#7c3aed",
          P: "#0891b2",
          ink: "#111827",
          mut: "#6b7280",
          line: "#e5e7eb",
        },
        UIF = '"Poppins","Segoe UI",Arial,sans-serif',
        SERIF = '"Times New Roman",Times,serif',
        MONO = 'Consolas,"SFMono-Regular",Menlo,monospace',
        JSPDF_SRC =
          "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      function ensureJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF)
          return Promise.resolve(window.jspdf.jsPDF);
        return new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = JSPDF_SRC;
          s.onload = () =>
            window.jspdf && window.jspdf.jsPDF
              ? res(window.jspdf.jsPDF)
              : rej(new Error("jsPDF failed to initialise"));
          s.onerror = () =>
            rej(new Error("Could not load jsPDF – check your connection"));
          document.head.appendChild(s);
        });
      }
      /* LaTeX -> raster image through MathJax's SVG output */
      async function texToImage(tex, emPx) {
        const mj = window.MathJax;
        if (!mj || !mj.startup || !mj.tex2svgPromise)
          throw new Error("MathJax not ready");
        await mj.startup.promise;
        const node = await mj.tex2svgPromise(tex, { display: true });
        const svg = node.querySelector("svg");
        if (!svg) throw new Error("MathJax produced no SVG");
        const exPx = emPx * 0.442,
          w = parseFloat(svg.getAttribute("width")) * exPx,
          h = parseFloat(svg.getAttribute("height")) * exPx;
        svg.setAttribute("width", w + "px");
        svg.setAttribute("height", h + "px");
        svg.removeAttribute("style");
        const str = new XMLSerializer()
          .serializeToString(svg)
          .replace(/currentColor/g, PAL.ink);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = () => rej(new Error("Equation image failed"));
          img.src =
            "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
        });
        return { img, w, h };
      }
      function rrect(x, px, py, w, h, r) {
        x.beginPath();
        x.moveTo(px + r, py);
        x.arcTo(px + w, py, px + w, py + h, r);
        x.arcTo(px + w, py + h, px, py + h, r);
        x.arcTo(px, py + h, px, py, r);
        x.arcTo(px, py, px + w, py, r);
        x.closePath();
      }
      /* 2D force diagram drawn on a white canvas (print-friendly colours) */
      function drawDiagram2D(x, X, Y, W, H, m) {
        const R = 1.6,
          a = m.th * D,
          b = m.al * D,
          sg = m.T < 0 ? -1 : 1,
          nm = m.nm;
        const A = [-R * Math.cos(a), R * Math.sin(a)],
          O = [0, 0],
          P = [0, -R];
        const len = m.Tnum ? 0.9 + 1.6 * (1 - Math.exp(-Math.abs(m.T) / 300)) : 2.2,
          u = [Math.cos(b), Math.sin(b)],
          tip = [A[0] + u[0] * len * sg, A[1] + u[1] * len * sg];
        const xmin = Math.min(-R, A[0], tip[0]) - 1.0,
          xmax = Math.max(R, A[0] + 1.6, tip[0]) + 1.4,
          ymin = -R - 1.0,
          ymax = Math.max(A[1], tip[1], R * Math.abs(Math.sin(a)), 0.5) + 0.9;
        const s = Math.min(W / (xmax - xmin), H / (ymax - ymin)),
          ox = X + (W - (xmax - xmin) * s) / 2 - xmin * s,
          oy = Y + (H - (ymax - ymin) * s) / 2 + ymax * s;
        const px = (p) => [ox + p[0] * s, oy - p[1] * s];
        x.save();
        x.beginPath();
        x.rect(X, Y, W, H);
        x.clip();
        x.lineCap = "round";
        x.lineJoin = "round";
        const seg = (p, q, c, w, dash) => {
          const p1 = px(p),
            q1 = px(q);
          x.beginPath();
          x.setLineDash(dash || []);
          x.strokeStyle = c;
          x.lineWidth = w;
          x.moveTo(p1[0], p1[1]);
          x.lineTo(q1[0], q1[1]);
          x.stroke();
          x.setLineDash([]);
        };
        const arrow = (p, q, c, w, dash, hs = 11) => {
          const p1 = px(p),
            q1 = px(q),
            dx = q1[0] - p1[0],
            dy = q1[1] - p1[1],
            l = Math.hypot(dx, dy);
          if (l < 5) return;
          const ux = dx / l,
            uy = dy / l,
            hh = Math.min(hs, l * 0.6);
          x.beginPath();
          x.setLineDash(dash || []);
          x.strokeStyle = c;
          x.lineWidth = w;
          x.moveTo(p1[0], p1[1]);
          x.lineTo(q1[0] - ux * hh * 0.7, q1[1] - uy * hh * 0.7);
          x.stroke();
          x.setLineDash([]);
          x.beginPath();
          x.fillStyle = c;
          x.moveTo(q1[0], q1[1]);
          x.lineTo(q1[0] - ux * hh + uy * hh * 0.4, q1[1] - uy * hh - ux * hh * 0.4);
          x.lineTo(q1[0] - ux * hh - uy * hh * 0.4, q1[1] - uy * hh + ux * hh * 0.4);
          x.closePath();
          x.fill();
        };
        /* text with white halo; parts: string or [{t,size,dy,it}] ; p in pixels */
        const text = (parts, p, o = {}) => {
          const size = o.size || 12,
            ps = typeof parts === "string" ? [{ t: parts }] : parts,
            fnt = (q) =>
              (q.it === false || o.it === false ? "" : "italic ") +
              (o.bold ? "bold " : "") +
              (q.size || size) +
              "px " +
              (o.font || SERIF);
          let tw = 0;
          ps.forEach((q) => {
            x.font = fnt(q);
            tw += x.measureText(q.t).width;
          });
          let left = o.center ? p[0] - tw / 2 : o.right ? p[0] - tw : p[0];
          left = Math.max(X + 5, Math.min(X + W - 5 - tw, left));
          x.textBaseline = "middle";
          x.lineJoin = "round";
          ps.forEach((q) => {
            x.font = fnt(q);
            const yy = p[1] + (q.dy || 0),
              wq = x.measureText(q.t).width;
            x.strokeStyle = "#fff";
            x.lineWidth = 4;
            x.strokeText(q.t, left, yy);
            x.fillStyle = o.c || PAL.ink;
            x.fillText(q.t, left, yy);
            left += wq;
          });
        };
        const arc = (c, rad, a0, a1, col, w) => {
          x.beginPath();
          for (let i = 0; i <= 30; i++) {
            const t = a0 + ((a1 - a0) * i) / 30,
              q = px([c[0] + rad * Math.cos(t), c[1] + rad * Math.sin(t)]);
            i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]);
          }
          x.strokeStyle = col;
          x.lineWidth = w;
          x.stroke();
        };
        /* ground */
        seg([xmin, -R], [xmax, -R], PAL.ink, 2.2);
        for (let xx = xmin; xx < xmax; xx += 0.17)
          seg([xx, -R], [xx - 0.14, -R - 0.14], "#9ca3af", 1);
        /* half-disk */
        const pts = [px(O), px(A)];
        for (let i = 0; i <= 60; i++) {
          const t = (180 - m.th + (180 * i) / 60) * D;
          pts.push(px([R * Math.cos(t), R * Math.sin(t)]));
        }
        x.beginPath();
        pts.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])));
        x.closePath();
        x.fillStyle = "#dde5f3";
        x.fill();
        x.strokeStyle = PAL.ink;
        x.lineWidth = 2;
        x.stroke();
        /* construction lines */
        const Hh = [0, A[1]];
        seg(A, Hh, "#94a3b8", 1.2, [5, 4]);
        seg(Hh, O, "#94a3b8", 1.2, [5, 4]);
        seg(A, [A[0] + 1.6, A[1]], "#94a3b8", 1.2, [5, 4]);
        seg(O, P, "#94a3b8", 1.2, [5, 4]);
        text(
          m.rNum ? "r = " + fmt(m.r) + " m" : nm.r,
          px([0.1, -R / 2]),
          { c: "#374151", size: 13 },
        );
        if (Math.abs(A[1]) > 0.3)
          text(nm.r + "sin" + nm.theta, px([0.1, A[1] * 0.5]), {
            c: "#6b7280",
            size: 11,
          });
        /* force + components */
        if (!m.Tz) {
          seg(
            [A[0] - u[0] * 1.2, A[1] - u[1] * 1.2],
            [tip[0] + u[0] * 0.8, tip[1] + u[1] * 0.8],
            "rgba(225,29,72,.35)",
            1.4,
            [6, 5],
          );
          const cx = sg * len * u[0],
            cy = sg * len * u[1],
            pp = sg * len * Math.sin((m.al + m.th) * D),
            pd = [Math.sin(a), Math.cos(a)],
            val = (v) => (m.Tnum && m.alNum ? " = " + fmt(v) + " N" : "");
          if (Math.abs(cx) > 0.05) {
            arrow(A, [A[0] + cx, A[1]], PAL.c, 1.8, [6, 4], 9);
            text(
              nm.T + "cos" + nm.alpha + val(m.T * Math.cos(b)),
              px([A[0] + cx + (cx >= 0 ? 0.16 : -0.16), A[1] - 0.2]),
              { c: PAL.c, size: 12, right: cx < 0 },
            );
          }
          if (Math.abs(cy) > 0.05) {
            arrow(A, [A[0], A[1] + cy], PAL.s, 1.8, [2, 4], 9);
            text(
              nm.T + "sin" + nm.alpha + val(m.T * Math.sin(b)),
              px([A[0] - 0.08, A[1] + cy + (cy > 0 ? 0.18 : -0.18)]),
              { c: PAL.s, size: 12, right: true },
            );
          }
          if (Math.abs(pp) > 0.05) {
            const q = [A[0] + pd[0] * pp, A[1] + pd[1] * pp];
            arrow(A, q, PAL.p, 1.8, [9, 3, 2, 3], 9);
            text(
              nm.T +
                "sin(" +
                nm.alpha +
                "+" +
                nm.theta +
                ")" +
                (m.Tnum && m.alNum && m.thNum
                  ? " = " + fmt(m.T * Math.sin((m.al + m.th) * D)) + " N"
                  : ""),
              px([q[0] + 0.12, q[1] + (pp > 0 ? 0.18 : -0.18)]),
              { c: PAL.p, size: 12 },
            );
          }
          arrow(A, tip, PAL.T, 3.2, null, 15);
          text(
            nm.T + (m.Tnum ? " = " + fmt(m.T) + " N" : ""),
            px([tip[0] + 0.14, tip[1] + 0.2]),
            { c: PAL.T, size: 17, bold: true },
          );
          if (Math.abs(b) > 1e-6) {
            arc(A, 0.9, 0, b, PAL.T, 1.8);
            text(
              nm.alpha + (m.alNum ? " = " + fmt(m.al) + "°" : ""),
              px([
                A[0] + 1.25 * Math.cos(b / 2) + 0.15,
                A[1] + 1.25 * Math.sin(b / 2),
              ]),
              { c: PAL.T, size: 13 },
            );
          }
        } else
          text("No force applied", px([A[0], A[1] + 0.9]), {
            c: PAL.p,
            size: 15,
            it: false,
          });
        if (Math.abs(a) > 1e-6) {
          arc(A, 0.55, -a, 0, "#4b5563", 1.8);
          text(
            nm.theta + (m.thNum ? " = " + fmt(m.th) + "°" : ""),
            px([
              A[0] + 0.8 * Math.cos(-a / 2),
              A[1] + 0.8 * Math.sin(-a / 2) - 0.02,
            ]),
            { c: "#374151", size: 12, center: true },
          );
        }
        /* moments */
        const mom = (c, cw, col, sub, v, zero) => {
          const lab = (rest) => [
            { t: "M", size: 15 },
            { t: sub, size: 10, dy: 4 },
            { t: rest, size: 13, it: false },
          ];
          if (zero) {
            text(lab(" = 0"), px([c[0] + 0.3, c[1] + 0.55]), { c: col, bold: true });
            return;
          }
          const a0 = cw ? 200 * D : -20 * D,
            sw = 270 * D * (cw ? -1 : 1),
            q = [];
          for (let i = 0; i <= 36; i++) {
            const t = a0 + (sw * i) / 36;
            q.push(px([c[0] + 0.38 * Math.cos(t), c[1] + 0.38 * Math.sin(t)]));
          }
          x.beginPath();
          q.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
          x.strokeStyle = col;
          x.lineWidth = 3;
          x.stroke();
          const e = q[36],
            f = q[35],
            ang = Math.atan2(e[1] - f[1], e[0] - f[0]),
            hs = 11;
          x.beginPath();
          x.fillStyle = col;
          x.moveTo(e[0] + Math.cos(ang) * 5, e[1] + Math.sin(ang) * 5);
          x.lineTo(
            e[0] - Math.cos(ang - 0.5) * hs + Math.cos(ang) * 5,
            e[1] - Math.sin(ang - 0.5) * hs + Math.sin(ang) * 5,
          );
          x.lineTo(
            e[0] - Math.cos(ang + 0.5) * hs + Math.cos(ang) * 5,
            e[1] - Math.sin(ang + 0.5) * hs + Math.sin(ang) * 5,
          );
          x.closePath();
          x.fill();
          text(
            lab(m.all ? " = " + fmt(Math.abs(v)) + " N·m (" + (cw ? "CW" : "CCW") + ")" : ""),
            px([c[0] - 0.5, c[1] - 0.5]),
            { c: col, bold: true, right: true },
          );
        };
        const sO = m.all && !m.Tz ? sense(m.sol.MO) : "CW",
          sP = m.all && !m.Tz ? sense(m.sol.MP) : "CW",
          zO = m.Tz || (m.all && !sO),
          zP = m.Tz || (m.all && !sP);
        mom(O, sO !== "CCW", PAL.O, "O", m.all ? m.sol.MO : 0, zO);
        mom(P, sP !== "CCW", PAL.P, "P", m.all ? m.sol.MP : 0, zP);
        /* points */
        [
          [A, "A", [-15, -14]],
          [O, "O", [10, -15]],
          [P, "P", [0, 18]],
        ].forEach(([p, n, d]) => {
          const q = px(p);
          x.beginPath();
          x.arc(q[0], q[1], 4.5, 0, 7);
          x.fillStyle = PAL.ink;
          x.fill();
          text(n, [q[0] + d[0] - 5, q[1] + d[1]], {
            size: 19,
            bold: true,
            c: PAL.ink,
          });
        });
        x.restore();
      }
      class Report {
        constructor(lab) {
          this.lab = lab;
          this.W = 794;
          this.H = 1123;
          this.M = 44;
          this.S = 2;
          this.pages = [];
          this.addPage();
        }
        get cw() {
          return this.W - 2 * this.M;
        }
        stripe(y, h) {
          const cols = [PAL.T, PAL.p, PAL.s, PAL.P, PAL.O],
            w = this.W / cols.length;
          cols.forEach((c, i) => {
            this.x.fillStyle = c;
            this.x.fillRect(i * w, y, w + 1, h);
          });
        }
        addPage() {
          const c = document.createElement("canvas");
          c.width = this.W * this.S;
          c.height = this.H * this.S;
          const x = c.getContext("2d");
          x.scale(this.S, this.S);
          x.fillStyle = "#fff";
          x.fillRect(0, 0, this.W, this.H);
          this.pages.push(c);
          this.x = x;
          this.y = this.M;
          if (this.pages.length > 1) {
            this.stripe(0, 5);
            this.y = this.M + 6;
          }
        }
        room(h) {
          if (this.y + h > this.H - 62) this.addPage();
        }
        wrap(txt, font, maxW) {
          const x = this.x,
            out = [];
          x.font = font;
          String(txt)
            .split("\n")
            .forEach((par) => {
              let line = "";
              par.split(" ").forEach((w) => {
                const t = line ? line + " " + w : w;
                if (x.measureText(t).width > maxW && line) {
                  out.push(line);
                  line = w;
                } else line = t;
              });
              out.push(line);
            });
          return out;
        }
        para(txt, o = {}) {
          const size = o.size || 11,
            font = `${o.it ? "italic " : ""}${o.weight || 400} ${size}px ${o.font || UIF}`,
            lh = size * (o.lh || 1.55),
            left = o.x == null ? this.M : o.x,
            lines = this.wrap(txt, font, o.w || this.cw);
          lines.forEach((l) => {
            this.room(lh);
            this.x.font = font;
            this.x.fillStyle = o.c || PAL.ink;
            this.x.textBaseline = "top";
            this.x.fillText(l, left, this.y);
            this.y += lh;
          });
          this.y += o.gap == null ? 6 : o.gap;
        }
        heading(txt, col, need = 0) {
          this.room(52 + need);
          this.y += 8;
          const x = this.x;
          x.fillStyle = col;
          rrect(x, this.M, this.y + 1, 5, 20, 2.5);
          x.fill();
          x.font = `600 15px ${UIF}`;
          x.fillStyle = PAL.ink;
          x.textBaseline = "top";
          x.fillText(txt, this.M + 14, this.y + 1);
          this.y += 28;
          x.fillStyle = PAL.line;
          x.fillRect(this.M, this.y, this.cw, 1);
          this.y += 12;
        }
        banner() {
          const x = this.x,
            W = this.W;
          x.fillStyle = "#0b0b10";
          x.fillRect(0, 0, W, 150);
          let g = x.createRadialGradient(W - 80, 10, 10, W - 80, 10, 260);
          g.addColorStop(0, "rgba(182,156,255,.5)");
          g.addColorStop(1, "rgba(182,156,255,0)");
          x.fillStyle = g;
          x.fillRect(0, 0, W, 150);
          g = x.createRadialGradient(40, 150, 10, 40, 150, 260);
          g.addColorStop(0, "rgba(94,221,245,.35)");
          g.addColorStop(1, "rgba(94,221,245,0)");
          x.fillStyle = g;
          x.fillRect(0, 0, W, 150);
          this.stripe(150, 5);
          x.textBaseline = "top";
          x.fillStyle = "#5eddf5";
          x.font = `600 11px ${UIF}`;
          x.fillText("Mechanics studio · Interactive lab report", this.M, 32);
          x.fillStyle = "#fff";
          x.font = `600 30px ${UIF}`;
          x.fillText("Moment of a Force", this.M, 54);
          x.fillStyle = "#b9bcc9";
          x.font = `400 13px ${UIF}`;
          x.fillText(
            "Chapter 2: Force Systems  ·  Q. 2/45  ·  Page No. 46",
            this.M,
            100,
          );
          x.textAlign = "right";
          x.fillStyle = "#8d90a0";
          x.font = `400 10px ${UIF}`;
          x.fillText(
            "Generated " +
              new Date().toLocaleString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            W - this.M,
            34,
          );
          x.textAlign = "left";
          this.y = 150 + 5 + 22;
        }
        info() {
          const L = this.lab,
            cv = [...L.root.querySelectorAll(".credential-value")],
            links = [...L.root.querySelectorAll(".credential-value a")].map(
              (a) => a.href,
            ),
            x = this.x,
            h = 98,
            half = this.cw / 2;
          this.name = (cv[0] && cv[0].textContent.trim()) || "Student";
          this.srn = (cv[1] && cv[1].textContent.trim()) || "";
          this.room(h + 10);
          rrect(x, this.M, this.y, this.cw, h, 10);
          x.fillStyle = "#f8fafc";
          x.fill();
          x.strokeStyle = PAL.line;
          x.lineWidth = 1;
          x.stroke();
          [
            ["Student name", this.name, 0, 0, PAL.O],
            ["SRN", this.srn, 1, 0, PAL.P],
            ["Portfolio", links[0] || "", 0, 1, PAL.p],
            ["GitHub repository", links[1] || "", 1, 1, PAL.s],
          ].forEach(([k, v, c, r, col]) => {
            const X = this.M + 18 + c * half,
              Y = this.y + 14 + r * 40;
            x.fillStyle = col;
            x.fillRect(X - 10, Y + 1, 3, 28);
            x.textBaseline = "top";
            x.fillStyle = PAL.mut;
            x.font = `600 9px ${UIF}`;
            x.fillText(k, X, Y);
            x.fillStyle = PAL.ink;
            x.font = `600 ${r ? 10 : 13}px ${UIF}`;
            x.fillText(v, X, Y + 13);
          });
          this.y += h + 8;
        }
        inputsTable() {
          const L = this.lab,
            x = this.x,
            rows = [
              ["T", "Tension (force magnitude)", PAL.T],
              ["r", "Radius (lever arm)", PAL.p],
              ["theta", "θ – angle of AO below horizontal", PAL.O],
              ["alpha", "α – angle of T above horizontal", PAL.P],
            ],
            rh = 28;
          this.room(rh * 5 + 8);
          x.fillStyle = "#111827";
          rrect(x, this.M, this.y, this.cw, rh, 6);
          x.fill();
          x.fillStyle = "#fff";
          x.font = `600 10px ${UIF}`;
          x.textBaseline = "middle";
          x.fillText("Quantity", this.M + 30, this.y + rh / 2);
          x.fillText("Value used", this.M + 330, this.y + rh / 2);
          x.fillText("Input type", this.M + 540, this.y + rh / 2);
          this.y += rh;
          rows.forEach(([k, desc, col], i) => {
            const p = L.S[k],
              Y = this.y;
            if (i % 2 === 0) {
              x.fillStyle = "#f8fafc";
              x.fillRect(this.M, Y, this.cw, rh);
            }
            x.fillStyle = col;
            x.beginPath();
            x.arc(this.M + 14, Y + rh / 2, 4.5, 0, 7);
            x.fill();
            x.textBaseline = "middle";
            x.fillStyle = PAL.ink;
            x.font = `500 11px ${UIF}`;
            x.fillText(desc, this.M + 30, Y + rh / 2);
            x.font = `600 11.5px ${UIF}`;
            x.fillText(
              p.mode === "num"
                ? fmt(p.val) + (isAng(k) ? "°" : " " + DEF[k].unit)
                : p.name + "  (symbolic)",
              this.M + 330,
              Y + rh / 2,
            );
            x.fillStyle = p.mode === "num" ? "#15803d" : "#b45309";
            x.font = `600 10px ${UIF}`;
            x.fillText(
              p.mode === "num" ? "Numeric" : "Symbolic",
              this.M + 540,
              Y + rh / 2,
            );
            this.y += rh;
          });
          x.fillStyle = PAL.line;
          x.fillRect(this.M, this.y, this.cw, 1);
          this.y += 10;
        }
        resultCards() {
          const L = this.lab,
            q = (s) => L.q(s).textContent.trim(),
            gap = 14,
            w = (this.cw - gap) / 2,
            items = [
              { n: "Moment about O", v: q("#vO"), s: q("#sO"), f: q("#fO"), c: PAL.O, bg: "#faf7ff" },
              { n: "Moment about P", v: q("#vP"), s: q("#sP"), f: q("#fP"), c: PAL.P, bg: "#f2fcfe" },
            ];
          items.forEach(
            (it) => (it.fl = this.wrap(it.f, `400 10px ${MONO}`, w - 30)),
          );
          const h = 96 + Math.max(...items.map((i) => i.fl.length)) * 14;
          this.room(h + 10);
          items.forEach((it, i) => {
            const x = this.x,
              X = this.M + i * (w + gap),
              Y = this.y;
            rrect(x, X, Y, w, h, 10);
            x.fillStyle = it.bg;
            x.fill();
            x.strokeStyle = it.c + "55";
            x.lineWidth = 1;
            x.stroke();
            x.fillStyle = it.c;
            rrect(x, X, Y, 6, h, 3);
            x.fill();
            x.textBaseline = "top";
            x.font = `600 11px ${UIF}`;
            x.fillStyle = PAL.mut;
            x.fillText(it.n, X + 20, Y + 14);
            x.font = `700 25px ${UIF}`;
            x.fillStyle = it.c;
            x.fillText(it.v, X + 20, Y + 32);
            x.font = `600 12px ${UIF}`;
            x.fillStyle = PAL.ink;
            x.fillText(it.s, X + 20, Y + 64);
            x.font = `400 10px ${MONO}`;
            x.fillStyle = "#4b5563";
            it.fl.forEach((l, j) => x.fillText(l, X + 20, Y + 86 + j * 14));
          });
          this.y += h + 12;
        }
        legend() {
          const x = this.x,
            items = [
              [PAL.T, "T"],
              [PAL.c, "T cosα"],
              [PAL.s, "T sinα"],
              [PAL.p, "T sin(α+θ)"],
              [PAL.O, "Moment about O"],
              [PAL.P, "Moment about P"],
            ];
          this.room(24);
          let X = this.M;
          x.textBaseline = "middle";
          x.font = `400 10.5px ${UIF}`;
          items.forEach(([c, t]) => {
            const w = x.measureText(t).width;
            x.fillStyle = c;
            rrect(x, X, this.y + 5, 16, 5, 2.5);
            x.fill();
            x.fillStyle = PAL.mut;
            x.fillText(t, X + 22, this.y + 8);
            X += w + 46;
          });
          this.y += 24;
        }
        async steps() {
          const st = this.lab.steps || [],
            cols = ["#2563eb", "#16a34a", PAL.O, PAL.P, PAL.p];
          for (let i = 0; i < st.length; i++) {
            const [title, tex] = st[i];
            let im = null;
            try {
              im = await texToImage(tex, 17);
            } catch (e) {
              console.warn("Equation render failed", e);
            }
            const maxW = this.cw - 28,
              sc = im ? Math.min(1, maxW / im.w) : 1,
              ih = im ? im.h * sc : 0,
              boxH = im ? ih + 22 : 0;
            this.room(26 + boxH + 10);
            this.para(title, { weight: 600, size: 11.5, c: cols[i % cols.length], gap: 4 });
            if (im) {
              const x = this.x;
              rrect(x, this.M, this.y, this.cw, boxH, 8);
              x.fillStyle = "#f8fafc";
              x.fill();
              x.strokeStyle = PAL.line;
              x.lineWidth = 1;
              x.stroke();
              x.fillStyle = cols[i % cols.length];
              rrect(x, this.M, this.y, 4, boxH, 2);
              x.fill();
              x.drawImage(
                im.img,
                this.M + (this.cw - im.w * sc) / 2,
                this.y + 11,
                im.w * sc,
                ih,
              );
              this.y += boxH + 10;
            } else this.para(tex, { font: MONO, size: 9, c: PAL.mut });
          }
        }
        footers() {
          const n = this.pages.length;
          this.pages.forEach((c, i) => {
            const x = c.getContext("2d");
            x.fillStyle = PAL.line;
            x.fillRect(this.M, this.H - 44, this.cw, 1);
            x.textBaseline = "top";
            x.fillStyle = PAL.mut;
            x.font = `400 9px ${UIF}`;
            x.textAlign = "left";
            x.fillText(
              "Moment of a Force Lab  ·  " + this.name + "  ·  " + this.srn,
              this.M,
              this.H - 34,
            );
            x.textAlign = "right";
            x.fillText("Page " + (i + 1) + " of " + n, this.W - this.M, this.H - 34);
            x.textAlign = "left";
          });
        }
        async compose() {
          const L = this.lab,
            all = L.allNum(),
            Tz = L.S.T.mode === "num" && L.S.T.val === 0;
          this.banner();
          this.info();
          this.heading("Problem statement", PAL.T);
          this.para(
            "Determine the moments of the tension T about the point P and about the point O.",
            { weight: 600, size: 12, gap: 4 },
          );
          this.para(
            "The tension T acts at point A on the straight edge of a half-disk of radius r, at angle α above the horizontal. The edge through A and O makes angle θ below the horizontal at A, and the half-disk rests on the ground at P, directly below O (OP = r).",
            { c: "#374151", size: 10.5 },
          );
          this.heading("Given values", PAL.p);
          this.inputsTable();
          this.heading("2D force diagram", PAL.P, 400);
          const dh = 360;
          this.room(dh + 36);
          const x = this.x;
          rrect(x, this.M, this.y, this.cw, dh, 10);
          x.fillStyle = "#fff";
          x.fill();
          x.strokeStyle = PAL.line;
          x.lineWidth = 1.2;
          x.stroke();
          drawDiagram2D(x, this.M + 1, this.y + 1, this.cw - 2, dh - 2, {
            T: L.val("T"),
            r: L.val("r"),
            th: L.val("theta"),
            al: L.val("alpha"),
            Tnum: L.S.T.mode === "num",
            rNum: L.S.r.mode === "num",
            thNum: L.S.theta.mode === "num",
            alNum: L.S.alpha.mode === "num",
            Tz,
            all,
            sol: L.sol,
            nm: {
              T: L.nm("T"),
              r: L.nm("r"),
              theta: L.nm("theta"),
              alpha: L.nm("alpha"),
            },
          });
          this.y += dh + 10;
          this.legend();
          this.heading("Results", PAL.O, 150);
          this.resultCards();
          this.para(
            "General result (CW positive):   about O:  T r sin(α + θ)     about P:  T r [cos α + sin(α + θ)]",
            { font: SERIF, it: true, size: 12, gap: 4 },
          );
          this.para(L.q("#ver").textContent.trim(), {
            size: 10,
            c: L.q("#ver").classList.contains("ok") ? "#15803d" : PAL.mut,
          });
          this.heading("Step-by-step solution", PAL.s, 110);
          await this.steps();
          this.heading("Notes", PAL.c);
          const notes = [
            "Sign convention: counter-clockwise is positive internally; results are reported as CW / CCW.",
            "Negative T reverses the direction of the force arrow; angles are in degrees.",
          ];
          if (!all)
            notes.push(
              "Symbolic input: general expressions are shown and no numeric result is produced. The diagram uses nominal values (T = 100 N, r = 1 m, θ = 35°, α = 20°) for any symbolic quantity.",
            );
          const nt = L.q("#note").textContent.trim();
          if (nt) notes.push(nt);
          notes.forEach((t) =>
            this.para("•  " + t, { size: 10, c: "#374151", gap: 3 }),
          );
          this.footers();
        }
        toPDF(jsPDF) {
          const pdf = new jsPDF({
            unit: "mm",
            format: "a4",
            orientation: "portrait",
            compress: true,
          });
          this.pages.forEach((c, i) => {
            if (i) pdf.addPage();
            pdf.addImage(c.toDataURL("image/jpeg", 0.93), "JPEG", 0, 0, 210, 297, undefined, "FAST");
          });
          pdf.setProperties({
            title: "Moment of a Force – Chapter 2, Q 2/45 – Report",
            author: this.name,
            subject: "Moments of tension T about points O and P",
          });
          return pdf;
        }
      }
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