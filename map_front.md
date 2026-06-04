# Panel de Geolocalización — ApliSmart Motors
## Especificación de diseño visual y funcional — v2 (Detallada)

---

## 1. Dirección estética

### Concepto: "Control Room Dark"
Un panel de operaciones de flota que se siente como el centro de control de una empresa seria.
**Dark mode obligatorio.** No por moda, sino porque los operadores pasan horas mirando el mapa
y los fondos claros fatigan la vista. El mapa con tiles oscuros + UI dark crea una experiencia
cohesiva donde el mapa *es* la interfaz, no un elemento dentro de ella.

**Tono**: Industrial refinado. Frío, preciso, confiable. Como el software que usaría una empresa
de logística de primer nivel. Nada de gradientes de colores brillantes ni glassmorphism genérico.

**Lo que lo hace memorable**: El mapa ocupa TODO. El panel inferior y el dropdown flotan
*encima* del mapa con glassmorphism sutil (backdrop-filter: blur + borde semitransparente).
La sensación es de capas de información sobre el territorio real.

---

## 2. Tipografía

### Display / Datos numéricos: `DM Mono`
- Para placas de vehículos, velocidad, coordenadas, kilometraje, timestamps
- Monoespaciada = datos técnicos se leen de un vistazo
- Peso: 400 para datos secundarios, 500 para valores principales

### UI / Labels / Texto: `Outfit`
- Para labels, botones, nombres, estados
- Geométrica pero con personalidad, no tan genérica como Inter
- Pesos: 300 (secundario), 500 (body), 700 (headings)

### Importación
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Outfit:wght@300;400;500;600;700&display=swap');
```

---

## 3. Sistema de color

```css
:root {
  /* === FONDOS === */
  --geo-bg-deep:        #080b10;   /* fondo más profundo, casi negro azulado */
  --geo-bg-panel:       #0d1117;   /* panel inferior y dropdowns */
  --geo-bg-card:        #131920;   /* cards dentro del panel */
  --geo-bg-hover:       #1a2332;   /* hover states */
  --geo-bg-glass:       rgba(13, 17, 23, 0.85); /* glassmorphism backdrop */

  /* === BORDES === */
  --geo-border:         rgba(255, 255, 255, 0.06);
  --geo-border-strong:  rgba(255, 255, 255, 0.12);
  --geo-border-accent:  rgba(56, 189, 248, 0.3);

  /* === TEXTO === */
  --geo-text-primary:   #f0f6fc;   /* texto principal, casi blanco */
  --geo-text-secondary: #7d8590;   /* labels, texto secundario */
  --geo-text-muted:     #484f58;   /* texto muy secundario */
  --geo-text-mono:      #79c0ff;   /* datos monoespaciados (coordenadas, timestamps) */

  /* === ESTADOS DE VEHÍCULO === */
  --geo-active:         #3fb950;   /* verde: encendido / en movimiento */
  --geo-active-glow:    rgba(63, 185, 80, 0.35);
  --geo-idle:           #d29922;   /* amarillo: encendido pero estático */
  --geo-idle-glow:      rgba(210, 153, 34, 0.3);
  --geo-offline:        #484f58;   /* gris: apagado / sin señal */
  --geo-selected:       #38bdf8;   /* azul cielo: seleccionado */
  --geo-selected-glow:  rgba(56, 189, 248, 0.4);
  --geo-blocked:        #f85149;   /* rojo: bloqueado */
  --geo-blocked-glow:   rgba(248, 81, 73, 0.35);

  /* === ACCIONES === */
  --geo-action-on:      #3fb950;   /* encender */
  --geo-action-off:     #f85149;   /* apagar */
  --geo-action-lock:    #f85149;   /* bloquear */
  --geo-action-unlock:  #3fb950;   /* desbloquear */
  --geo-action-horn:    #d29922;   /* bocina/alerta */

  /* === RUTA FANTASMA === */
  --geo-ghost-route:    #818cf8;   /* índigo para rutas históricas */
  --geo-ghost-opacity:  0.65;
  --geo-live-route:     #38bdf8;   /* azul cielo para ruta actual */

  /* === ACENTO GLOBAL === */
  --geo-accent:         #38bdf8;
  --geo-accent-dim:     rgba(56, 189, 248, 0.15);
}
```

---

## 4. Layout general

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│                    MAPA LEAFLET — TILES OSCUROS                        │
│               (ocupa 100% width, height: calc(100vh - 64px))           │
│                                                                        │
│  ┌──────────────────────────────────────────┐          ┌─────────┐    │
│  │  [SVG carro] Vehículos (12)  [✕ Limpiar] │          │    +    │    │
│  └──────────────────────────────────────────┘          │    −    │    │
│     ↓ (dropdown abierto)                               └─────────┘    │
│  ┌──────────────────────────────┐                                      │
│  │  🟢 ABC-1234  Juan Pérez    │                                      │
│  │     Av. 9 de Octubre · En ruta                                      │
│  │  ⚫ XYZ-5678  Sin conductor │                                      │
│  │     Último: hace 2h          │                                      │
│  │  🟡 DEF-9012  María López   │                                      │
│  └──────────────────────────────┘                                      │
│                                                                        │
│         [Marcadores SVG de vehículos sobre el mapa]                   │
│                                                                        │
│    ┌──────────────────────────┐                                        │
│    │  Card flotante al        │   ← aparece con animación             │
│    │  seleccionar un carro    │     slide-in desde izquierda          │
│    └──────────────────────────┘                                        │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│  PANEL INFERIOR — translateY animado, altura 280px                     │
│  ┌────────────────────┬───────────────────────────────────────────┐   │
│  │   ACCIONES (220px) │  [Historial de rutas] [Estadísticas]      │   │
│  │                    │  ─────────────────────────────────────    │   │
│  │  Placa + estado    │  contenido dinámico según pestaña         │   │
│  │  Conductor         │                                           │   │
│  │  [Btn Encender]    │                                           │   │
│  │  [Btn Bloquear]    │                                           │   │
│  │  [Btn Bocina]      │                                           │   │
│  └────────────────────┴───────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Tiles del mapa

Usar CartoDB Dark Matter — gratuito, sin API key, se ve profesional:
```
https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png
```
Attribution: `© OpenStreetMap contributors © CARTO`

El mapa oscuro hace que los marcadores de color resalten dramáticamente.
Los tiles de calles en gris oscuro con etiquetas en gris claro dan el look "centro de operaciones".

---

## 6. Marcadores de vehículos (SVG via Leaflet divIcon)

Cada marcador es un `divIcon` con HTML/SVG inline. Dimensiones: 48px × 64px (incluye la placa encima).

### Anatomía del marcador

```
     ┌─────────────┐
     │  ABC-1234   │  ← pill label: DM Mono 10px, fondo semi-opaco
     └──────┬──────┘
            │
     ┌──────▼──────┐
     │  [SVG carro]│  ← 32×32px, color según estado
     │      ●      │  ← punto de anclaje al mapa
     └─────────────┘
```

**SVG del carro** (vista top-down, estilo blueprint minimalista):
- Silueta limpia del vehículo visto desde arriba
- Color de relleno: `--geo-active` / `--geo-idle` / `--geo-offline` / `--geo-selected`
- Drop shadow del mismo color con blur 8px (efecto glow)
- Borde/stroke de 1px en versión más clara del color de relleno

**Pill de placa**:
- Background: `rgba(0,0,0,0.75)` con `backdrop-filter: blur(4px)`
- Borde: `1px solid` del color de estado del vehículo
- Texto: `DM Mono`, 10px, color del estado
- Border-radius: 4px
- Padding: 2px 6px

**Estado encendido (activo, en movimiento)**:
- Color: `#3fb950` (verde)
- Glow: `drop-shadow(0 0 8px rgba(63,185,80,0.7))`
- Animación de pulso suave en el punto de anclaje (CSS keyframe, escala 1→1.3→1, 2s infinito)
- El ícono rota según la dirección de movimiento (heading del GPS)

**Estado idle (encendido, quieto)**:
- Color: `#d29922` (amarillo)
- Glow: `drop-shadow(0 0 6px rgba(210,153,34,0.6))`
- Sin rotación

**Estado apagado**:
- Color: `#484f58` (gris)
- Sin glow
- Opacidad: 0.6

**Estado seleccionado**:
- Ring exterior: círculo SVG pulsante (keyframe: opacity 1→0, scale 1→2, 1.5s infinito)
- Color del ring: `--geo-selected` (#38bdf8)
- El marcador sube a z-index máximo
- Todos los demás marcadores: `opacity: 0.25`, transición 300ms

**Estado bloqueado**:
- Color base: `#f85149` (rojo)
- Glow: `drop-shadow(0 0 8px rgba(248,81,73,0.6))`
- Pequeño ícono de candado cerrado superpuesto arriba a la derecha del marcador

---

## 7. Dropdown selector de vehículos

### Trigger button (siempre visible, top-left sobre el mapa)

Posición: `position: absolute; top: 16px; left: 16px; z-index: 1000`

```
┌────────────────────────────────────────────┐
│  [SVG carro 18px]  Vehículos  [badge: 12]  │  ← badge = total carros
└────────────────────────────────────────────┘
```

Estilo del botón:
- Background: `var(--geo-bg-glass)` con `backdrop-filter: blur(12px) saturate(180%)`
- Border: `1px solid var(--geo-border-strong)`
- Border-radius: 10px
- Padding: 10px 16px
- Font: `Outfit 500`, 14px, `var(--geo-text-primary)`
- Box-shadow: `0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`
- Hover: border cambia a `var(--geo-border-accent)`, background se aclara levemente
- Transición: 200ms ease

El SVG del carro: monocolor `var(--geo-text-secondary)`, se vuelve `var(--geo-accent)` en hover.

El badge de conteo:
- Pill pequeña: `background: var(--geo-accent-dim)`, `color: var(--geo-accent)`
- `DM Mono 11px`, padding 2px 7px, border-radius 100px

### Botón "Limpiar selección" (aparece solo cuando hay carro seleccionado)

Aparece a la derecha del trigger con animación fade+slide (200ms):
```
[ ✕  ABC-1234 ]
```
- Background: `rgba(248,81,73,0.1)`, border: `1px solid rgba(248,81,73,0.3)`
- Color: `#f85149`
- Font: `Outfit 500`, 13px
- Al hover: background sube a `rgba(248,81,73,0.2)`

### Panel dropdown

Aparece debajo del trigger con animación:
- `opacity: 0 → 1` + `transform: translateY(-8px) → translateY(0)`
- Duración: 200ms `cubic-bezier(0.16, 1, 0.3, 1)`

Dimensiones: width 320px, max-height 420px (overflow-y: auto con scrollbar custom)

Estilo:
- Background: `var(--geo-bg-panel)`
- Border: `1px solid var(--geo-border-strong)`
- Border-radius: 12px
- Box-shadow: `0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)`
- Padding top: 8px, padding bottom: 8px

**Header del dropdown**:
```
Todos los vehículos
──────────────────────────────
🟢 3 activos  · 🟡 1 idle · ⚫ 8 apagados
```
- Separador: `1px solid var(--geo-border)`
- Stats: badges mini con color de estado

**Cada ítem de vehículo**:
```
┌──────────────────────────────────────────────────┐
│  [●]  ABC-1234           [badge ACTIVO / APAGADO]│
│       Juan Carlos Pérez                          │
│       📍 Av. 9 de Octubre · Hace 30s             │
└──────────────────────────────────────────────────┘
```

- `[●]` = círculo sólido 10px, color del estado (`--geo-active` / `--geo-idle` / `--geo-offline`)
- Si activo: el círculo tiene animación de pulso
- Placa: `DM Mono 600`, 14px, `var(--geo-text-primary)`
- Badge estado: pill pequeña con color correspondiente, texto en mayúsculas, 10px
- Nombre conductor: `Outfit 400`, 12px, `var(--geo-text-secondary)`
- Última ubicación: `Outfit 300`, 11px, `var(--geo-text-muted)`. Ícono pin SVG 10px.
- Padding ítem: 12px 16px
- Hover: `background: var(--geo-bg-hover)`, border-left `2px solid var(--geo-selected)` (slide-in 150ms)
- Cursor: `pointer` para encendidos, `default` para apagados (visualmente atenuados al 60%)
- Separador entre ítems: `1px solid var(--geo-border)` dentro del padding

**Scroll custom**:
```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--geo-border-strong); border-radius: 2px; }
```

---

## 8. Card flotante del vehículo seleccionado (sobre el mapa)

Aparece a la izquierda del mapa, abajo del dropdown, cuando se selecciona un carro.
Animación: `transform: translateX(-110%) → translateX(0)` + `opacity: 0 → 1`, 300ms `cubic-bezier(0.16, 1, 0.3, 1)`

Posición: `position: absolute; top: 80px; left: 16px; z-index: 999`

Dimensiones: width 260px

```
┌──────────────────────────────────────────┐
│  [●] ENCENDIDO · EN MOVIMIENTO           │  ← status bar top con color activo
├──────────────────────────────────────────┤
│                                          │
│  ABC-1234              [SVG carro 40px]  │
│  Toyota Hilux 2022                       │
│                                          │
│  ─────────────────────────────────────   │
│                                          │
│  👤 Juan Carlos Pérez                    │
│  ☎  0987-654-321                         │
│                                          │
│  ─────────────────────────────────────   │
│                                          │
│  📍 Av. 9 de Octubre y Malecón          │
│     Guayaquil · hace 15s                 │
│                                          │
│  📡 Señal: Excelente  🛰 8 satélites    │
│                                          │
└──────────────────────────────────────────┘
```

Estilo:
- Background: `var(--geo-bg-glass)` con `backdrop-filter: blur(16px) saturate(200%)`
- Border: `1px solid var(--geo-border-strong)`
- Border-top: `2px solid var(--geo-active)` (cambia de color según estado)
- Border-radius: 12px
- Box-shadow: `0 8px 32px rgba(0,0,0,0.6)`
- Placa: `DM Mono 700`, 22px, `var(--geo-text-primary)`
- Modelo: `Outfit 400`, 13px, `var(--geo-text-secondary)`
- Status bar: `Outfit 600`, 11px uppercase, letra-spacing 0.08em, padding 6px 16px, background con color de estado a 15% opacidad

---

## 9. Ruta fantasma (historial sobre el mapa)

Cuando el usuario hace click en una ruta del historial:

**Polilínea**:
- Color: `var(--geo-ghost-route)` = `#818cf8` (índigo)
- Weight: 3px
- Opacity: 0.7
- DashArray: `"8, 6"` (línea punteada)
- Animación de aparición: los puntos de la polilínea se dibujan secuencialmente via `L.polyline` con
  un timeout que va agregando puntos de a uno cada 8ms (efecto "trazado")

**Marcador de inicio**:
- Círculo SVG verde 12px con ícono de bandera SVG
- Label: `Inicio — HH:MM`

**Marcador de fin**:
- Círculo SVG rojo/gris 12px con ícono de checkmark
- Label: `Fin — HH:MM`

**Banner flotante** (aparece en el mapa mientras hay ruta activa):
```
  ┌────────────────────────────────────────────┐
  │  [SVG historial] Ruta: 12 Mar · 08:30-14:20│
  │  47.3 km · 5h 50min · 62 km/h prom  [✕]   │
  └────────────────────────────────────────────┘
```
Posición: `top: 16px, left: 50%, transform: translateX(-50%)` — centrado superior.
Mismo glassmorphism del dropdown. Color acento del borde: `var(--geo-ghost-route)`.

---

## 10. Panel inferior

### Estructura y animación

Default: oculto (`transform: translateY(100%)`)
Al seleccionar: `transform: translateY(0)`, transición `400ms cubic-bezier(0.16, 1, 0.3, 1)`

Posición: `position: fixed; bottom: 0; left: 0; right: 0`
Altura: `280px`

Estilo:
- Background: `var(--geo-bg-panel)`
- Border-top: `1px solid var(--geo-border-strong)`
- Box-shadow: `0 -8px 40px rgba(0,0,0,0.6)`
- Handle de arrastre visual: línea 40px × 3px centrada arriba, `var(--geo-border-strong)`, border-radius 2px

**Resize opcional**: el panel puede arrastrarse hacia arriba para ocupar más pantalla (hasta 60vh).

### Columna izquierda — Acciones (width: 220px, flex-shrink: 0)

Separada del resto por `border-right: 1px solid var(--geo-border)`

**Cabecera**:
```
┌─────────────────────────────┐
│  ABC-1234                   │
│  Toyota Hilux · Juan Pérez  │
│  [● ENCENDIDO]              │
└─────────────────────────────┘
```
- Placa: `DM Mono 700`, 18px
- Modelo + conductor: `Outfit 400`, 12px, muted
- Badge estado: pill con ícono círculo pulsante + texto uppercase 10px

**Separador**: `1px solid var(--geo-border)`, margin 12px 0

**Botones de acción**:

Cada botón sigue este patrón:
```
┌─────────────────────────────────┐
│  [SVG 18px]  Label              │
│              Descripción corta  │
└─────────────────────────────────┘
```

- Width: 100%, border-radius: 8px, padding: 10px 14px
- Display: flex, gap: 12px, align-items: center
- Border: `1px solid` (color del estado del botón al 30%)
- Background: color del botón al 8%
- Hover: background sube a 15%, border-color sube a 50%
- Transición: 150ms ease
- Label: `Outfit 600`, 13px
- Descripción: `Outfit 400`, 11px, `var(--geo-text-muted)`

**Botón 1 — Encender / Apagar**:
- Si apagado → "Encender motor" · SVG: llave de contacto · Color: `--geo-action-on` (#3fb950)
- Si encendido → "Apagar motor" · SVG: llave de contacto con X · Color: `--geo-action-off` (#f85149)
- Confirmación: al hacer click abre un micro-dialog inline (no modal) que dice
  "¿Confirmar? [Sí] [No]" que aparece debajo del botón con animación

**Botón 2 — Bloquear / Desbloquear**:
- Si desbloqueado → "Bloquear vehículo" · SVG: candado cerrado · Color: `--geo-action-lock` (#f85149)
- Si bloqueado → "Desbloquear" · SVG: candado abierto · Color: `--geo-action-unlock` (#3fb950)
- Badge adicional: si está bloqueado, mostrar cuándo se bloqueó (`DM Mono 10px`, muted)

**Botón 3 — Bocina / Alerta sonora**:
- Label: "Bocina de alerta" · SVG: altavoz con ondas · Color: `--geo-action-horn` (#d29922)
- Descripción: "Activa señal sonora en el vehículo"
- Comportamiento: no requiere confirmación, feedback visual inmediato
- Al hacer click: el botón hace animación de "pulse" 3 veces (scale 1→1.05→1 cada 200ms)
  y muestra "✓ Señal enviada" durante 2 segundos

**Loading state de botones**:
Cuando se envía el comando al servidor:
- El botón muestra spinner SVG girando en lugar del ícono
- Label cambia a "Enviando..." en muted
- No se puede volver a hacer click

---

### Columna derecha — Pestañas (flex: 1)

**Tab bar**:
```
  [ Historial de rutas ]  [ Estadísticas ]
```

Estilo de tabs:
- Contenedor: `border-bottom: 1px solid var(--geo-border)`, padding: 0 20px
- Tab inactivo: `Outfit 500`, 13px, `var(--geo-text-secondary)`, padding: 14px 16px
- Tab activo: `var(--geo-accent)`, border-bottom `2px solid var(--geo-accent)` que hace transición de izquierda a derecha al cambiar
- Hover: `var(--geo-text-primary)`
- Transición activo: 200ms ease

---

#### Pestaña A — Historial de rutas

Layout: lista vertical scrollable de rutas, `overflow-y: auto`, padding 16px 20px

**Cabecera de sección**:
```
Últimas rutas  ·  Total: 47.3 km esta semana
```
Font: `Outfit 400` 12px muted. El total cambia dinámicamente.

**Cada ítem de ruta**:
```
┌──────────────────────────────────────────────────────────┐
│  [SVG ruta]  Lun 12 Mar · 08:30 → 14:20        47.3 km  │
│              Guayaquil → Daule · 5h 50min · 62 km/h avg  │
│              ════════════════════════════════  (barra)    │
└──────────────────────────────────────────────────────────┘
```

- Ícono SVG: dos puntos conectados con línea curva (ícono de ruta), 16px, `var(--geo-text-muted)`
- Fecha y horario: `DM Mono 500`, 12px, `var(--geo-text-primary)`
- Distancia: `DM Mono 600`, 14px, `var(--geo-accent)` — la cifra más importante, alineada a la derecha
- Origen → Destino: `Outfit 400`, 12px, `var(--geo-text-secondary)`
- Duración y velocidad promedio: `Outfit 300`, 11px, `var(--geo-text-muted)`
- Barra de velocidad promedio: línea de progreso 2px, color gradiente de `--geo-active` a `--geo-idle`
  proporcional a la velocidad (0 → 120 km/h). Sin bordes, puramente decorativa/informativa.
- Padding ítem: 12px 0
- Separador: `1px solid var(--geo-border)` entre ítems
- Hover: background `var(--geo-bg-hover)`, border-left `3px solid var(--geo-ghost-route)` (transición 150ms)
- Estado seleccionado: background `rgba(129,140,248,0.08)`, border-left `3px solid var(--geo-ghost-route)`

**Al seleccionar una ruta**:
1. El ítem se resalta visualmente
2. En el mapa: aparece la polilínea punteada con animación de trazado (ver sección 9)
3. El mapa hace `fitBounds` con padding 80px (animación 800ms)
4. El banner flotante aparece en el mapa con resumen de la ruta

**Botón cerrar ruta** (aparece dentro del ítem seleccionado):
```
[ ✕ Cerrar ruta ]
```
Pequeño, debajo de la info, color `var(--geo-text-muted)` → hover `var(--geo-text-primary)`

---

#### Pestaña B — Estadísticas en tiempo real

Layout: grid 2×2 con padding 20px, gap 12px

**Widget 1 — Velocímetro**
```
        ╭───────────────╮
       ╱                 ╲
      │    87            │
      │   km/h           │
       ╲                 ╱
        ╰───────────────╯
        0            120
```
- Gauge SVG semicircular (180°)
- Track: arco gris `var(--geo-border-strong)`, stroke-width 6px
- Fill: arco de color que va de `--geo-active` (verde) a `--geo-idle` (amarillo) a `--geo-blocked` (rojo)
  según la velocidad. Transición animada al cambiar valor.
- Número central: `DM Mono 700`, 28px, `var(--geo-text-primary)`
- Unidad: `Outfit 400`, 12px, `var(--geo-text-muted)`
- Labels 0 y 120: `DM Mono 400`, 10px, `var(--geo-text-muted)`
- Si vehículo apagado: valor "--" con opacidad 0.4

**Widget 2 — Nivel de combustible**
```
┌─────────────────────────────┐
│  [SVG combustible]  67%     │
│  ████████████░░░░░  Lleno   │
│  Aprox. 320 km restantes    │
└─────────────────────────────┘
```
- Barra horizontal, altura 6px, border-radius 3px
- Fondo: `var(--geo-border-strong)`
- Fill: gradiente rojo (#f85149) → amarillo (#d29922) → verde (#3fb950) según nivel
- Porcentaje: `DM Mono 700`, 22px
- Status text: `Outfit 500`, 12px, color según nivel (rojo si <15%, amarillo si <40%, verde si >40%)
- Kilómetros restantes: `Outfit 300`, 11px, `var(--geo-text-muted)` (calculado con consumo promedio del vehículo)
- Si dato no disponible: barra en gris con "Sin datos" muted

**Widget 3 — Odómetro / Kilometraje**
```
┌─────────────────────────────┐
│  [SVG odómetro]             │
│   124,837                   │
│      km                     │
│  +47.3 km hoy               │
└─────────────────────────────┘
```
- Número principal: `DM Mono 700`, 24px, `var(--geo-text-primary)`
- Separador de miles con coma
- "+X km hoy": `Outfit 500`, 12px, `var(--geo-active)` con pequeño ícono de flecha arriba

**Widget 4 — Batería del vehículo**
```
┌─────────────────────────────┐
│  [SVG batería]  12.8V       │
│  ▓▓▓▓▓▓▓░░░░   Normal       │
│  Última carga: hace 2h      │
└─────────────────────────────┘
```
- Ícono de batería SVG segmentado en 5 bloques que se llenan según voltaje
  (rango típico: 11.5V vacía → 12.6V cargada → 13.8V cargando)
- Voltaje: `DM Mono 600`, 20px
- Status: verde "Normal" / amarillo "Baja" / rojo "Crítica" / azul "Cargando"
- Texto secundario: `Outfit 300`, 11px, muted

**Estilo de cada widget**:
- Background: `var(--geo-bg-card)`
- Border: `1px solid var(--geo-border)`
- Border-radius: 10px
- Padding: 16px
- Box-shadow: `0 2px 8px rgba(0,0,0,0.3)`
- Label del widget: `Outfit 500`, 11px, uppercase, letter-spacing 0.08em, `var(--geo-text-muted)`, margin-bottom 12px

---

## 11. Estados de pantalla completa

### A — Sin vehículo seleccionado
- Mapa: todos los marcadores visibles, opacidad normal
- Panel inferior: completamente oculto (`translateY(100%)`)
- En el lugar del panel: nada (el mapa llega al borde inferior)
- Dropdown: disponible, badge con total de vehículos

### B — Vehículo seleccionado (encendido)
- Marcador seleccionado: halo pulsante azul, z-index elevado
- Otros marcadores: `opacity: 0.25`, transición 300ms
- Mapa: `flyTo` a coordenadas actuales, zoom 15, animación 1.2s
- Panel inferior: desliza hacia arriba, 300ms
- Card flotante: aparece desde la izquierda, 300ms
- Actualización en tiempo real cada ~5s de posición y estadísticas

### C — Vehículo seleccionado (apagado)
- Igual que B pero sin flyTo suave — va a última posición conocida
- Marcador sin halo pulsante
- Estadísticas muestran últimos valores con badge "Última señal: DD MMM · HH:MM"
  en color `--geo-idle` arriba de cada widget

### D — Ruta fantasma activa
- Polilínea punteada índigo visible sobre el mapa
- Banner centrado superior con resumen de la ruta
- El ítem de ruta en el historial: resaltado
- El marcador del carro: levemente atenuado durante la visualización histórica
- Botón "Cerrar ruta" dentro del ítem activo

### E — Comando enviado (loading)
- El botón de acción muestra spinner
- Overlay muy sutil sobre la columna de acciones: `pointer-events: none`
- Toast notification en esquina superior derecha del panel al completar:
  - Éxito: borde izquierdo verde, ícono checkmark, "Motor apagado correctamente"
  - Error: borde izquierdo rojo, ícono X, "No se pudo enviar el comando. Reintentar"
  - Duración: 4 segundos, con barra de progreso de desaparición en el borde inferior

---

## 12. Microinteracciones y animaciones clave

| Elemento | Trigger | Animación |
|---|---|---|
| Dropdown abre | Click trigger | `opacity 0→1` + `translateY(-8px→0)`, 200ms ease-out |
| Dropdown cierra | Click fuera | `opacity 1→0` + `translateY(0→-8px)`, 150ms ease-in |
| Panel inferior aparece | Seleccionar vehículo | `translateY(100%→0)`, 400ms cubic-bezier(0.16,1,0.3,1) |
| Panel inferior desaparece | Limpiar selección | `translateY(0→100%)`, 250ms ease-in |
| Card flotante aparece | Seleccionar vehículo | `translateX(-110%→0)` + `opacity 0→1`, 300ms ease-out |
| Otros marcadores se atenúan | Seleccionar vehículo | `opacity →0.25`, 300ms |
| Ruta fantasma se traza | Click en ruta historial | Puntos agregados secuencialmente, 8ms/punto |
| Banner ruta aparece | Ruta seleccionada | `translateY(-120%→0)` desde arriba, 300ms |
| Botón bocina feedback | Click | Scale pulse 3×: `1→1.05→1` cada 200ms |
| Tab cambia | Click tab | Underline: translateX animado, 200ms |
| Velocímetro actualiza | Nuevo dato WS | SVG arc stroke-dashoffset, 500ms ease |
| Ítem historial hover | Hover | Border-left slide-in desde top, 150ms |
| Marcador posición | Nuevo dato WS | `L.marker.setLatLng` con interpolación suave |

---

## 13. Arquitectura de componentes React

```
pages/Geolocalizacion/
├── page.jsx                        ← layout principal, estado global via context
├── GeoContext.jsx                  ← Context: vehiculos, selectedId, ghostRoute, etc.
├── useVehicleTracking.js           ← WebSocket + polling fallback, actualiza context
│
├── components/
│   ├── GeoMap/
│   │   ├── GeoMap.jsx              ← MapContainer Leaflet, tiles oscuros
│   │   ├── VehicleMarker.jsx       ← divIcon SVG, maneja estado visual
│   │   ├── GhostRouteLine.jsx      ← Polyline punteada + markers inicio/fin
│   │   └── RouteInfoBanner.jsx     ← banner flotante centrado superior
│   │
│   ├── VehicleSelector/
│   │   ├── VehicleSelector.jsx     ← trigger + dropdown
│   │   ├── VehicleListItem.jsx     ← cada ítem de la lista
│   │   └── ClearSelectionBtn.jsx   ← botón con animación fade
│   │
│   ├── VehicleFloatCard/
│   │   └── VehicleFloatCard.jsx    ← card flotante sobre el mapa
│   │
│   └── VehiclePanel/
│       ├── VehiclePanel.jsx        ← contenedor con animación slide-up
│       ├── PanelActions/
│       │   ├── PanelActions.jsx    ← columna izquierda
│       │   ├── ActionButton.jsx    ← botón reutilizable con loading/confirm
│       │   └── ConfirmInline.jsx   ← micro-dialog de confirmación
│       └── PanelTabs/
│           ├── PanelTabs.jsx       ← tab bar + switch de contenido
│           ├── RouteHistory/
│           │   ├── RouteHistory.jsx
│           │   └── RouteHistoryItem.jsx
│           └── VehicleStats/
│               ├── VehicleStats.jsx
│               ├── SpeedometerGauge.jsx   ← SVG gauge semicircular
│               ├── FuelWidget.jsx
│               ├── OdometerWidget.jsx
│               └── BatteryWidget.jsx
```

---

## 14. Tipado TypeScript de datos

```typescript
type VehicleStatus = 'active' | 'idle' | 'offline' | 'blocked';

interface Vehicle {
  id: string;
  plate: string;             // "ABC-1234"
  model: string;             // "Toyota Hilux 2022"
  driverName: string | null;
  driverPhone: string | null;
  status: VehicleStatus;
  position: { lat: number; lng: number } | null;
  heading: number;           // 0-360, dirección de movimiento
  lastSeen: Date;
  speed: number;             // km/h
  fuel: number;              // 0-100 %
  odometer: number;          // km totales
  batteryVoltage: number;    // ej: 12.8
  isLocked: boolean;
}

interface RouteHistoryItem {
  id: string;
  vehicleId: string;
  startAt: Date;
  endAt: Date;
  distanceKm: number;
  durationMinutes: number;
  avgSpeedKmh: number;
  originAddress: string;
  destinationAddress: string;
  polyline: [number, number][];  // array de [lat, lng]
}

interface GeoContextState {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  selectVehicle: (id: string) => void;
  clearSelection: () => void;
  ghostRoute: RouteHistoryItem | null;
  setGhostRoute: (route: RouteHistoryItem | null) => void;
  sendCommand: (vehicleId: string, command: 'engine_on' | 'engine_off' | 'lock' | 'unlock' | 'horn') => Promise<void>;
}
```

---

## 15. Integración con el sistema de permisos existente

```jsx
// En page.jsx
const { can } = usePermissions();

// Mostrar el módulo completo
if (!can("geolocalizacion", "geolocalizacion", "ver")) {
  return <AccessDenied />;
}

// Botones de acción — solo si tiene permiso de editar
const canControl = can("geolocalizacion", "geolocalizacion", "editar");
// PanelActions recibe canControl y deshabilita/oculta los botones si es false
```

---

## 16. CSS global del módulo (`geolocalizacion.css`)

```css
/* Ocultar atribución de Leaflet que choca con el diseño */
.leaflet-control-attribution {
  background: rgba(13, 17, 23, 0.7) !important;
  color: #484f58 !important;
  font-size: 10px !important;
  backdrop-filter: blur(4px);
}

/* Controles de zoom custom */
.leaflet-control-zoom a {
  background: var(--geo-bg-glass) !important;
  backdrop-filter: blur(12px) !important;
  border-color: var(--geo-border-strong) !important;
  color: var(--geo-text-primary) !important;
  font-family: 'DM Mono', monospace !important;
}

.leaflet-control-zoom a:hover {
  background: var(--geo-bg-hover) !important;
  border-color: var(--geo-border-accent) !important;
}

/* Quitar el fondo blanco que Leaflet pone detrás de popups */
.leaflet-popup-content-wrapper {
  background: var(--geo-bg-panel) !important;
  border: 1px solid var(--geo-border-strong) !important;
  border-radius: 10px !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
}

.leaflet-popup-tip {
  background: var(--geo-bg-panel) !important;
}
```