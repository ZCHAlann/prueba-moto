# Plan de Migración: Páginas Públicas → ApliSmart Motors (React/Vite)

## Contexto y alcance

El sistema anterior (Next.js en `motors-aplismart-main`) tenía una capa pública accesible sin autenticación, con landing, login, solicitar-demo, política de privacidad y recuperar acceso, envuelta en un `PublicShell` con navbar y footer. El sistema actual (React/Vite en `motors-aplismart-main/apps/frontend`) **no tiene ninguna página pública**; el único punto de entrada no autenticado es `/signin` que es una pantalla minimalista sin branding de marketing.

Lo que se va a hacer: migrar todo el contenido, copies, lógica y estructura de las páginas públicas del Next.js al React/Vite, adaptándolo al stack y sistema de diseño actuales. Sin la `public-shell` de Next, sin el `AuthPageLayout` genérico de TailAdmin, y **sin las secciones de descarga de app (Android/iOS)** ni el flujo de recuperar acceso.

---

## Páginas a migrar

| Página            | Ruta nueva      | Estado actual             | Observaciones                                   |
|-------------------|-----------------|---------------------------|-------------------------------------------------|
| Landing           | `/`             | No existe                 | Migración completa de contenido                 |
| Login             | `/signin`       | Existe pero genérica      | Reemplazar con diseño del Next, sin app móvil  |
| Solicitar demo    | `/solicitar-demo` | No existe               | Migración completa con formulario               |
| Política privacidad | `/politica-privacidad` | No existe      | Solo contenido estático                         |
| Recuperar acceso  | ~~`/forgot-password`~~ | —                  | **NO se migra** — fuera de alcance             |

---

## Archivos nuevos a crear

```
src/
├── pages/
│   ├── Landing/
│   │   └── page.tsx                   ← Landing page completa
│   ├── SolicitarDemo/
│   │   └── page.tsx                   ← Formulario de demo
│   └── PoliticaPrivacidad/
│       └── page.tsx                   ← Contenido estático
│
├── layout/
│   └── PublicLayout.tsx               ← Navbar + footer públicos (nuevo)
│
└── data/
    └── public-content.ts             ← Copies, FAQs, testimonios, flyers (nuevo)
```

---

## Archivos a modificar

| Archivo                                | Qué cambia                                                      |
|----------------------------------------|-----------------------------------------------------------------|
| `src/App.tsx`                          | Agregar rutas públicas + guard de redirect si ya hay sesión     |
| `src/pages/AuthPages/SignIn.tsx`       | Reemplazar layout con el diseño del Next sin sección app móvil  |
| `src/components/auth/SignInForm.tsx`   | Adaptar al hook `useAuth` existente (ya conectado al API)       |

---

## Paso 1 — Crear `src/data/public-content.ts`

Este archivo centraliza todos los textos del sistema anterior. Viene de `public-content-defaults.ts` y `privacy-policy-content.tsx` del Next.

```typescript
// src/data/public-content.ts

export const marketingContent = {
  heroTitle: "Mejor control de tu flota, tus motores y tus generadores en un solo lugar.",
  heroSubtitle:
    "ApliSmart Motors ayuda a empresas de internet, logistica, distribucion y operaciones de campo a ordenar vehiculos, camionetas, camiones, motores y generadores con una vista clara y facil de usar.",
  heroPrimaryCta: "Solicitar demo",
  heroSecondaryCta: "Ingresar",
  trustTitle: "Control real para vehiculos y equipos que no pueden detenerse",
  trustSubtitle:
    "Supervisa flota vehicular, motores, generadores, mantenimiento, combustible, alertas y reportes con una experiencia simple para jefes de operacion, administracion y gerencia.",
  differentiatorTitle: "Todo lo que tu empresa necesita para ordenar la operacion",
  differentiatorSubtitle:
    "Una sola plataforma para camionetas tecnicas, autos, camiones, motores, generadores y equipos de respaldo, con informacion clara por sede, responsable y estado.",
  plansTitle: "Planes pensados para empresas de distintos tamanos",
  plansSubtitle:
    "Empieza con lo esencial y crece cuando necesites mas usuarios, mas sedes y mas control sobre tu operacion.",
  faqTitle: "Preguntas frecuentes",
  faqSubtitle:
    "Respuestas directas para conocer como ApliSmart Motors puede ayudar a tu empresa desde la primera demo.",
  footerTagline:
    "ApliSmart Motors: control vehicular, mantenimiento y equipos motorizados en una sola plataforma.",
};

export const faqs = [
  {
    id: "faq-001",
    question: "ApliSmart Motors sirve solo para autos y camionetas?",
    answer:
      "No. Tambien puede ayudarte a controlar motores, generadores electricos, camiones y otros equipos de trabajo.",
  },
  {
    id: "faq-002",
    question: "Puedo controlar varias sedes o bases de operacion?",
    answer:
      "Si. Puedes organizar la informacion por sede, responsable, disponibilidad y estado operativo.",
  },
  {
    id: "faq-003",
    question: "Sirve para empresas con cuadrillas tecnicas o proveedores de internet?",
    answer:
      "Si. Es ideal para empresas que trabajan con camionetas de servicio, tecnicos en campo, motores y equipos de respaldo.",
  },
];

export const testimonials = [
  {
    id: "tst-001",
    name: "Carla Medina",
    role: "Jefa de operaciones",
    company: "RedNet Servicios",
    quote:
      "Ahora tenemos mejor control de camionetas tecnicas, responsables y mantenimientos sin depender de hojas sueltas.",
  },
  {
    id: "tst-002",
    name: "Luis Paredes",
    role: "Administrador de flota",
    company: "Energia y Respaldo Andino",
    quote:
      "Pudimos ordenar vehiculos, motores y generadores en una sola vista y reaccionar mas rapido ante mantenimientos y alertas.",
  },
];

export const flyers = [
  {
    id: "flyer-isp",
    title: "Servicios para proveedores de internet",
    subtitle:
      "Controla cuadrillas, camionetas de soporte y equipos de respaldo con una vista operativa clara.",
    audience: "ISP y cuadrillas tecnicas",
    ctaLabel: "Solicitar asesoria",
    ctaHref: "/solicitar-demo",
    imageUrl:
      "https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=1400",
  },
  {
    id: "flyer-logistica",
    title: "Mas control para flotas y distribucion",
    subtitle:
      "Supervisa vehiculos, mantenimientos, combustible y responsables sin depender de hojas sueltas.",
    audience: "Logistica y distribucion",
    ctaLabel: "Ver solucion",
    ctaHref: "/solicitar-demo",
    imageUrl:
      "https://images.pexels.com/photos/2199293/pexels-photo-2199293.jpeg?auto=compress&cs=tinysrgb&w=1400",
  },
  {
    id: "flyer-energia",
    title: "Respaldo tecnico para energia critica",
    subtitle:
      "Gestiona motores y generadores con alertas, checklist y seguimiento de contingencia.",
    audience: "Energia y respaldo",
    ctaLabel: "Agendar demo",
    ctaHref: "/solicitar-demo",
    imageUrl:
      "https://images.pexels.com/photos/35042792/pexels-photo-35042792.jpeg?auto=compress&cs=tinysrgb&w=1400",
  },
];

export const publicSettings = {
  brandName: "ApliSmart Motors",
  brandTagline: "Control de flota y equipos motorizados",
  supportEmail: "ventas@aplismartmotors.app",
  supportPhone: "+593 99 100 2200",
  publicUrl: "https://motors.aplismart.com",
};

export const privacyPolicySections = [
  {
    title: "1. Responsable del tratamiento",
    content:
      "ApliSmart Motors utiliza los datos enviados en formularios publicos para atender solicitudes comerciales, coordinar demostraciones, responder consultas y mantener seguimiento de interes legitimo sobre el producto.",
  },
  {
    title: "2. Datos que podemos solicitar",
    content:
      "Podemos solicitar nombre, empresa, correo, telefono, industria y mensaje. Estos datos se usan solo para contacto comercial, presentacion del servicio y seguimiento de solicitudes relacionadas con la plataforma.",
  },
  {
    title: "3. Finalidad del uso de datos",
    content:
      "Los datos personales se usan para responder solicitudes, enviar informacion comercial, coordinar una demo, preparar propuestas y mantener comunicacion relacionada con ApliSmart Motors. No se publican en la capa publica del sitio.",
  },
  {
    title: "4. Conservacion y acceso",
    content:
      "La informacion se conserva en el panel interno autorizado de ApliSmart Motors y solo puede ser consultada por personal habilitado para atencion comercial, soporte o administracion de la plataforma.",
  },
  {
    title: "5. Comparticion de datos",
    content:
      "ApliSmart Motors no comparte datos personales con terceros ajenos a la operacion comercial y soporte del producto, salvo requerimiento legal o necesidad tecnica estrictamente vinculada con la prestacion del servicio.",
  },
  {
    title: "6. Derechos del titular",
    content:
      "El titular puede solicitar actualizacion, rectificacion, limitacion o eliminacion de sus datos escribiendo al correo de soporte comercial informado en el sitio.",
  },
  {
    title: "7. Consentimiento",
    content:
      "Al marcar la casilla de aceptacion, el solicitante autoriza el uso de sus datos para contacto comercial, envio de informacion y seguimiento de la solicitud presentada en el sitio.",
  },
];

export const industryOptions = [
  "Proveedores de internet",
  "Logistica y distribucion",
  "Energia y respaldo",
  "Servicios tecnicos",
  "Transporte terrestre",
  "Flota corporativa",
];
```

**Notas para el agente:**
- Este archivo NO tiene dependencias de Next.js ni de los providers del Next.
- Es datos puros, puede importarse desde cualquier parte del React/Vite.
- Si en el futuro quieres hacer el contenido editable desde el panel platform, este archivo es el que se reemplaza por una llamada a la API.

---

## Paso 2 — Crear `src/layout/PublicLayout.tsx`

Este es el equivalente del `public-shell.tsx` del Next, adaptado a React Router v6.

```typescript
// src/layout/PublicLayout.tsx

import { Link, Outlet, useNavigate } from "react-router";
import { useAuth } from "../context/AuthContext";
import { publicSettings, marketingContent } from "../data/public-content";

const publicLinks = [
  { label: "Beneficios", href: "/#beneficios" },
  { label: "Modulos", href: "/#modulos" },
  { label: "Planes", href: "/#planes" },
  { label: "FAQ", href: "/#faq" },
];

export default function PublicLayout() {
  const { session, getHomePath } = useAuth();

  return (
    <div className="min-h-screen bg-white text-gray-950 dark:bg-gray-950 dark:text-white">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-gray-950/90">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-6">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src="/images/logo/logo.svg" className="h-8 dark:hidden" alt="ApliSmart Motors" />
            <img src="/images/logo/logo-dark.svg" className="hidden h-8 dark:block" alt="ApliSmart Motors" />
          </Link>

          {/* Nav links — solo desktop */}
          <nav className="hidden items-center gap-5 md:flex">
            {publicLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 transition hover:text-gray-950 dark:text-gray-400 dark:hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* CTAs */}
          <div className="flex items-center gap-2">
            {session ? (
              <Link
                to={getHomePath()}
                className="hidden rounded-lg border border-cyan-500 px-3 py-2 text-sm font-medium text-cyan-600 transition hover:bg-cyan-50 sm:inline-flex dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-950"
              >
                Abrir mi panel
              </Link>
            ) : (
              <Link
                to="/solicitar-demo"
                className="hidden rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:inline-flex dark:border-white/20 dark:text-gray-300 dark:hover:bg-white/5"
              >
                {marketingContent.heroPrimaryCta}
              </Link>
            )}
            <Link
              to="/signin"
              className="inline-flex rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"
            >
              {session ? "Cambiar acceso" : marketingContent.heroSecondaryCta}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Contenido de cada página ── */}
      <main>
        <Outlet />
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 bg-gray-950 text-white dark:border-white/10">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 lg:grid-cols-3 lg:px-6">

          {/* Col 1 — Branding */}
          <div>
            <img src="/images/logo/logo-dark.svg" className="h-8" alt="ApliSmart Motors" />
            <p className="mt-4 text-sm leading-6 text-gray-400">
              {marketingContent.footerTagline}
            </p>
          </div>

          {/* Col 2 — Accesos */}
          <div>
            <p className="text-sm font-semibold text-white">Accesos</p>
            <div className="mt-3 space-y-2 text-sm text-gray-400">
              <Link to="/signin" className="block hover:text-white">Ingresar</Link>
              <Link to="/solicitar-demo" className="block hover:text-white">Solicitar demo</Link>
              <Link to="/politica-privacidad" className="block hover:text-white">Politica de privacidad</Link>
            </div>
          </div>

          {/* Col 3 — Contacto */}
          <div>
            <p className="text-sm font-semibold text-white">Contacto</p>
            <div className="mt-3 space-y-2 text-sm text-gray-400">
              <p>{publicSettings.supportEmail}</p>
              <p>{publicSettings.supportPhone}</p>
              <p>{publicSettings.publicUrl}</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
```

**Notas para el agente:**
- Usa `<Outlet />` de React Router v6, no `{children}` como el Next.
- Los `href="/#beneficios"` de la nav funcionan en React Router como hash anchors normales — no necesitan nada especial.
- Si el logo no tiene variante dark, usa el mismo para ambos y quita la condicional `dark:`.

---

## Paso 3 — Modificar `src/App.tsx`

Agregar las rutas públicas envueltas en `PublicLayout`. El guard `GuestOperacion` que ya existe puede reutilizarse para redirigir a `/dashboard` si el usuario ya tiene sesión activa e intenta entrar a `/` o `/solicitar-demo`.

### Imports a agregar

```typescript
import PublicLayout from "./layout/PublicLayout";
import LandingPage from "./pages/Landing/page";
import SolicitarDemoPage from "./pages/SolicitarDemo/page";
import PoliticaPrivacidadPage from "./pages/PoliticaPrivacidad/page";
```

### Guard nuevo para páginas informativas

```typescript
/**
 * Para la landing y solicitar-demo: si el usuario ya tiene sesión de operacion,
 * lo mandamos directo a su panel. Si tiene sesión de plataforma, dejamos pasar
 * (puede querer ver el sitio público igual).
 */
function GuestLanding({ children }: { children: React.ReactNode }) {
  const { ready, session } = useAuth();
  if (!ready) return null;
  if (session?.scope === "operacion") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
```

### Bloque de rutas a agregar (antes de las rutas de operación)

```typescript
{/* ── Público ── */}
<Route element={<PublicLayout />}>
  <Route
    path="/"
    element={
      <GuestLanding>
        <LandingPage />
      </GuestLanding>
    }
  />
  <Route
    path="/solicitar-demo"
    element={
      <GuestLanding>
        <SolicitarDemoPage />
      </GuestLanding>
    }
  />
  <Route path="/politica-privacidad" element={<PoliticaPrivacidadPage />} />
</Route>
```

### Ajuste en la ruta de signin (quitar el redirect `/` → `/dashboard`)

El `<Route index path="/" element={<Navigate to="/dashboard" replace />} />` que está dentro del guard `RequireOperacion` actualmente hace que `/` siempre redirija a dashboard. Ese route debe **eliminarse** porque ahora `/` es la landing.

```diff
- <Route index path="/" element={<Navigate to="/dashboard" replace />} />
```

El guard `GuestLanding` ya maneja el caso de sesión activa.

---

## Paso 4 — Crear `src/pages/Landing/page.tsx`

Esta es la landing page completa. Se construye a partir de `landing-page.tsx` y `public-content-defaults.ts` del Next.

### Estructura de secciones

La landing tiene las siguientes secciones, en orden, todas con `id` para que los anchor links del navbar funcionen:

```
1. Hero          (#hero)          — headline + subtítulo + CTAs + grid de imágenes
2. Trust         (#beneficios)    — título de confianza + 3 cards de beneficio
3. Flyers        (#modulos)       — 3 cards de audiencia (ISP, logística, energía)
4. Testimonios                   — 2 quotes
5. Planes        (#planes)        — título + aviso de planes (placeholder hasta integrar API)
6. FAQ           (#faq)           — acordeón de preguntas frecuentes
```

### Especificación completa por sección

#### 1. Hero

**Layout:** dos columnas en desktop (texto izquierda, grid de imágenes derecha). En mobile, columna única.

**Contenido:**
- Badge pill: `"Control vehicular y equipos de campo"` — color teal/emerald
- H1: `marketingContent.heroTitle`
- Párrafo: `marketingContent.heroSubtitle`
- Botón primario (teal/filled): `marketingContent.heroPrimaryCta` → navega a `/solicitar-demo`
- Botón secundario (outline/dark): `marketingContent.heroSecondaryCta` → navega a `/signin`

**Grid de imágenes (columna derecha):**
Tres imágenes de Pexels ya definidas en `flyers` del `public-content.ts`. Usar las `imageUrl` de los tres flyers. El layout es una imagen grande arriba y dos pequeñas abajo (o la distribución que mejor encaje con el diseño actual).

Imágenes:
```
https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=1400
https://images.pexels.com/photos/2199293/pexels-photo-2199293.jpeg?auto=compress&cs=tinysrgb&w=1400
https://images.pexels.com/photos/35042792/pexels-photo-35042792.jpeg?auto=compress&cs=tinysrgb&w=1400
```

Caption bajo cada imagen: los `title` y `subtitle` del flyer correspondiente.

**Background del hero:** imagen de fondo con overlay oscuro — usar la primera imagen de Pexels con un `linear-gradient` encima. Ver referencia visual en la screenshot del sistema anterior.

Referencia visual: imagen `1780773762765_image.png` (la primera screenshot).

---

#### 2. Trust / Beneficios

**ID:** `id="beneficios"`

**Contenido:**
- H2: `marketingContent.trustTitle`
- Párrafo: `marketingContent.trustSubtitle`
- 3 cards de beneficio, con ícono, título y descripción. Los textos son:

```
Card 1:
  Título: "Flota vehicular"
  Descripción: "Camionetas, autos y camiones en control diario."
  Ícono: SVG de vehículo o similar

Card 2:
  Título: "Motores y generadores"
  Descripción: "Equipos críticos con seguimiento de estado, mantenimiento y alertas."
  Ícono: SVG de motor/rayo

Card 3:
  Título: "Operacion de campo"
  Descripción: "Conductores, sedes, combustible y checklist en una sola vista."
  Ícono: SVG de mapa/pin
```

---

#### 3. Flyers / Módulos

**ID:** `id="modulos"`

**Contenido:** iterar sobre el array `flyers` del `public-content.ts`. Cada flyer es una card con:
- Imagen de fondo (`imageUrl`) con overlay
- Badge: `flyer.audience`
- H3: `flyer.title`
- Párrafo: `flyer.subtitle`
- Botón: `flyer.ctaLabel` → `flyer.ctaHref`

Layout: 3 columnas en desktop, 1 en mobile.

---

#### 4. Testimonios

**Contenido:** iterar sobre `testimonials`. Cada testimonio:
- Quote: `testimonial.quote`
- Nombre: `testimonial.name`
- Rol: `testimonial.role` + `, ` + `testimonial.company`

Layout: 2 columnas en desktop.

---

#### 5. Planes

**ID:** `id="planes"`

**Contenido:**
- H2: `marketingContent.plansTitle`
- Párrafo: `marketingContent.plansSubtitle`
- Mensaje placeholder: `"Los planes disponibles se muestran segun la configuracion activa de la plataforma. Solicita una demo para conocer opciones y precios."` — dentro de una card o banner teal/suave.
- CTA: `"Solicitar demo"` → `/solicitar-demo`

> **Nota:** En el Next.js los planes venían del provider de plataforma via API. En esta versión pública estática no hay ese provider, así que la sección de planes es un placeholder. Si más adelante se necesita mostrar planes reales, se agrega un `fetch` al endpoint público.

---

#### 6. FAQ

**ID:** `id="faq"`

**Contenido:**
- H2: `marketingContent.faqTitle`
- Párrafo: `marketingContent.faqSubtitle`
- Acordeón de preguntas. Iterar sobre `faqs`. Cada ítem:
  - Pregunta: `faq.question`
  - Respuesta: `faq.answer`

**Implementación del acordeón:** con estado local `useState<string | null>` para el id del ítem abierto. Sin librerías externas.

---

### Estructura de componente completo

```typescript
// src/pages/Landing/page.tsx

import { useState } from "react";
import { Link } from "react-router";
import {
  marketingContent,
  faqs,
  testimonials,
  flyers,
} from "../../data/public-content";

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  return (
    <>
      {/* Hero */}
      <section id="hero" className="...">
        {/* contenido del hero */}
      </section>

      {/* Trust / Beneficios */}
      <section id="beneficios" className="...">
        {/* 3 benefit cards */}
      </section>

      {/* Flyers / Módulos */}
      <section id="modulos" className="...">
        {flyers.map((flyer) => (
          <div key={flyer.id}>
            {/* card de flyer */}
          </div>
        ))}
      </section>

      {/* Testimonios */}
      <section className="...">
        {testimonials.map((t) => (
          <div key={t.id}>
            {/* quote */}
          </div>
        ))}
      </section>

      {/* Planes */}
      <section id="planes" className="...">
        {/* placeholder de planes */}
      </section>

      {/* FAQ */}
      <section id="faq" className="...">
        {faqs.map((faq) => (
          <div key={faq.id}>
            <button onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}>
              {faq.question}
            </button>
            {openFaq === faq.id && <p>{faq.answer}</p>}
          </div>
        ))}
      </section>
    </>
  );
}
```

---

## Paso 5 — Reemplazar `src/pages/AuthPages/SignIn.tsx`

El `SignIn.tsx` actual es un wrapper minimalista que simplemente muestra el logo y el `<SignInForm />`. Hay que reemplazarlo con el diseño del Next, **quitando la sección de descarga de apps**.

### Diseño nuevo

Dos columnas en desktop:
- **Columna izquierda (dark):** fondo oscuro con imagen de autos, badge "Acceso unificado", título, descripción. Sin nada de Android/iOS.
- **Columna derecha (light):** formulario de login.

### Código del componente

```typescript
// src/pages/AuthPages/SignIn.tsx

import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";

export default function SignIn() {
  const { login, session, getHomePath, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    const result = await login({ email: loginValue, password, remember });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.title, { description: result.description });
      return;
    }

    const redirect = searchParams.get("redirect") || result.redirectTo;
    navigate(redirect, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-10 dark:bg-gray-950 lg:px-6">
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">

        {/* Columna izquierda — dark */}
        <section
          className="rounded-2xl bg-gray-950 p-7 text-white shadow-sm"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(2,6,23,0.97), rgba(15,23,42,0.88)), url('https://images.pexels.com/photos/4481328/pexels-photo-4481328.jpeg?auto=compress&cs=tinysrgb&w=1400')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <span className="inline-flex rounded-lg bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20">
            Acceso unificado
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight lg:text-4xl">
            Ingresa con tu correo o usuario
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-7 text-gray-300">
            Accede de forma segura a tu cuenta para administrar la plataforma o trabajar en la operacion diaria de tu empresa.
          </p>
        </section>

        {/* Columna derecha — formulario */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-gray-900 lg:p-8">
          <h2 className="text-2xl font-bold text-gray-950 dark:text-white">Iniciar sesion</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
            Escribe tu correo o usuario y tu contrasena. Te llevaremos a la ruta que corresponda segun tu perfil.
          </p>

          {/* Sesion activa */}
          {isAuthenticated && session ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-800 dark:bg-emerald-950/40">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Sesion activa</p>
              <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-200">
                {session.name} / {session.roleLabel}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => navigate(getHomePath())}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Continuar en mi panel
                </button>
                <button
                  onClick={() => {
                    logout();
                    toast.success("Sesion cerrada");
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/20 dark:text-gray-300"
                >
                  Cerrar sesion
                </button>
              </div>
            </div>
          ) : null}

          {/* Formulario */}
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Correo o usuario</span>
              <input
                type="text"
                autoComplete="username"
                value={loginValue}
                onChange={(e) => setLoginValue(e.target.value)}
                placeholder="correo@empresa.com o master"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200 dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:border-cyan-500 dark:focus:ring-cyan-900"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Contrasena</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-200 dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:border-cyan-500 dark:focus:ring-cyan-900"
              />
            </label>

            <label className="flex items-center gap-2.5 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-white/20"
              />
              Recordar sesion
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-gray-500 dark:text-gray-500">
              Acceso seguro para usuarios autorizados
            </span>
          </div>
        </section>

      </div>
    </div>
  );
}
```

**Notas para el agente:**
- El `login()` viene del `AuthContext.tsx` existente y ya funciona con el endpoint `/api/auth/login`. No hay que tocar el contexto.
- Se usa `useNavigate` en vez de `window.location.assign` para mejor integración con React Router.
- El toast usa `sonner` que ya está instalado y configurado en el `App.tsx` (`<Toaster />`).
- El link a `forgot-password` **no se incluye** — fuera de alcance.
- El `SignInForm.tsx` de `components/auth/` puede quedar como está o eliminarse; este nuevo `SignIn.tsx` no lo usa.

---

## Paso 6 — Crear `src/pages/SolicitarDemo/page.tsx`

Viene de `request-demo-page.tsx` del Next. Sin los `providers` del Next (`usePlatform`, `useFeedback`). Usa `sonner` para notificaciones y un `fetch` local para el submit.

### Comportamiento

- El formulario recoge: nombre, empresa, correo, teléfono, industria, objetivo, mensaje.
- Al submit, hace `POST /api/leads/demo` con el payload (el endpoint del backend Express).
- Si no existe ese endpoint aún, el submit puede mostrar solo el toast de éxito sin hacer fetch real — el agente debe dejar un `TODO` claro en el código.
- La modal de política de privacidad se implementa con estado local.

### Estructura del componente

```typescript
// src/pages/SolicitarDemo/page.tsx

import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { industryOptions, privacyPolicySections } from "../../data/public-content";

type DemoForm = {
  name: string;
  company: string;
  email: string;
  phone: string;
  industry: string;
  objective: string;
  message: string;
};

const initialForm: DemoForm = {
  name: "",
  company: "",
  email: "",
  phone: "",
  industry: industryOptions[0],
  objective: "Demo comercial",
  message: "",
};

export default function SolicitarDemoPage() {
  const [form, setForm] = useState<DemoForm>(initialForm);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.company.trim() || !form.email.trim()) {
      toast.error("Formulario incompleto", {
        description: "Completa nombre, empresa y correo antes de enviar.",
      });
      return;
    }
    if (!acceptedPrivacy) {
      toast.error("Aceptacion requerida", {
        description: "Debes aceptar la Politica de Privacidad para enviar la solicitud.",
      });
      return;
    }

    setSubmitting(true);
    try {
      // TODO: reemplazar con el endpoint real cuando exista
      // await fetch("/api/leads/demo", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ ...form, source: "Landing" }),
      // });
      toast.success("Solicitud registrada", {
        description: "Tu solicitud ya quedo registrada para seguimiento comercial.",
      });
      setForm(initialForm);
      setAcceptedPrivacy(false);
    } catch {
      toast.error("Error al enviar", {
        description: "No se pudo registrar la solicitud. Intenta nuevamente.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-100 px-4 py-14 dark:bg-gray-950 lg:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2">

        {/* Columna izquierda — info */}
        <section>
          <span className="inline-flex rounded-lg bg-teal-100 px-3 py-1 text-xs font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
            Solicitar demo
          </span>
          <h1 className="mt-4 text-4xl font-bold text-gray-950 dark:text-white">
            Agenda una demo para conocer el control total de tu operacion
          </h1>
          <p className="mt-4 text-base leading-7 text-gray-600 dark:text-gray-400">
            Cuentanos tu industria, tu empresa y el alcance esperado. Con esta informacion podremos preparar una demostracion alineada con tu flota vehicular, tus motores y tus generadores.
          </p>

          {/* Cards informativas */}
          <div className="mt-8 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">
                Que recibiras despues de enviar tu solicitud
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                <li>— Contacto comercial inicial por correo o telefono.</li>
                <li>— Revision del tipo de flota, motores, generadores o sedes que quieres controlar.</li>
                <li>— Propuesta de demo alineada con tu operacion real.</li>
              </ul>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">Privacidad</p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                La informacion enviada no se publica en la web. Solo se usa para responder tu solicitud y mantener seguimiento comercial interno.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-gray-900">
              <p className="text-sm font-semibold text-gray-950 dark:text-white">Canal de respuesta</p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                Responderemos desde ventas@aplismartmotors.app
              </p>
            </div>
          </div>
        </section>

        {/* Columna derecha — formulario */}
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-gray-900 lg:p-8">
          <h2 className="text-2xl font-bold text-gray-950 dark:text-white">Solicitud comercial</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {/* Nombre */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              />
            </label>

            {/* Empresa */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Empresa</span>
              <input
                type="text"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              />
            </label>

            {/* Correo */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Correo</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              />
            </label>

            {/* Telefono */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefono</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              />
            </label>

            {/* Objetivo */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Objetivo</span>
              <select
                value={form.objective}
                onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              >
                <option>Demo comercial</option>
                <option>Compra de plan</option>
                <option>Cotizacion</option>
              </select>
            </label>

            {/* Industria */}
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Industria</span>
              <select
                value={form.industry}
                onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              >
                {industryOptions.map((opt) => (
                  <option key={opt}>{opt}</option>
                ))}
              </select>
            </label>

            {/* Mensaje */}
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mensaje</span>
              <textarea
                rows={5}
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-200 dark:border-white/10 dark:bg-gray-800 dark:text-white"
              />
            </label>

            {/* Checkbox privacidad */}
            <div className="md:col-span-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 dark:border-white/10 dark:bg-gray-800/50">
              <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={acceptedPrivacy}
                  onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                />
                <span className="leading-6">
                  Acepto el uso de mis datos personales para recibir informacion comercial y seguimiento de mi solicitud, conforme a la{" "}
                  <button
                    type="button"
                    onClick={() => setShowPrivacyModal(true)}
                    className="font-semibold text-teal-700 underline underline-offset-2 dark:text-teal-400"
                  >
                    Politica de Privacidad
                  </button>
                  .
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar solicitud de demo"}
            </button>
          </div>
        </section>
      </div>

      {/* Modal política de privacidad */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
              <div>
                <p className="text-lg font-semibold text-gray-950 dark:text-white">Politica de Privacidad</p>
                <p className="mt-0.5 text-sm text-gray-500">Uso de datos personales en formularios publicos.</p>
              </div>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Cerrar
              </button>
            </div>
            <div className="max-h-[calc(88vh-88px)] overflow-y-auto px-5 py-5 space-y-5">
              {privacyPolicySections.map((section) => (
                <div key={section.title}>
                  <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{section.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{section.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Paso 7 — Crear `src/pages/PoliticaPrivacidad/page.tsx`

Página estática con el contenido de `privacyPolicySections`.

```typescript
// src/pages/PoliticaPrivacidad/page.tsx

import { privacyPolicySections } from "../../data/public-content";

export default function PoliticaPrivacidadPage() {
  return (
    <div className="bg-gray-100 px-4 py-14 dark:bg-gray-950 lg:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-gray-900">
          <h1 className="text-3xl font-bold text-gray-950 dark:text-white">Politica de Privacidad</h1>
          <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
            Uso de datos personales en formularios publicos de ApliSmart Motors.
          </p>
          <div className="mt-8 space-y-6">
            {privacyPolicySections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-semibold text-gray-950 dark:text-white">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-400">{section.content}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Resumen de cambios en `App.tsx`

El agente debe hacer estas modificaciones al `App.tsx` existente:

1. **Agregar imports** de `PublicLayout`, `LandingPage`, `SolicitarDemoPage`, `PoliticaPrivacidadPage`.

2. **Agregar guard** `GuestLanding` (definición arriba en Paso 3).

3. **Eliminar** `<Route index path="/" element={<Navigate to="/dashboard" replace />} />` del bloque `RequireOperacion`.

4. **Agregar bloque de rutas públicas** antes del bloque `RequireOperacion` (ver Paso 3).

5. **El `/signin` existente no cambia de ruta** — solo el componente en sí cambia (Paso 5).

---

## Checklist de implementación

```
[ ] Crear src/data/public-content.ts
[ ] Crear src/layout/PublicLayout.tsx
[ ] Crear src/pages/Landing/page.tsx
[ ] Crear src/pages/SolicitarDemo/page.tsx
[ ] Crear src/pages/PoliticaPrivacidad/page.tsx
[ ] Reemplazar src/pages/AuthPages/SignIn.tsx
[ ] Modificar src/App.tsx
    [ ] Agregar imports
    [ ] Agregar guard GuestLanding
    [ ] Agregar bloque de rutas públicas con PublicLayout
    [ ] Eliminar redirect / → /dashboard de RequireOperacion
[ ] Verificar que los logos existen en /public/images/logo/logo.svg y logo-dark.svg
[ ] Verificar que el Toaster de sonner ya esté en App.tsx (ya está)
[ ] Probar navegación: / → landing, /solicitar-demo → form, /signin → login nuevo
[ ] Probar que sesión activa en /signin muestra el bloque de sesion activa
[ ] Probar redirect: usuario con sesion va a / → redirige a /dashboard
```

---

## Notas finales

**Lo que NO se migra:**
- `forgot-password` — fuera de alcance explícito.
- Las secciones de descarga Android/iOS — eliminadas del login.
- El `public-content-store.ts` del Next (lector/escritor de JSON en disco) — no aplica en React/Vite SPA.
- El `AuthPageLayout.tsx` existente — ya no se usa con el nuevo SignIn.

**Dependencias del Next que NO existen en Vite:**
- `usePlatform()` → reemplazado por datos estáticos de `public-content.ts`.
- `useFeedback()` → reemplazado por `toast` de `sonner`.
- `Button`, `InputField`, `SurfaceCard` del Next → reemplazados por elementos HTML nativos con Tailwind.
- `Link` de `next/link` → reemplazado por `Link` de `react-router`.
- `useSearchParams` de `next/navigation` → reemplazado por `useSearchParams` de `react-router`.
```
