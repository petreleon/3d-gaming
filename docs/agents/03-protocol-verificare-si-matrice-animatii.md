# Anexa 03 — Protocolul Verificatorului Draconic Vizual și Matricea de Imagini pentru Animații

Acest document stabilește regulile stricte de operare și standardele draconice de estetică vizuală ale tuturor **Subagenților Verificatori** (`subagent-verificator`, `verificator-modelare-3d`, `verificator-animatii-3d`, `verificator-gameplay-cod`).

---

## 1. Cele 4 Legi de Fier ale Verificatorului

1. **Interdicția Absolută de Scriere Directă:**
   - Verificatorul **NU are uneltele `write_file` sau `edit_file`** și nu are voie să modifice fișiere ale proiectului prin `run_command`.
   - Dacă descoperă chiar și o eroare minoră (un typo, un offset de $2\text{ mm}$, o siluetă rigidă, dungi artificiale sau un cadru de animație cu clipping), Verificatorul **NU o repară singur**, ci invalidează taskul (`STATUS: INVALIDAT`) și descrie exact soluția matematică/estetică/de cod în raportul către Coordonator.
2. **Comunicare Exclusivă cu Subagentul Coordonator:**
   - Verificatorul **nu trimite niciodată mesaje direct către Generator**.
   - Tot raportul său pleacă exclusiv către `subagent-coordonator`, care decide cum transmite instrucțiunile de remediere mai departe.
3. **Dogma Prezumției de Respingere Vizuală („Guilty Until Proven Pixar / Photorealistic Masterpiece”):**
   - **Trecerea testelor de cod (`tsc --noEmit`, `vitest run`) și a invarianților matematici ($\min(y)=0$, fără piese flotante) reprezintă DOAR 20% din verificare!**
   - Un model 3D poate trece toate testele unitare și totuși să arate **vizual mediocru sau artificial** (ex. siluetă pătrățoasă de ardei gras/cilindru în loc de măr rotund, dungi trigonometrice regulate de tapet `Math.sin(N * theta)`, aspect de plastic ieftin, inele albe speculare în vederea `top`, frunze/detalii invizibile pe muchie din profil, sau elemente întunecate care se pierd în fundal).
   - Verificatorul pornește de la prezumția că randarea are defecte vizuale și **invalidează nemilos** orice rezultat care nu atinge cel puțin **`9.5 / 10`** pe toate cele 5 axe estetice!
4. **Exigență Extremă (Toleranță Zero):**
   - Nicio componentă de cod nu este validată fără citirea integrală a sursei și rularea verificărilor de tipuri/teste.
   - Niciun model 3D, scenă sau interfață nu este validată fără captură vizuală multi-unghi (6+ unghiuri în `material` și `wireframe`) și inspecție pixel-cu-pixel cu `read_file`.
   - Nicio animație nu este validată fără **spargerea ei într-o matrice de imagini ($R \times C$)** și inspecția vizuală a fiecărui cadru.

---

## 2. Cele 15 Criterii Draconice de Audit Vizual & Estetic 3D

| # | Criteriu Vizual & Estetic | Ce Caută Verificatorul pe Capturile Multi-Unghi (`read_file`) | Motiv de `STATUS: INVALIDAT` Imediat |
| :- | :--- | :--- | :--- |
| **1** | **Fidelitatea Siluetei & Morfologia Reală** | Conturul exterior în `front`, `three_quarter` și `side_profile` reproduce fidel morfologia naturală (curbe convexe pline, fără umeri pătrățoși). | Formă de „ardei gras / dovleac costat / cilindru turtit” în loc de siluetă rotundă de măr; proporții nenaturale. |
| **2** | **Anti-Dungi Sintetice & Noise Multi-Octavă** | Variația de formă și culoare folosește zgomot fractal multi-octavă 2D/3D (Simplex/Perlin/FBM cu *domain warping*) și pete naturale asimetrice (*blush*). | Dungi verticale echidistante de tip `Math.sin(K * theta)` care arată ca un acordeon, calorifer sau tapet vărgat. |
| **3** | **Realism PBR + Subsurface Scattering (SSS)** | Transluciditate sub-dermală caldă pe materiale organice (fructe, frunze, piele), tranziție moale la terminatorul de umbră și `roughnessMap` variabilă. | Aspect de plastic ieftin, bilă de biliard sau vopsea auto metalizată. |
| **4** | **Zero Inele Speculare Albe & Zero Voal Lăptos** | Reflexii speculare asimetrice și difuze (de *softbox* fotografic lateral-față); umbre proprii calde și bogate la bază. | Inel alb luminos pe circumferința umărului în vederea `top` (`angle_06_top.png`) sau voal lăptos/cenușiu pe emisfera inferioară. |
| **5** | **Lizibilitatea Sub-Componentelor din 6 Unghiuri** | Frunza, codița, sepalele, mâinile sau accesoriile sunt volumetrice, generos proporționate și orientate 3D (*pitch* + *roll* + *yaw*). | Frunză văzută pe muchie (*edge-on*) ca o dungă subțire sau neagră în umbră în vederile `front` / `side_profile`; codiță subțire ca o sârmă. |
| **6** | **Contrast cu Fundalul & Rim Lighting** | Toate părțile modelului (inclusiv codița brună și conturul umbrit) sunt clar separate de fundal prin *Rim Light* cald și fundal gradat. | Codița sau partea umbrită a modelului se confundă cu fundalul întunecat. |
| **7–15** | **Cele 9 Legi de Integritate Geometrică** | Zero piese flotante, zero clipping, zero Z-fighting, continuitate $C^1/C^2$ fără *pole pinching*, zero Euler twist, zero primitive brute, texturi $\ge 1024^2$ cu `LinearFilter`+mipmaps, contact $y=0.000$ cu umbră de contact moale, zero HUD în capturi. | Orice abatere tehnică sau geometrică. |

### Tabelul Obligatoriu de Scorare Vizuală (Prag Minim: `9.5 / 10` pe Fiecare Axă)

Fiecare raport de verificare vizuală trebuie să conțină note pe scara `1.0 .. 10.0` pe cele 5 axe:
1. **Fidelitatea Siluetei & Proporții Naturale:** `? / 10` (minim `9.5 / 10`)
2. **Organicitatea Suprafeței & Texturii (Zero Dungi Sintetice):** `? / 10` (minim `9.5 / 10`)
3. **Realismul Materialului PBR / SSS & Calitatea Reflexiilor:** `? / 10` (minim `9.5 / 10`)
4. **Expresivitatea & Lizibilitatea Sub-Componentelor (din toate cele 6 unghiuri):** `? / 10` (minim `9.5 / 10`)
5. **Iluminare Cinematografică, Umbră de Contact & Contrast cu Fundalul:** `? / 10` (minim `9.5 / 10`)

Dacă **oricare** notă este `< 9.5 / 10`, verdictul este obligatoriu **`STATUS: INVALIDAT`**.

---

## 3. Protocolul Spargerii Animațiilor într-o Matrice de Imagini ($R \times C$)

O animație 3D nu poate fi verificată corect printr-un singur screenshot static sau doar citind formulele `Math.sin(...)` din cod. Defecte precum interpenetrarea membrelor la flexie maximă, alunecarea tălpilor pe sol (foot-sliding), răsucirea bruscă a quaternionilor sau sacadarea la finalul buclei sunt vizibile doar când animația este **descompusă temporal într-o matrice de imagini**.

### Pasul 1: Generarea Matricei de Imagini (`R x C` Contact Sheet)

- **Pentru scene Three.js / WebGL (în browser):**
  Verificatorul rulează scriptul [`scripts/capture_animation_matrix.mjs`](../../scripts/capture_animation_matrix.mjs):
  ```bash
  node scripts/capture_animation_matrix.mjs \
    --mode matrix \
    --url http://localhost:3000 \
    --action <nume_animatie> \
    --start 0 \
    --duration <durata_ciclului_secunde> \
    --rows 4 \
    --cols 4 \
    --views three_quarter,side_profile \
    --out /tmp/animation-matrix
  ```
  Acest script eșantionează animația în $N = R \times C = 16$ momente echidistante:
  $$t_k = t_{\text{start}} + \frac{k}{N - 1} \cdot T, \quad k \in \{0, 1, \dots, N-1\}$$
  și generează:
  - Cadrele individuale `frame_<action>_<view>_<k>_t<X.XX>s.png`;
  - **Matricea compusă `matrix_<action>_<view>_4x4.png`**, unde fiecare celulă $(r, c)$ are afișat în colțul din stânga-sus numărul cadrului `#00..#15`, timpul exact `t=X.XXs` și procentul din ciclu `0%..100%`.

- **Pentru scene Blender:**
  Verificatorul rulează [`scripts/blender_animation_matrix.py`](../../scripts/blender_animation_matrix.py) (prin `blender:execute_blender_code` sau CLI) pentru a randa cele $R \times C$ cadre din timeline și a salva imaginea matricei `matrix_<action>_4x4.png` în `/tmp/animation-matrix/`.

### Pasul 2: Ce Verifică Vizual Verificatorul în Matricea de Imagini (cu `read_file`)

După generarea matricei, Verificatorul apelează obligatoriu `read_file` pe fișierele `matrix_<action>_three_quarter_4x4.png` și `matrix_<action>_side_profile_4x4.png` și verifică următoarele **6 criterii cinematice**:

| # | Criteriu de Audit pe Matricea de Imagini | Ce caută Verificatorul în celulele `#00 .. #(N-1)` | Verdict la Abatere |
| :- | :--- | :--- | :--- |
| **1** | **Continuitate Temporală & Arce (`#k -> #(k+1)`)** | Traiectoriile mâinilor, picioarelor, capului și recuzitei descriu arce netede de la o celulă la alta, fără salturi bruște (popping) sau inversări de orientare. | `STATUS: INVALIDAT` (specifică perechea de cadre `#k -> #(k+1)`) |
| **2** | **Absența Cadrelor Înghețate (Dead Frames)** | Două sau mai multe celule consecutive din matrice nu trebuie să fie identice atunci când animația este activă. | `STATUS: INVALIDAT` (specifică intervalul de cadre înghețate) |
| **3** | **Zero Clipping în Posturile Extreme** | În celulele de amplitudine maximă (ex. `#04`, `#08`, `#12`), brațele, coapsele, hainele sau armele/obiectele nu pătrund prin trunchi, cap sau podea. | `STATUS: INVALIDAT` (specifică cadrul `#k` și mesh-urile care se intersectează) |
| **4** | **Integritatea Articulațiilor la Flexie Maximă** | Coatele, genunchii, umerii și șoldurile nu prezintă goluri, desprinderi sau trepte de rază în niciuna dintre cele $R \times C$ celule. | `STATUS: INVALIDAT` (specifică articulația și cadrul `#k`) |
| **5** | **Contactul cu Solul ($y=0$) & Zero Foot-Sliding** | În vederea `side_profile`, piciorul de sprijin rămâne fixat pe linia solului $y=0$ (nu plutește și nu intră sub podea). | `STATUS: INVALIDAT` (specifică eroarea pe axa $Y$/$Z$ și cadrele `#k`) |
| **6** | **Închiderea Buclei (`#(N-1)` $\leftrightarrow$ `#00`) & Follow-Through** | Pentru animații ciclice, postura din ultima celulă `#(N-1)` ($100\%$) coincide sau se racordează continuu cu prima celulă `#00` ($0\%$), iar elementele secundare (pelerină, păr, pălării, frunze) prezintă inerție naturală (overlap). | `STATUS: INVALIDAT` (specifică discontinuitatea la $t=T$) |
