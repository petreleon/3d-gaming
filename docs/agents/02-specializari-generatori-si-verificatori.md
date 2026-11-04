# Anexa 02 — Catalogul Specializărilor și Șabloanele Oficiale de „Fișe de Specializare” pentru Generatori și Verificatori / Evaluatori

Un principiu fundamental al arhitecturii **3D Gaming** (`/Users/petreleon/code/3d-gaming`) este că **Generatorii și Verificatorii (Evaluatorii) primesc întotdeauna specializarea exactă a aspectului sau a stratului arhitectural de la Subagentul Coordonator care îi invocă**.

Acest document oferă matricea completă a perechilor de specializări și șabloanele oficiale, gata de copiat (*copy-paste ready*), atât pentru **Modelarea 3D și Animații**, cât și pentru **Arhitectura Software în 5 Straturi**.

---

## 1. Matricea Completă a Perechilor de Specializări (Modelare 3D, Animații & Arhitectură Software în 5 Straturi)

| Categorie & Domeniu | Subagent Generator & Specializarea Injectată de Coordonator | Subagent Verificator / Evaluator & Specializarea Injectată de Coordonator |
| :--- | :--- | :--- |
| **3D #1. Geometrie Bază & Stabilitate Mecanică (`baseGeometry.ts`)** | `generator-modelare-3d`:<br>• Contact coplanar exact cu masa la $\min(y) = 0.000\text{ mm}$<br>• Talpă lățită anti-răsturnare pe axa $X$ și extensie inferioară de echilibrare<br>• Punte mediană continuă $C^1/C^2$ între pilonii față și spate | `verificator-modelare-3d`:<br>• Audit matematic pe coordonatele vârfurilor bazei ($\min(y) === 0$)<br>• Inspecție vizuală în `front`, `side_profile`, `bottom/top` și `wireframe` pentru lățimea bazei și absența intersecțiilor |
| **3D #2. Sprijin Frontal & Profil Mecanic Exact (`frontSupportGeometry.ts`)** | `generator-modelare-3d`:<br>• Fidelitate 100% față de profilul cerut: lăcaș dreptunghiular deschis **`\|_\|`** cu podea 100% orizontală plată (`_`, $\frac{\partial y}{\partial x}=0$) și pereți laterali verticali (`\|`)<br>• Interdicție absolută a șeii în `V` sau a curburii parabolice pe fundul lăcașului | `verificator-modelare-3d`:<br>• Verificare analitică și pe mesh a planeității podelei lăcașului la $y = y_{\text{floor}}$<br>• Inspecție vizuală `close-up` și `wireframe` pentru a respinge orice profil în `V` |
| **3D #3. Opritor Posterior & Punte Superioară Închisă (`rearStopperGeometry.ts`)** | `generator-modelare-3d`:<br>• Perete opritor posterior + **punte/capotă solidă închisă în partea superioară** (`Upper Stopper Roof Bridge`)<br>• Tunel deschis pentru intrarea cozii și plafon la cota exactă $y_{\text{roof\_bottom}}$ | `verificator-modelare-3d`:<br>• Audit al deschiderii tunelului posterior, al grosimii punții superioare și al cusăturii topologice cu pereții laterali |
| **3D #4. Obiecte de Interacțiune / Accesorii / Sub-Componente (`accessoriesGeometry.ts`)** | `generator-modelare-3d`:<br>• Modelare 3D autentică (ex. `spoon`, `fork` cu 4 dinți, `knife`, sau frunză/codiță/caliciu)<br>• Atașare pe elipsoid $\frac{x^2}{a^2}+\frac{y^2}{b^2}+\frac{z^2}{c^2}=1$ sau contact exact fără clipping pe suport<br>• Gardă igienică la sol $\ge 15\text{ mm}$ și oprirea cozii sub plafonul superior | `verificator-modelare-3d`:<br>• Verificare matematică zero-clipping între accesorii și suport<br>• Capturi multi-unghi pentru fiecare accesoriu în parte (`spoon`, `fork`, `knife`) în `material` și `wireframe` |
| **3D #5. Rigging, Cinematică FK/IK & Animații 3D** | `generator-animatii-3d`:<br>• Pivoți anatomici centrați în `(0,0,0)` cu capsule de rază identică<br>• Arce naturale, anticipație, squash & stretch, follow-through / overlap<br>• Contact ferm cu solul ($y=0$, zero foot-sliding) și buclă închisă la $t=T \equiv t=0$<br>• Hook `window.__gameStage.setAuditPose({ action, t, ... })` | `verificator-animatii-3d`:<br>• **Spargerea obligatorie a animației într-o Matrice de Imagini ($R \times C = 4 \times 4$)** prin `scripts/capture_animation_matrix.mjs` sau `scripts/blender_animation_matrix.py`<br>• Inspecția vizuală cu `view_file` a fiecărei celule `#00 .. #15` din minimum 2 unghiuri |
| **3D #6. Shadere PBR/SSS, Iluminare de Studio & Cameră (`materials.ts`, `main.ts`)** | `subagent-generator` (specializat în PBR/Shadere):<br>• Texturi procedurale FBM multi-octavă $\ge 1024^2$ (zero dungi sintetice $\sin(N\theta)$)<br>• `MeshPhysicalMaterial` cu *Subsurface Scattering* / *clearcoat* / *roughnessMap*<br>• Iluminare în 3 puncte cu *Rim Light* cald și umbră de contact moale | `verificator-modelare-3d`:<br>• Audit estetic draconic în **15 criterii** și **Tabelul de Scorare Vizuală în 5 Axe** (prag minim `9.5 / 10` pe fiecare axă)<br>• Verificare în 6+ unghiuri (`front`, `three_quarter`, `side_profile`, `left_profile`, `back`, `top`) |
| **SW #1. Stratul Software #1: Domain Types, Algebraic Contracts & Invariants (`types.ts`, `contracts.ts`)** | `generator-gameplay-cod` (specializat în Type-Driven Design):<br>• *Branded Types* (`Millimeters`, `Radians`, `Seconds`)<br>• *Discriminated Unions* exhaustive și structuri `Readonly<T>`<br>• Tipul algebric `Result<T, E>` și constructori cu validare de invariant<br>• Zero dependențe de Three.js, DOM sau I/O | `verificator-gameplay-cod` (Evaluator SW #1):<br>• Audit de tipuri (`tsc --noEmit` sub `strict: true`)<br>• Verificarea imposibilității reprezentării stărilor ilegale<br>• Penalizare imediată sub `7.0/10` pentru orice `any`, `as unknown as T` sau `enum` nesigur |
| **SW #2. Stratul Software #2: Pure Functional Core, State Machine & Physics (`engine.ts`, `stateMachine.ts`)** | `generator-gameplay-cod` (specializat în Functional Core):<br>• Funcții 100% pure $f(\text{state}, \text{command}, \Delta t) \to \text{Result}\langle(\text{newState}, \text{events}), E\rangle$<br>• Pas de timp determinist cu clamp pe $\Delta t$<br>• Exhaustivitate garantată cu `assertNever(x: never): never`<br>• Zero mutații globale și zero apeluri DOM/WebGL | `verificator-gameplay-cod` (Evaluator SW #2):<br>• Audit al purității referențiale și al complexității algoritmice<br>• Verificarea tratării tuturor cazurilor limită (`dt = 0`, `NaN`, `Infinity`, coliziuni tangente)<br>• Verificarea absenței importurilor de infrastructură/UI |
| **SW #3. Stratul Software #3: Imperative Infrastructure, I/O & `.3mf` Serialization (`io.ts`, `export3mf.ts`)** | `generator-gameplay-cod` (specializat în Infrastructură & CAD I/O):<br>• Cusătură topologică 2-manifold watertight (`boundaryEdgeCount === 0`, `nonManifoldEdgeCount === 0`, `rawSignedVolume > 0`)<br>• Generare conformă OPC/ZIP `.3mf` cu XML valid și unități în milimetri<br>• Parsare defensivă la graniță și tratarea explicită a erorilor I/O | `verificator-gameplay-cod` (Evaluator SW #3):<br>• Verificarea matematică Euler-Poincaré $\chi = V - E + F$ și a orientării normalelor<br>• Verificarea existenței fizice și a validității arhivei `.3mf` pe disc |
| **SW #4. Stratul Software #4: WebGL Presentation Pipeline, Zero-Allocation Loop & UI (`view.ts`, `main.ts`)** | `subagent-generator` (specializat în Real-Time WebGL & UI):<br>• Pre-alocarea vectorilor/matricilor/quaternionilor în afara buclei `requestAnimationFrame` (*Zero-Allocation Loop*)<br>• Funcție `disposeHierarchy()` deterministă pentru geometrii, materiale și texturi<br>• Expunerea `window.__gameStage.setAuditPose` și `getStateSnapshot()` | `verificator-gameplay-cod` + `verificator-modelare-3d` (Evaluator SW #4):<br>• Audit static și dinamic pentru zero `new THREE.*` în bucla de randare<br>• Verificarea curățării memoriei GPU (`renderer.info.memory`)<br>• Audit vizual și funcțional al hook-urilor de inspecție |
| **SW #5. Stratul Software #5: Adversarial E2E, Property-Based & Mutation-Grade Testing (`*.test.ts`)** | `generator-gameplay-cod` (specializat în Testare Adversarială):<br>• Teste Vitest de grad militar pe invarianți geometrici, topologici și de stare<br>• Testarea valorilor de graniță și a intrărilor invalide<br>• Zero teste formale (`toBeDefined()` fără verificarea valorilor exacte) | `verificator-gameplay-cod` (Evaluator SW #5):<br>• Audit anti-greenwashing al fiecărui test (`vitest run`)<br>• Test de mutație mentală: verifică dacă inversarea unei condiții din `engine.ts` este prinsă garantat de teste |

---

## 2. Șabloanele Oficiale de „Fișe de Specializare” pentru Modelare 3D și Animații (Gata de Copiat)

### Șablonul 2.1: Fișa de Specializare pentru `generator-modelare-3d` & `verificator-modelare-3d`

```markdown
# FIȘĂ DE SPECIALIZARE — MODELARE & GEOMETRIE 3D (TRANSMISĂ DE SUBAGENTUL COORDONATOR)
- **Aspectul 3D Alocat:** [ex. Aspectul 3D #2 — Geometria Sprijinului Frontal cu Profil Dreptunghiular Deschis `|_|`]
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [`src/<obiect>/<aspect>.ts` — INTERZIS să modifici alte fișiere!]
- **Contract Geometric Comun (în milimetri / unități de scenă):**
  - Planul mesei: $y = 0.000\text{ mm}$ ($\min(y) === 0.000\text{ mm}$).
  - Cote de racordare cu aspectele vecine: [ex. $z \in [+25\text{ mm}, +40\text{ mm}]$, lățime interioară lăcaș $W_{\text{slot}} = 18.0\text{ mm}$, cota podelei $y_{\text{floor}} = 22.0\text{ mm}$, înălțime pereți laterali $h_{\text{wall}} = 14.0\text{ mm}$].

## CELE 6 LEGI OBLIGATORII ALE GEOMETRIEI 3D:
1. **Zero Primitive Brute Nesculptate:** Este interzisă folosirea de `BoxGeometry`, `SphereGeometry` sau `CylinderGeometry` brute pentru forme finale; folosește profile parametrizate, `ExtrudeGeometry` cu bevel controlat, `LatheGeometry` sau lofting topologic 2-manifold.
2. **Atașare Matematică Exactă / Cusătură Topologică 1-la-1 (Zero Floating Parts):**
   - Pe un elipsoid cu semiaxele $(a, b, c)$, orice punct de atașare $(x, y, z)$ trebuie să satisfacă $\frac{(x-x_c)^2}{a^2} + \frac{(y-y_c)^2}{b^2} + \frac{(z-z_c)^2}{c^2} = 1$ și să fie orientat de-a lungul normalei exterioare $\vec{n} \propto \left(\frac{x-x_c}{a^2}, \frac{y-y_c}{b^2}, \frac{z-z_c}{c^2}\right)$.
   - Pentru modele CAD destinate printării 3D (`.3mf`), secțiunile adiacente trebuie cusute topologic vârf-cu-vârf (fără fețe interioare îngropate și fără muchii deschise: `boundaryEdgeCount === 0`, `nonManifoldEdgeCount === 0`).
3. **Simetrie Radială & Bilaterală fără Euler Twist:** Folosește grupuri-părinte pentru rotația pe o singură axă și aplică înclinarea geometriei-copil strict în planul local, sau construiește repere ortonormale Frenet-Serret $(\vec{T}, \vec{N}, \vec{B})$.
4. **Continuitate $C^1 / C^2$ la Articulații și Racordări:** Segmentele conectate trebuie să aibă tangente continue și raze identice în punctul de joncțiune, fără ciupituri la poli (*pole pinching*).
5. **Fidelitate 100% a Profilului Mecanic / Botanic Cerut:**
   - Dacă cerința specifică un lăcaș frontal în formă de **`|_|`**, podeaua lăcașului trebuie să fie 100% orizontală și plată ($\frac{\partial y}{\partial x} = 0$ pe tot intervalul $x \in [-W_{\text{slot}}/2, +W_{\text{slot}}/2]$), iar pereții laterali verticali (`|`). Este strict interzisă înlocuirea profilului `|_|` cu o formă în `V` sau cu o șa concavă!
   - Dacă cerința specifică **oprire în partea superioară la coadă**, opritorul posterior trebuie să includă o punte superioară solidă (`Upper Stopper Roof Bridge`) care închide tunelul pe deasupra.
6. **Zero Z-Fighting & Normale Orientate spre Exterior:** Suprafețele suprapuse vizual se decalează de-a lungul normalei cu minimum $2\text{–}5\text{ mm}$ (sau se unifică topologic), iar volumul semnat al fiecărei componente închise trebuie să fie strict pozitiv (`rawSignedVolume > 0`).

## PROTOCOLUL DE VERIFICARE PERECHE (`verificator-modelare-3d`):
- Verificare analitică și prin teste (`npx tsc --noEmit`, `npx vitest run`) a invarianților geometrici.
- Captură și inspecție vizuală cu `view_file` din minimum **6 unghiuri** (`front`, `three_quarter`, `side_profile`, `left_profile`, `back`, `top` + `close-up`) în mod `material` și `wireframe`.
- Evaluare prin **Cele 15 Criterii Draconice** și **Tabelul de Scorare Vizuală în 5 Axe** (prag minim obligatoriu: **`9.5 / 10`** pe fiecare axă).
```

---

### Șablonul 2.2: Fișa de Specializare pentru `generator-animatii-3d` & `verificator-animatii-3d`

```markdown
# FIȘĂ DE SPECIALIZARE — RIGGING & ANIMAȚII 3D (TRANSMISĂ DE SUBAGENTUL COORDONATOR)
- **Animația / Acțiunea Alocată:** [ex. Ciclul `walk` / `turntable` / `inspect_cutlery`, durata $T = 2.0\text{ s}$]
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [`src/<modul>/animation.ts` — INTERZIS să modifici alte fișiere!]
- **Legi Cinematice și Anatomice Obligatorii:**
  1. **Pivoți Anatomici Exact în `(0, 0, 0)`:** Fiecare grup articular (`shoulder`, `elbow`, `hip`, `knee`, `ankle`, `wrist`, `neck`) își are originea exact în centrul geometric al sferei de articulație; geometria segmentului se translatează cu $-L/2$ de-a lungul axei oaselor.
  2. **Arce Naturale, Defazaj Armonic & Follow-Through:** Mișcările membrelor și ale obiectelor urmează traiectorii curbe netede ($C^2$), cu anticipație, *squash & stretch* subtil și *overlapping action* (defazaj $\Delta\phi$ pe segmentele secundare: antebraț, coadă, frunză, pelerină).
  3. **Contact Ferm cu Solul ($y = 0.000$) & Zero Foot-Sliding:** În faza de sprijin, punctul cel mai de jos al modelului rămâne ancorat la $y = 0.000$ (fără penetrarea podelei $y < 0$ și fără plutire $y > 0$).
  4. **Închiderea Ciclului ($t = T \equiv t = 0$):** Pentru animațiile periodice, pozițiile și derivatele la $t = T$ trebuie să coincidă exact cu cele de la $t = 0$.
  5. **Hook Determinist de Inspecție Temporală (`window.__gameStage.setAuditPose`):** Aplicația trebuie să poziționeze instantaneu și determinist scena la orice timp $t \in [0, T]$ fără a depinde de `requestAnimationFrame`.
- **Protocolul de Verificare Pereche (`verificator-animatii-3d`):**
  - Animația este spartă obligatoriu într-o **Matrice de Imagini $4 \times 4$ (16 cadre echidistante)** prin `scripts/capture_animation_matrix.mjs` (sau `scripts/blender_animation_matrix.py`) din minimum **2 unghiuri ortogonale** (`three_quarter` și `side_profile`).
  - Fiecare celulă `#00 .. #15` este inspectată vizual cu `view_file`, iar scorul pe fiecare axă trebuie să fie $\ge 9.5 / 10$.
```

---

## 3. Șabloanele Oficiale de „Fișe de Specializare” pentru Arhitectură Software (Generator–Evaluator pe cele 5 Straturi)

### Șablonul 3.1: Stratul Software #1 & #2 — Domain Model, Contracte Algebrice & Pure Functional Core (`types.ts`, `contracts.ts`, `engine.ts`)

```markdown
# FIȘĂ DE SPECIALIZARE — STRATUL SOFTWARE #1 & #2: DOMAIN MODEL & PURE FUNCTIONAL CORE
- **Rol & Domeniu:** Generator / Evaluator Arhitectură Software — Modelul de Domeniu, Tipuri Algebrice și Nucleul Funcțional Pur
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [`src/<modul>/types.ts`, `src/<modul>/contracts.ts`, `src/<modul>/engine.ts`]
- **Legi de Inginerie Software Obligatorii:**
  1. **Type-Driven Design & „Make Illegal States Unrepresentable”:**
     - Definește *Branded Types* nominale pentru toate mărimile fizice și geometrice (`Millimeters`, `Radians`, `Seconds`, `PositiveInt`) cu funcții constructor care returnează `Result<BrandedType, ValidationError>`.
     - Modelează toate stările și comenzile prin *Discriminated Unions* imutabile (`readonly kind: '...'`), cu proprietăți marcate `readonly`.
     - **Interdicție absolută:** zero `any`, zero `as unknown as T`, zero `enum` numeric nesigur, zero `!` (non-null assertion) nejustificat.
  2. **Pure Functional Core (Zero Efecte Secundare):**
     - Toate funcțiile din `engine.ts` trebuie să fie matematic pure: pentru același `(state, command, dt)` returnează întotdeauna același rezultat, fără a muta argumentele de intrare.
     - **Zero dependențe de infrastructură sau prezentare:** este strict interzis importul lui `three`, `fs`, `path`, `window`, `document` sau `localStorage` în `types.ts`, `contracts.ts` și `engine.ts`.
  3. **Determinism Matematic și Exhaustivitate:**
     - Orice `switch` pe o uniune discriminată trebuie să aibă ramura `default: return assertNever(x);`.
     - Orice pas de timp $\Delta t$ este validat și limitat superior ($\Delta t_{\text{clamped}} = \min(\max(\Delta t, 0), \Delta t_{\max})$) și verificat împotriva `NaN` / `Infinity`.
- **Protocolul Evaluatorului Pereche (`verificator-gameplay-cod`):**
  - Verificare `npx tsc --noEmit` și audit linie-cu-linie al purității funcționale și al completitudinii tipurilor.
  - Scorare pe cele 5 Axe de Arhitectură Software (prag minim `9.5 / 10` pe fiecare axă).
```

---

### Șablonul 3.2: Stratul Software #3 — Infrastructură, Serializare `.3mf` & Topologie 2-Manifold (`io.ts`, `export3mf.ts`)

```markdown
# FIȘĂ DE SPECIALIZARE — STRATUL SOFTWARE #3: INFRASTRUCTURĂ, I/O & EXPORT CAD `.3MF`
- **Rol & Domeniu:** Generator / Evaluator Arhitectură Software — Infrastructură, Validare Topologică 2-Manifold și Serializare `.3mf`
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [`src/<modul>/io.ts`, `src/export3mf.ts`]
- **Legi de Inginerie Software & Topologie CAD Obligatorii:**
  1. **Integritate Topologică 2-Manifold Watertight:**
     - Înainte de orice serializare `.3mf`, mesh-ul unificat trebuie auditat algoritmic:
       - `boundaryEdgeCount === 0` (nicio muchie cu un singur triunghi adiacent);
       - `nonManifoldEdgeCount === 0` (fiecare muchie este partajată de exact 2 triunghiuri cu orientări opuse ale semi-muchiilor $(u \to v)$ și $(v \to u)$);
       - `degenerateTriangleCount === 0` (aria fiecărui triunghi $> 10^{-9}\text{ mm}^2$);
       - `rawSignedVolume > 0` (calculat cu suma volumelor tetraedrelor semnate $\frac{1}{6}\sum (\vec{v}_0 \times \vec{v}_1)\cdot \vec{v}_2 > 0$, fără `Math.abs()` care ar masca normalele inversate!).
  2. **Conformitate cu Specificația OPC / 3MF Core Specification:**
     - Arhiva `.3mf` trebuie să fie un container ZIP valid conținând `[Content_Types].xml`, `_rels/.rels` și `3D/3dmodel.model` cu `<model unit="millimeter">`, coordonate finite de înaltă precizie și indici 0-based valizi.
  3. **Parsare Defensivă & Tratarea Explicită a Erorilor la Graniță:**
     - Toate operațiile de I/O și serializare returnează `Result<ExportArtifact, InfrastructureError>`, fără excepții necontrolate și fără scurgeri de descriptori de fișiere.
- **Protocolul Evaluatorului Pereche (`verificator-gameplay-cod`):**
  - Verificarea existenței fizice și a dimensiunii fișierului `.3mf` generat pe disc + rularea testelor de audit topologic.
```

---

### Șablonul 3.3: Stratul Software #4 — Prezentare WebGL/Three.js, Zero-Allocation Loop & `dispose()` (`view.ts`, `main.ts`)

```markdown
# FIȘĂ DE SPECIALIZARE — STRATUL SOFTWARE #4: PREZENTARE WEBGL/THREE.JS, ZERO-ALLOCATION LOOP & UI
- **Rol & Domeniu:** Generator / Evaluator Arhitectură Software — Pipeline de Randare WebGL/Three.js, Gestiunea Memoriei GPU și Interfață
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [`src/<modul>/view.ts`, `src/main.ts`]
- **Legi de Inginerie Real-Time WebGL Obligatorii:**
  1. **Disciplina Zero-Allocation în Bucla de Randare (`requestAnimationFrame`):**
     - Este **strict interzisă** instanțierea de obiecte noi (`new THREE.Vector3()`, `new THREE.Matrix4()`, `new THREE.Quaternion()`, `new THREE.Euler()`, `new THREE.Color()`, `new Float32Array()`, `.clone()`) în interiorul funcției `animate()` / `renderTick()`.
     - Toate obiectele matematice auxiliare se pre-alocă o singură dată la nivel de modul/clasă (`const _tmpVec3 = new THREE.Vector3();`) și se reutilizează prin `.set()`, `.copy()`.
  2. **Eliberarea Deterministă a Resurselor GPU (`disposeHierarchy`):**
     - La schimbarea modului de vizualizare, reconstrucția unui mesh sau demontarea scenei, toate `BufferGeometry`, `Material` (inclusiv tablourile de materiale) și toate texturile atașate (`map`, `normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`, `emissiveMap`) trebuie eliberate explicit prin `.dispose()`.
  3. **Contractul de Audit Determinist (`window.__gameStage`):**
     - Expune obligatoriu `window.__gameStage.setAuditPose(cfg: AuditPoseConfig)` (care actualizează sincron starea, camera, ținta și forțează `renderer.render(scene, camera)`) și `window.__gameStage.getStateSnapshot()` (care returnează un snapshot imutabil al stării curente pentru verificări E2E).
- **Protocolul Evaluatorului Pereche (`verificator-gameplay-cod` + `verificator-modelare-3d`):**
  - Audit static/dinamic al buclei `requestAnimationFrame`, verificarea `dispose()` și audit vizual multi-unghi (6+ unghiuri + matrice $4 \times 4$).
```

---

### Șablonul 3.4: Stratul Software #5 — Testare Adversarială & Mutation-Grade (`*.test.ts`)

```markdown
# FIȘĂ DE SPECIALIZARE — STRATUL SOFTWARE #5: TESTARE ADVERSARIALĂ, PROPERTY-BASED & MUTATION-GRADE
- **Rol & Domeniu:** Generator / Evaluator Arhitectură Software — Suita de Teste Vitest Anti-Greenwashing
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [`src/<modul>/<modul>.test.ts`]
- **Legi de Testare Adversarială Obligatorii:**
  1. **Interdicția Testelor Superficiale („Zero Greenwashing Tests”):**
     - Sunt strict interzise testele care verifică doar `expect(result).toBeDefined()` sau `expect(mesh.children.length).toBeGreaterThan(0)` fără a verifica matematic coordonatele, topologia și invarianții de domeniu.
  2. **Testarea Invarianților Geometrici, Topologici și de Domeniu:**
     - Verifică analitic și pe mesh: $\min(y) = 0.000\text{ mm}$, planeitatea exactă a podelei lăcașului `|_|`, cota plafonului opritorului superior, garda la sol a accesoriilor $\ge 15\text{ mm}$, zero-clipping, `boundaryEdgeCount === 0`, `nonManifoldEdgeCount === 0` și `rawSignedVolume > 0`.
  3. **Testarea Valorilor la Limită (`Boundary & Adversarial Inputs`) și Rezistența la Mutații:**
     - Testează comportamentul la $\Delta t = 0$, $\Delta t < 0$, $\Delta t = \text{NaN}$, $\Delta t = +\infty$, dimensiuni negative sau zero, și verifică că orice modificare accidentală a unui semn sau a unei constante în `engine.ts` determină eșecul imediat al cel puțin unui test.
- **Protocolul Evaluatorului Pereche (`verificator-gameplay-cod`):**
  - Execuție `npx vitest run` și evaluarea severității aserțiunilor pe Axa S5 (prag minim `9.5 / 10`).
```

---

## 4. Rubrica de Evaluare Software în 5 Axe (Prag Minim `9.5 / 10`) Transmisă Evaluatorilor Software

Orice **Subagent Evaluator de Arhitectură Software** (`verificator-gameplay-cod` sau `subagent-verificator` alocat pe un strat software) evaluează codul pe următoarele **5 axe obligatorii**. Pentru obținerea verdictului `STATUS: VALIDAT`, **fiecare dintre cele 5 axe trebuie să primească minimum `9.5 / 10`**:

| Axă de Evaluare Software | Ce Verifică Evaluatorul Adversarial (Red-Team) | Criterii de Depunctare Automată sub `9.5 / 10` (`STATUS: INVALIDAT`) | Prag Minim |
| :--- | :--- | :--- | :---: |
| **Axa S1: Arhitectură, Separarea Responsabilităților (`Functional Core / Imperative Shell`) & Zero-Monolitizare** | Respectarea granițelor de fișiere și a dependențelor unidirecționale între straturi; absența logicii de domeniu amestecate cu apeluri DOM/Three.js; modularitate și coeziune ridicată. | • Importarea `three` sau `window`/`document` în `types.ts` sau `engine.ts` (scade nota sub `7.0`)<br>• Fișiere monolitice care amestecă I/O, calcule și randare | **`9.5 / 10`** |
| **Axa S2: Design de Tipuri TypeScript (`strict`), Modelare Algebrică a Stărilor & Zero `any`** | Utilizarea *Branded Types*, *Discriminated Unions*, `Readonly<T>`, `Result<T, E>` și `assertNever`; compilare curată `npx tsc --noEmit`. | • Orice apariție a lui `any`, `@ts-ignore`, `@ts-expect-error` sau `as unknown as T` scade automat nota sub `6.5 / 10`<br>• Stări modelate cu flaguri booleene ambigue | **`9.5 / 10`** |
| **Axa S3: Corectitudine Algoritmică/Matematică, Determinism & Tratarea Exhaustivă a Edge-Cases** | Exactitatea ecuațiilor geometrice/fizice/topologice; clamp pe $\Delta t$; tratarea `NaN`/`Infinity`/`0`; absența efectelor secundare ascunse. | • Formule aproximative care încalcă contractul geometric (ex. profil `V` în loc de `\|_\|`, `Math.abs(signedVolume)`)<br>• Lipsa validării cazurilor la limită | **`9.5 / 10`** |
| **Axa S4: Performanță Real-Time (`Zero-Allocation Loop`), Gestiunea Memoriei GPU (`dispose()`) & Securitate I/O** | Absența alocărilor `new THREE.*` în bucla `requestAnimationFrame`; eliberarea completă a geometriilor, materialelor și texturilor; serializare `.3mf` sigură și validă. | • Orice `new THREE.Vector3/Matrix4/Color` sau `.clone()` în bucla de randare scade nota sub `7.5 / 10`<br>• Lipsa apelurilor `.dispose()` pe resursele GPU | **`9.5 / 10`** |
| **Axa S5: Calitatea Testelor (`Anti-Greenwashing`, `Mutation-Grade`, Invarianți) & Completitudine Zero-Lene** | Teste Vitest care verifică invarianții matematici exacți; zero `TODO`/`TBD`/stub-uri/cod comentat în surse sau teste. | • Orice `TODO`, `FIXME`, placeholder `...` sau test superficial (`toBeDefined()` ca unică aserțiune) scade automat nota sub `6.0 / 10` | **`9.5 / 10`** |
