# Plan Completo — Acta de Entrega Digital en Asignaciones
> ApliSmart Motors · Fecha del plan: Junio 2026

---

## Índice
1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Cambios en base de datos](#2-cambios-en-base-de-datos)
3. [Cambios en backend](#3-cambios-en-backend)
4. [Cambios en upload.ts](#4-cambios-en-uploadts)
5. [Arquitectura frontend](#5-arquitectura-frontend)
6. [Flujo completo de usuario](#6-flujo-completo-de-usuario)
7. [Componentes a crear](#7-componentes-a-crear)
8. [Cambio rápido — tabla en lugar de tarjetas](#8-cambio-rápido--tabla-en-lugar-de-tarjetas)
9. [Generación del PDF](#9-generación-del-pdf)
10. [Librerías necesarias](#10-librerías-necesarias)
11. [Orden de implementación](#11-orden-de-implementación)

---

## 1. Resumen ejecutivo

### Qué se construye
Cuando se crea una asignación, en lugar del modal simple actual, se lanza un **wizard multi-paso** que:
1. Confirma la asignación (conductor + vehículo)
2. Guía al usuario a llenar los campos del acta (precargados desde la BD, editables)
3. Permite subir fotos del estado actual del vehículo
4. Captura la firma del Departamento Logístico (pizarra/mouse/touch)
5. Captura la firma del Responsable (conductor)
6. Genera el PDF del acta con las fotos como anexos en página aparte
7. Pregunta si está listo → guarda la asignación con todos los datos

### Qué NO cambia
- El endpoint `POST /assignments` — sigue igual, se llama al final del wizard
- El endpoint `POST /assignments/:id/finalize` — igual
- El componente `AssignmentsPage` en su estructura general
- El hook `useAssignments`

---

## 2. Cambios en base de datos

### Archivo: `apps/backend/src/db/schema/operational.ts`

Agregar columnas a `companyAssignments`:

```typescript
// Datos del acta
actaNumber:       varchar('acta_number',       { length: 40 }),
actaDate:         date('acta_date'),
actaTime:         varchar('acta_time',          { length: 10 }),
actaPlace:        varchar('acta_place',         { length: 160 }),
actaArea:         varchar('acta_area',          { length: 120 }),

// Datos extra del conductor al momento del acta
driverDni:        varchar('driver_dni',         { length: 40 }),
driverPhone:      varchar('driver_phone',       { length: 40 }),
driverRole:       varchar('driver_role',        { length: 120 }),

// Estado del vehículo al momento de entrega
vehicleOdometer:  varchar('vehicle_odometer',   { length: 40 }),
vehicleFuelLevel: varchar('vehicle_fuel_level', { length: 40 }),
vehicleCondition: varchar('vehicle_condition',  { length: 80 }),

// Checklists como JSON
// Estructura novedades:
// { sinNovedades, lucesDanadas, faltanAccesorios, fallaMecanica,
//   llantasMalEstado, requiereMantenimiento, choqueAccidente,
//   golpes, interiorSucio, multas, otros: string }
novedades:        jsonb('novedades').default({}),

// Estructura accesorios:
// { matricula, llaveRepuesto, triangulos, herramientas,
//   seguro, gata, extintor, radio,
//   llavePrincipal, llaveRuedas, botiquin, otros: string }
accesorios:       jsonb('accesorios').default({}),

// Texto libre
novedadesText:    text('novedades_text'),

// Firmas — URLs a archivos en /uploads/assignments/
signatureLogUrl:  text('signature_log_url'),
signatureRespUrl: text('signature_resp_url'),

// Fotos del estado del vehículo — array de URLs
// (handoverUrl ya existe y apuntará al PDF)
vehiclePhotoUrls: text('vehicle_photo_urls').array().default([]),
```

### Migración
```bash
# Desde apps/backend
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## 3. Cambios en backend

### Archivo: `apps/backend/src/routes/company/assignments.ts`

#### 3.1 Actualizar `createAssignmentSchema`
Agregar los campos del acta como opcionales para que el `POST` inicial pueda ya traerlos (aunque también se actualizan vía handover):

```typescript
// No es necesario — el POST crea la asignación básica.
// Los datos del acta se guardan con el PUT /handover (ver 3.2)
```

#### 3.2 Nuevo endpoint: `PUT /:assignId/handover`

Este endpoint recibe todos los datos del acta ya completada y los persiste. Se llama desde el frontend justo después de que el usuario confirma el PDF.

```typescript
const handoverSchema = z.object({
  // Acta
  actaNumber:       z.string().optional().nullable(),
  actaDate:         z.string().optional().nullable(),
  actaTime:         z.string().optional().nullable(),
  actaPlace:        z.string().optional().nullable(),
  actaArea:         z.string().optional().nullable(),
  // Conductor
  driverDni:        z.string().optional().nullable(),
  driverPhone:      z.string().optional().nullable(),
  driverRole:       z.string().optional().nullable(),
  // Vehículo
  vehicleOdometer:  z.string().optional().nullable(),
  vehicleFuelLevel: z.string().optional().nullable(),
  vehicleCondition: z.string().optional().nullable(),
  // Checklists
  novedades:        z.record(z.unknown()).optional(),
  accesorios:       z.record(z.unknown()).optional(),
  novedadesText:    z.string().optional().nullable(),
  // Archivos
  signatureLogUrl:  z.string().optional().nullable(),
  signatureRespUrl: z.string().optional().nullable(),
  vehiclePhotoUrls: z.array(z.string()).optional(),
  handoverUrl:      z.string().optional().nullable(),  // URL del PDF
});

router.put(
  '/:assignId/handover',
  requireModule('asignaciones'),
  requireSupervisor,
  validate(handoverSchema),
  async (req, res, next) => {
    try {
      const companyId = req.companyId!;
      const assignId = parseId('assignment', req.params.assignId);
      const body = req.body as z.infer<typeof handoverSchema>;

      const existing = await db.select().from(companyAssignments)
        .where(and(
          eq(companyAssignments.id, assignId),
          eq(companyAssignments.companyId, companyId)
        )).limit(1);

      if (!existing.length) throw new NotFoundError('Asignación', req.params.assignId);

      const [updated] = await db.update(companyAssignments)
        .set({ ...body, updatedAt: new Date() })
        .where(and(
          eq(companyAssignments.id, assignId),
          eq(companyAssignments.companyId, companyId)
        ))
        .returning();

      await logAudit(db, companyId, {
        entity: 'assignments',
        entityId: toId('assignment', updated.id),
        action: 'handover',
        actorId: req.user!.sub,
        actorName: req.user!.name,
        description: `Acta de entrega registrada para asignación "${toId('assignment', updated.id)}".`,
      });

      res.json(serializeAssignment(updated));
    } catch (err) {
      next(err);
    }
  }
);
```

#### 3.3 Actualizar `serializeAssignment`

Agregar todos los campos nuevos al serializer:

```typescript
function serializeAssignment(a: typeof companyAssignments.$inferSelect) {
  return {
    // ... campos actuales ...
    actaNumber:       a.actaNumber,
    actaDate:         a.actaDate,
    actaTime:         a.actaTime,
    actaPlace:        a.actaPlace,
    actaArea:         a.actaArea,
    driverDni:        a.driverDni,
    driverPhone:      a.driverPhone,
    driverRole:       a.driverRole,
    vehicleOdometer:  a.vehicleOdometer,
    vehicleFuelLevel: a.vehicleFuelLevel,
    vehicleCondition: a.vehicleCondition,
    novedades:        a.novedades,
    accesorios:       a.accesorios,
    novedadesText:    a.novedadesText,
    signatureLogUrl:  a.signatureLogUrl,
    signatureRespUrl: a.signatureRespUrl,
    vehiclePhotoUrls: a.vehiclePhotoUrls ?? [],
    handoverUrl:      a.handoverUrl,
  };
}
```

---

## 4. Cambios en upload.ts

### Problema actual
`ALLOWED_MIME` solo acepta imágenes. Las firmas se van a subir como PNG (bien), pero el PDF también necesita subirse.

### Solución
Agregar una ruta específica para PDFs de actas:

```typescript
// Agregar a ALLOWED_CATEGORIES
'handover-pdfs'

// Agregar filtro para PDF
function pdfFilter(_req, file, cb) {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new AppError(400, 'Solo se aceptan PDFs aquí.'));
}

// Agregar ruta
router.post('/handover-pdf', (req, res, next) => {
  const upload = multer({
    storage: buildStorage('handover-pdfs'),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB para PDFs con fotos
    fileFilter: pdfFilter,
  }).single('pdf');  // Un solo PDF

  upload(req, res, (err) => {
    if (err) return next(err);
    const file = req.file;
    if (!file) return next(new AppError(400, 'No se recibió el PDF.'));
    const companyId = req.query.companyId as string | undefined;
    const folder = companyId ? `handover-pdfs/${companyId}` : 'handover-pdfs';
    res.json({ url: `/uploads/${folder}/${file.filename}` });
  });
});
```

### Las firmas
Las firmas son imágenes PNG → ya funciona con `/upload/assignment-photos`. Se suben ahí sin cambios.

---

## 5. Arquitectura frontend

### Archivos a crear

```
pages/Gestion/Asignaciones/
├── page.tsx                         ← MODIFICAR (tabla + trigger wizard)
│
components/assignments/
├── HandoverWizard.tsx               ← CREAR — orquestador del wizard
├── wizard-steps/
│   ├── Step0Confirm.tsx             ← CREAR — "¿Confirmar asignación?"
│   ├── Step1ActaInfo.tsx            ← CREAR — Datos generales del acta
│   ├── Step2DriverData.tsx          ← CREAR — Datos del conductor
│   ├── Step3VehicleData.tsx         ← CREAR — Datos del vehículo
│   ├── Step4Novedades.tsx           ← CREAR — Checklist novedades
│   ├── Step5Accesorios.tsx          ← CREAR — Checklist accesorios
│   ├── Step6Photos.tsx              ← CREAR — Subir fotos del vehículo
│   ├── Step7SignatureLog.tsx        ← CREAR — Firma depto. logístico
│   ├── Step8SignatureResp.tsx       ← CREAR — Firma responsable
│   └── Step9Preview.tsx            ← CREAR — Preview PDF + confirmación
│
├── SignatureCanvas.tsx              ← CREAR — Canvas de firma (pizarra/mouse/touch)
├── ActaDocument.tsx                 ← CREAR — HTML del acta para html2canvas
└── useHandoverWizard.ts             ← CREAR — Estado y lógica del wizard
```

### Hook de actualización
```
hooks/useAssignments.ts              ← MODIFICAR — agregar updateHandover()
```

---

## 6. Flujo completo de usuario

```
[Usuario selecciona conductor + vehículo]
           ↓
    STEP 0 — Modal pequeño
    "¿Confirmar asignación?"
    Conductor: Juan Pérez
    Vehículo: GTH-1059
    [Cancelar]  [Sí, continuar →]
           ↓
    STEP 1 — Datos generales del acta
    ┌─────────────────────────────┐
    │ Acta N.°  [auto-generado]   │
    │ Fecha     [hoy, editable]   │
    │ Hora      [ahora, editable] │
    │ Lugar     [editable]        │
    │ Empresa   [del tenant]      │
    │ Área/Cuadrilla [editable]   │
    └─────────────────────────────┘
           ↓
    STEP 2 — Datos del conductor
    ┌─────────────────────────────┐
    │ Nombre    [de BD, editable] │
    │ Cédula    [editable]        │
    │ Teléfono  [de BD, editable] │
    │ Cargo     [editable]        │
    └─────────────────────────────┘
           ↓
    STEP 3 — Datos del vehículo
    ┌─────────────────────────────┐
    │ Placa     [de BD, editable] │
    │ Marca     [de BD, editable] │
    │ Modelo    [de BD, editable] │
    │ Color     [de BD, editable] │
    │ Año       [de BD, editable] │
    │ Km al devolver [editable]   │
    │ Combustible    [editable]   │
    │ Estado general [editable]   │
    └─────────────────────────────┘
           ↓
    STEP 4 — Novedades visibles
    ┌─────────────────────────────┐
    │ Toggle cards SI/NO para:    │
    │ ☑ Sin novedades visibles    │
    │ ☐ Luces dañadas             │
    │ ☐ Faltan accesorios         │
    │ ☐ Falla mecánica            │
    │ ☐ Llantas en mal estado     │
    │ ☐ Requiere mantenimiento    │
    │ ☐ Choque / accidente        │
    │ ☐ Golpes                    │
    │ ☐ Interior sucio            │
    │ ☐ Multas reportadas         │
    │ Otros: [textarea]           │
    └─────────────────────────────┘
           ↓
    STEP 5 — Accesorios / documentos
    ┌─────────────────────────────┐
    │ Toggle cards SI/NO para:    │
    │ Matrícula / Llave principal │
    │ Llave repuesto / Llave rued.│
    │ Triángulos / Gata           │
    │ Herramientas / Extintor     │
    │ Seguro-póliza / Botiquín    │
    │ Radio-GPS                   │
    │ Otros: [input]              │
    └─────────────────────────────┘
           ↓
    STEP 6 — Fotos del vehículo
    ┌─────────────────────────────┐
    │ Drop zone + preview grid    │
    │ Sube las fotos que necesites│
    │ (se adjuntan como anexos    │
    │  en el PDF)                 │
    └─────────────────────────────┘
    → Se suben a /upload/assignment-photos al avanzar
           ↓
    STEP 7 — Firma Depto. Logístico
    ┌─────────────────────────────┐
    │ [Canvas de firma grande]    │
    │ Conecta la pizarra o firma  │
    │ con el mouse / touch        │
    │                             │
    │ [Limpiar firma]             │
    └─────────────────────────────┘
    → Canvas → PNG blob → sube a /upload/assignment-photos
           ↓
    STEP 8 — Firma Responsable
    ┌─────────────────────────────┐
    │ (mismo componente de canvas)│
    └─────────────────────────────┘
    → Igual que Step 7
           ↓
    STEP 9 — Preview y confirmación
    ┌─────────────────────────────┐
    │ [Preview del PDF del acta]  │
    │                             │
    │ ¿Todo correcto?             │
    │ [← Editar]  [Generar PDF ✓]│
    └─────────────────────────────┘
    → Genera PDF con html2canvas + jsPDF
    → Sube PDF a /upload/handover-pdf
    → POST /assignments (crea asignación)
    → PUT /assignments/:id/handover (guarda datos acta)
    → Modal "¡Listo!" con botón de descarga del PDF
```

---

## 7. Componentes a crear

### 7.1 `HandoverWizard.tsx`
Componente principal. Controla:
- `currentStep` (0–9)
- `wizardData` — todo el estado acumulado del acta
- Navegación siguiente/anterior
- Animación entre pasos (framer-motion, slide lateral)
- Barra de progreso en la parte superior

Props que recibe:
```typescript
type Props = {
  open: boolean;
  driverId: string;
  assetId: string;
  driver: ApiDriver;
  asset: Asset;
  onClose: () => void;
  onComplete: () => void; // refresh de asignaciones
}
```

### 7.2 `useHandoverWizard.ts`
Hook que centraliza todo el estado del wizard:
```typescript
type WizardData = {
  // Step 1
  actaNumber: string;
  actaDate: string;
  actaTime: string;
  actaPlace: string;
  actaArea: string;
  // Step 2
  driverName: string;
  driverDni: string;
  driverPhone: string;
  driverRole: string;
  // Step 3
  vehiclePlate: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehicleYear: string;
  vehicleOdometer: string;
  vehicleFuelLevel: string;
  vehicleCondition: string;
  // Step 4
  novedades: NovedadesState;
  novedadesText: string;
  // Step 5
  accesorios: AccesoriosState;
  accesoriosOtros: string;
  // Step 6
  vehiclePhotos: File[];
  vehiclePhotoUrls: string[]; // después de subir
  // Step 7 & 8
  signatureLogDataUrl: string | null;
  signatureLogUrl: string | null;   // después de subir
  signatureRespDataUrl: string | null;
  signatureRespUrl: string | null;  // después de subir
  // PDF
  pdfUrl: string | null;
}
```

Funciones del hook:
- `setField(key, value)` — actualiza un campo
- `uploadPhotos()` — sube fotos al backend, guarda URLs
- `uploadSignature(type, dataUrl)` — sube una firma, guarda URL
- `generateAndUploadPdf()` — genera PDF, lo sube, guarda URL
- `saveAssignment()` — POST create + PUT handover
- `reset()` — limpia todo el estado

### 7.3 `SignatureCanvas.tsx`
```typescript
type Props = {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  existingDataUrl?: string | null;
}
```

Implementación:
- `<canvas>` de ancho fijo (600px) × alto (200px)
- Eventos: `mousedown`, `mousemove`, `mouseup`, `mouseleave`
- Touch: `touchstart`, `touchmove`, `touchend`
- **Pizarra Wacom/tablet:** usa eventos de puntero (`pointerdown`, `pointermove`, `pointerup`) con `e.pointerType === 'pen'` — no requiere drivers especiales, funciona nativamente en Chrome/Edge via Pointer Events API
- Botón "Limpiar" → `ctx.clearRect`
- Botón "Guardar firma" → `canvas.toDataURL('image/png')` → llama `onSave`
- Indicador visual de si hay firma guardada (check verde)

### 7.4 `ActaDocument.tsx`
Componente React que renderiza el HTML del acta **exactamente igual** al HTML del `prueba.html` que ya tienes. Recibe todos los datos del wizard como props y los inyecta. Este componente se renderiza fuera del viewport (`position: absolute; left: -9999px`) y luego `html2canvas` lo captura.

Estructura del componente:
```typescript
type ActaDocumentProps = {
  data: WizardData;
  signatureLogImg: string | null;
  signatureRespImg: string | null;
}
```

### 7.5 Steps individuales (Step1 → Step8)
Cada step es un componente funcional simple:
- Recibe `data: WizardData` y `onChange: (key, value) => void`
- Muestra solo los campos de su sección
- Diseño con las mismas clases Tailwind del resto del proyecto
- Animado con `motion.div` de framer-motion (slide desde la derecha al avanzar, desde la izquierda al retroceder)

### 7.6 `Step4Novedades.tsx` y `Step5Accesorios.tsx`
En lugar de checkboxes aburridos, usar **toggle cards** de dos estados:

```
┌──────────────────────┐   ┌──────────────────────┐
│  🚗 Luces dañadas    │   │  ✅ Matrícula         │
│                      │   │                      │
│    [ NO ]  [ SI ]    │   │    [ SI ]  [ NO ]    │
└──────────────────────┘   └──────────────────────┘
```

Estado por defecto: NO para novedades (el vehículo está bien), SI para accesorios (el vehículo tiene todo).

---

## 8. Cambio rápido — tabla en lugar de tarjetas

### En `AssignmentsPage` (page.tsx)

El board view con las tarjetas de asignaciones activas se reemplaza con una tabla, igual al estilo ya usado en otros módulos.

Columnas de la tabla de asignaciones activas:
| # | Conductor | Código | Vehículo | Placa | Desde | Días | Acta | Acciones |
|---|-----------|--------|----------|-------|-------|------|------|---------|

- **Acta:** ícono de documento si tiene `handoverUrl`, "Sin acta" si no
- **Acciones:** botón "Detalle" y botón "Finalizar"

---

## 9. Generación del PDF

### Librerías
```bash
npm install html2canvas jspdf
```

### Proceso

```typescript
async function generatePdf(data: WizardData, photoUrls: string[]): Promise<Blob> {
  // 1. Renderizar ActaDocument en un div oculto
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:794px';
  document.body.appendChild(container);
  
  // ReactDOM.render(<ActaDocument data={data} .../>, container)
  // (usar createRoot en React 18)
  
  // 2. html2canvas → canvas del acta
  const actaCanvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });
  
  // 3. jsPDF — página 1: el acta
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const imgData = actaCanvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  
  // 4. Página 2+: anexos fotográficos
  if (photoUrls.length > 0) {
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.text('ANEXOS — Estado del vehículo', 105, 20, { align: 'center' });
    
    // Grid 2x3 de fotos por página
    let x = 15, y = 35, count = 0;
    for (const url of photoUrls) {
      const imgElement = await loadImage(url);
      const imgCanvas = document.createElement('canvas');
      // ... dibujar en canvas y agregar al PDF
      pdf.addImage(imgCanvas.toDataURL(), 'JPEG', x, y, 85, 60);
      count++;
      x = count % 2 === 0 ? 15 : 110;
      if (count % 2 === 0) y += 70;
      if (count % 6 === 0 && count < photoUrls.length) {
        pdf.addPage();
        x = 15; y = 35; 
      }
    }
  }
  
  // 5. Limpiar DOM
  document.body.removeChild(container);
  
  return pdf.output('blob');
}
```

### Subida del PDF
```typescript
async function uploadPdf(blob: Blob, companyId: string): Promise<string> {
  const formData = new FormData();
  formData.append('pdf', blob, `acta-${Date.now()}.pdf`);
  
  const res = await fetch(`/api/upload/handover-pdf?companyId=${companyId}`, {
    method: 'POST',
    body: formData,
  });
  
  const { url } = await res.json();
  return url;
}
```

---

## 10. Librerías necesarias

### Frontend (agregar)
```bash
npm install html2canvas jspdf
npm install --save-dev @types/jspdf
```

`html2canvas` — convierte el DOM a canvas  
`jspdf` — genera el PDF a partir de canvas

### Backend (ya existen)
- `multer` — ya instalado, solo agregar la ruta para PDFs
- `drizzle-kit` — para generar la migración

---

## 11. Orden de implementación

### Fase 1 — Backend (30 min)
1. Agregar columnas a `companyAssignments` en `operational.ts`
2. Correr migración: `npx drizzle-kit generate && npx drizzle-kit migrate`
3. Agregar endpoint `PUT /:assignId/handover` en `assignments.ts`
4. Actualizar `serializeAssignment` con campos nuevos
5. Agregar ruta `/upload/handover-pdf` en `upload.ts`

### Fase 2 — Hook y tipos (20 min)
6. Actualizar tipo `Assignment` en `useAssignments.ts` con campos nuevos
7. Agregar `updateHandover(id, data)` al hook `useAssignments`

### Fase 3 — Cambio rápido tabla (20 min)
8. Reemplazar tarjetas de asignaciones activas por tabla en `page.tsx`

### Fase 4 — Wizard esqueleto (40 min)
9. Crear `useHandoverWizard.ts` con estado y funciones
10. Crear `HandoverWizard.tsx` con estructura, barra de progreso y navegación
11. Conectar a `page.tsx` — reemplazar el modal simple de confirmación por el wizard

### Fase 5 — Steps de datos (60 min)
12. `Step0Confirm.tsx` — confirmación inicial
13. `Step1ActaInfo.tsx` — datos generales
14. `Step2DriverData.tsx` — datos conductor (precarga desde `driver`)
15. `Step3VehicleData.tsx` — datos vehículo (precarga desde `asset`)
16. `Step4Novedades.tsx` — toggle cards novedades
17. `Step5Accesorios.tsx` — toggle cards accesorios

### Fase 6 — Fotos y firmas (40 min)
18. `Step6Photos.tsx` — dropzone + preview + upload
19. `SignatureCanvas.tsx` — canvas con soporte mouse/touch/pen
20. `Step7SignatureLog.tsx` — firma logística (usa SignatureCanvas)
21. `Step8SignatureResp.tsx` — firma responsable (usa SignatureCanvas)

### Fase 7 — PDF (60 min)
22. Instalar `html2canvas` y `jspdf`
23. `ActaDocument.tsx` — HTML del acta como componente React
24. `Step9Preview.tsx` — preview + botón generar
25. Función `generatePdf()` y `uploadPdf()`

### Fase 8 — Integración final (30 min)
26. Conectar todo en `HandoverWizard.tsx` — flujo completo end-to-end
27. Modal final "¡Listo!" con descarga del PDF
28. Manejo del botón "Editar" (volver a Step 1 con datos llenos)

---

## Notas importantes

### Pizarra digital
El `SignatureCanvas` funciona con cualquier tableta Wacom o pizarra conectada por USB sin instalar nada extra. Chrome y Edge exponen los eventos de stylus a través de la **Pointer Events API** nativa. Solo hay que escuchar `pointerdown/pointermove/pointerup` y verificar `event.pointerType === 'pen'`. La presión del lápiz también está disponible en `event.pressure` si se quiere variar el grosor del trazo.

### Guardado del PDF
El PDF no se guarda en la base de datos. Solo se guarda la **URL** en `handoverUrl`. El archivo físico queda en el servidor en `/uploads/handover-pdfs/{companyId}/`. Esta es la misma estrategia que ya usan las fotos en el proyecto.

### "¿Está listo?" — flujo de vuelta
Si el usuario dice "No" en el último step, el wizard simplemente regresa al Step 1 con **todos los campos llenos** tal como los dejó. No se pierde nada porque el estado vive en `useHandoverWizard` que no se destruye hasta que el wizard se cierra.

### Número de acta
Se puede auto-generar como `ACTA-{YYYY}-{ID_asignación}` o dejar que el usuario lo ingrese manualmente. Recomiendo auto-generarlo con posibilidad de edición.

### Campos del acta que vienen de la BD
| Campo en acta | Fuente |
|---------------|--------|
| Nombre conductor | `driver.firstName + driver.lastName` |
| Teléfono conductor | `driver.phone` |
| Placa | `asset.plate` |
| Marca | `asset.brand` |
| Modelo | `asset.model` |
| Color | `asset.color` |
| Año | `asset.year` |
| Fecha | `new Date()` |
| Hora | `new Date()` |
| Empresa | sesión del tenant |