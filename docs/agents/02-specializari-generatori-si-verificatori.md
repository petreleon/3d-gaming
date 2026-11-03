# Anexa 02 — Specializările Transmise de Coordonatori către Generatori și Verificatori

Un principiu fundamental al arhitecturii **3D Gaming** este că **Generatorii și Verificatorii primesc întotdeauna specializările necesare de la Subagenții Coordonatori**. Coordonatorul poate fie să invoce subagenții pre-specializați din `.agents/agents/`, fie să definească subagenți noi cu `define_subagent`, injectând în prompt **Fișa de Specializare** corespunzătoare.

---

## 1. Perechile de Specializări pe Domenii

| Domeniu | Subagent Generator & Specializarea Primită | Subagent Verificator & Specializarea Primită |
| :--- | :--- | :--- |
| **1. Modelare & Sculptură 3D** | `generator-modelare-3d` (sau `subagent-generator` specializat):<br>• Cele 6 Legi Geometrice 3D (`3d-modeller`)<br>• Atașare pe elipsoid $\frac{x^2}{a^2}+\frac{y^2}{b^2}+\frac{z^2}{c^2}=1$ și orientare pe normală<br>• Continuitate $C^1$, capsule cu raze identice în pivotul `(0,0,0)`<br>• Simetrie radială prin grup-părinte (fără Euler twist)<br>• Offset normal $\ge 2\text{–}5\text{ mm}$ anti-Z-fighting | `verificator-modelare-3d` (sau `subagent-verificator` specializat):<br>• Audit matematic pe codul geometric<br>• Captură și inspecție vizuală din minimum **6 unghiuri** (`front`, `three_quarter`, `side`, `back`, `top`, `close-up`) în mod `material` + `wireframe`<br>• Checklistul Criminalistic în 10 Puncte (`visual-reviewer`) |
| **2. Rigging & Animații 3D** | `generator-animatii-3d`:<br>• Ierarhii anatomice de pivot `(0,0,0)`<br>• Arce naturale, anticipație, squash & stretch, follow-through / overlap<br>• Contact ferm cu solul ($y=0$, zero foot-sliding)<br>• Închiderea lină a buclei la $t=T \equiv t=0$<br>• Hook deterministic `window.__gameStage.setAuditPose({ action, t, ... })` | `verificator-animatii-3d`:<br>• **Spargerea obligatorie a animației într-o Matrice de Imagini ($R \times C$ cadre)** prin `scripts/capture_animation_matrix.mjs` sau `scripts/blender_animation_matrix.py`<br>• Inspecția vizuală cu `read_file` a fiecărei celule `#k` și a tranzițiilor `#k -> #(k+1)` din minimum 2 unghiuri<br>• Auditul continuității, clipping-ului în posturi extreme și al foot-sliding-ului |
| **3. Gameplay, Fizică & Cod** | `generator-gameplay-cod`:<br>• TypeScript strict (fără `any`)<br>• Bucle de joc independente de framerate (`delta` time cu clamp)<br>• Zero alocări `new THREE.*` pe cadru și `dispose()` complet<br>• Teste unitare și de integrare reale (anti-lazy tests) | `verificator-gameplay-cod`:<br>• Auditul filozofiei codului, invarianților fizici și determinisului<br>• Execuție `npx tsc --noEmit`, linter și suita de teste<br>• Audit de performanță WebGL/GPU și acoperire cu teste pe cazuri limită |
| **4. Shadere, Materiale & Iluminare** | `subagent-generator` (specializat în Shadere/PBR):<br>• GLSL / TSL / `MeshStandardMaterial` & `MeshPhysicalMaterial`<br>• Armonie cromatică, roughness/metalness/clearcoat, umbre soft | `subagent-verificator` (specializat în Shadere & Scenă):<br>• Verificarea compilării shaderelor fără warning-uri WebGL<br>• Audit vizual multi-unghi al reflexiilor, umbrelor și contrastului |
| **5. Cameră, UI / HUD & Integrare Scenă** | `subagent-generator` (specializat în Cameră & UI):<br>• Încadrare responsive, HUD ne-obstructiv, controale fluide | `subagent-verificator` (specializat în Integrare & UI):<br>• Verificare vizuală a încadrării subiectului 3D, lizibilității HUD și absenței coliziunilor între obiectele scenei |

---

## 2. Șablonul Obligatoriu pentru „Fișa de Specializare” (Trimisă de Coordonator)

Când un `subagent-coordonator` invocă un Generator sau un Verificator cu `invoke_subagent`, promptul transmis **TREBUIE** să includă secțiunea de mai jos:

```markdown
## FIȘĂ DE SPECIALIZARE (TRANSMISĂ DE SUBAGENTUL COORDONATOR)
- **Rol & Domeniu:** [ex. Generator Animații 3D — Ciclul de alergare și săritură pentru personajul principal]
- **Fișiere Deținute Exclusiv (doar pentru Generator):** [lista exactă de fișiere pe care are voie să le creeze/editeze]
- **Contract Tehnic & Matematic:**
  - Coordonate / Pivoți / Dimensiuni: [ex. sol la y = 0, înălțime personaj 1.80m, pivoți hip/knee/ankle centrați în (0,0,0)]
  - Legi Specifice Domeniului: [ex. curbe armonice cu defazaj, zero foot-sliding, hook window.__gameStage.setAuditPose activ]
- **Protocol de Verificare Pereche:**
  - [ex. Animația va fi spartă într-o matrice 4x4 (16 cadre) pe durata T = 1.2s din unghiurile three_quarter și side_profile și verificată vizual celulă cu celulă]
```
