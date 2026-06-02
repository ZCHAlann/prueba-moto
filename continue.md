Briefing completo para la siguiente sesión

Contexto del proyecto: ApliSmart Motors — plataforma SaaS multi-tenant con dos scopes: operacion (empresa) y plataforma (superadmin). El backend es Express + Drizzle ORM + PostgreSQL. El frontend es React + Vite + TailwindCSS. Ya están construidos y funcionando los endpoints del backend en routes/platform/: companies.ts, plans.ts, leads.ts, stats.ts e index.ts. El index.ts monta todo bajo /platform/* con los middlewares authenticate + requirePlatform, expone GET /platform/state (snapshot inicial) y registra los 4 subrouters.

Lo que hay que construir en el frontend — scope plataforma (superadmin):
1. Hooks de plataforma — crear en src/hooks/ los siguientes archivos nuevos:

usePlatformStats.ts — fetch a GET /platform/stats, devuelve el objeto completo con companies, leads, users, alerts.trialExpiringSoon, recent.companies, generatedAt. Maneja loading y error.
usePlatformCompanies.ts — fetch a GET /platform/companies (listado), POST /platform/companies, PUT /platform/companies/:id, DELETE /platform/companies/:id. El shape de empresa viene del schema companies de src/db/schema/platform.ts: campos id, name, slug, planId, status (enum: active|inactive|suspended|trial), enabledModules[], industry, country, city, contactName, contactEmail, contactPhone, website, notes, trialEndsAt, contractStartAt, contractEndAt, createdAt, updatedAt.
usePlatformLeads.ts — fetch a GET /platform/leads, POST, PUT /:id, DELETE /:id. Shape del lead: id, companyName, contactName, contactEmail, contactPhone, industry, country, city, status (enum: nuevo|contactado|demo_agendada|propuesta_enviada|ganado|perdido), source, assignedTo, estimatedValue, notes, convertedToCompanyId, convertedAt, createdAt, updatedAt.
usePlatformPlans.ts — fetch a GET /platform/plans, POST, PUT /:id, DELETE /:id. Shape del plan: id (string slug), name, tier (enum: free|starter|pro|enterprise), monthlyPrice, annualPrice, maxUsers, maxAssets, allowedModules[], isActive.


2. Páginas a crear — todas en src/pages/Platform/:

Dashboard/page.tsx — reemplazar el actual vacío. Usa usePlatformStats. Estructura: header con título "Panel de plataforma" y subtítulo, badge "Superadmin". Luego 4 KPI cards (empresas activas, trial activas, leads en pipeline, tasa de conversión %). Fila 1: gráfica de línea doble (companies.newThisMonth vs mes anterior + leads.newThisMonth vs mes anterior, 12 meses simulados desde generatedAt) + donut de empresas por plan (companies.byPlan). Fila 2: barras verticales dobles comparando este mes vs anterior para empresas y leads + barras horizontales de leads por status (leads.byStatus). Fila 3: radar de salud de la plataforma (5 ejes: empresas activas %, conversión de leads %, usuarios activos %, crecimiento MoM %, pipeline value normalizado) + tabla de alerts.trialExpiringSoon con columnas nombre, email, días restantes, botón acción. Fila 4: lista recent.companies (últimas 5).
Companies/page.tsx — usa usePlatformCompanies + usePlatformPlans. KPIs: total empresas, activas, en trial, suspendidas. Gráfica de barras verticales dobles (activas vs trial por mes). Gráfica de barras horizontales (top empresas por usuarios o por módulos habilitados). Donut por plan. Tabla con búsqueda, filtro por status y plan, columnas: nombre, plan, status (pill de color), módulos activos, contacto, fecha creación, acciones (editar, suspender, ver detalle). Modal de creación/edición con todos los campos del schema.
Leads/page.tsx — usa usePlatformLeads. KPIs: total leads, en pipeline activo, ganados este mes, tasa conversión. Kanban visual de los 6 estados del enum con conteo por columna. Gráfica de línea del funnel a lo largo del tiempo. Barras horizontales por fuente (source). Dispersión: eje X = estimatedValue, eje Y = días en pipeline, punto = lead (hover muestra nombre empresa). Tabla con filtro por status, búsqueda, columnas: empresa, contacto, status pill, fuente, valor estimado, asignado a, fecha. Modal crear/editar lead con todos los campos.
Plans/page.tsx — usa usePlatformPlans. KPIs: planes activos, empresas por plan (de usePlatformStats). Barras verticales de empresas por tier. Tabla de planes con columnas: id, nombre, tier badge, precio mensual, precio anual, límite usuarios, límite activos, módulos, activo toggle. Modal para crear/editar plan (solo visible si session.role === 'superadmin').


3. Componentes y librerías requeridos:

ReactApexChart — ya instalado, mismo patrón que DashboardOverview (documento 8). Usar ApexOptions tipado. Todos los charts con background: "transparent", fontFamily: "Outfit, sans-serif", toolbar: { show: false }, tooltip: { theme: "dark" }.
Framer Motion (framer-motion) — ya en el proyecto (ver FuelPage en documento 6). Envolver cada sección con motion.div con initial={{ opacity: 0, y: 16 }}, animate={{ opacity: 1, y: 0 }}, transition={{ duration: 0.35, delay: i * 0.07 }} para stagger de cards. Los modales usan AnimatePresence + motion.div con scale: 0.96 → 1 igual que en FuelPage.
Shadcn/ui — usar Badge, Button, Card, Separator, Tooltip de src/components/ui/ que ya existen en el proyecto.
RadarChart custom — el componente SVG puro que está en documento 11 (src/components/ui/charts/RadarChart.tsx) ya existe y es interactivo con hover. Para el dashboard de plataforma se reutiliza pasando los 5 ejes de métricas de plataforma en lugar de los de combustible, adaptando la interfaz de props.
KpiCard — reutilizar src/components/dashboard/kpi-card.tsx que ya existe, mismo patrón que DashboardOverview.
ChartCard — definir localmente en cada página (patrón del documento 8): rounded-2xl border border-white/[0.06] bg-white dark:bg-[#0F172A] px-5 pb-5 pt-5.
StatusPill — ya existe en src/components/common/StatusPill.tsx, usarlo para los status de empresas y leads.


4. AuthContext — ya implementado (documento 10). En las páginas de plataforma usar const { session } = useAuth() y verificar session?.scope === 'plataforma'. El session.role puede ser superadmin o admin_saas. Solo superadmin puede crear/editar/eliminar planes (guardar con session.role === 'superadmin' para mostrar/ocultar botones).

5. Navegación — platform-navigation.ts (documento 9) ya tiene las rutas /platform/dashboard, /platform/companies, /platform/plans, /platform/leads. El PlatformLayout.tsx en src/layout/ ya existe. Solo hay que crear las páginas en las rutas correctas y asegurarse de que App.tsx tenga las rutas registradas bajo el layout de plataforma.

6. Tipos — existe src/types/platform.ts. Agregar/verificar que tenga: PlatformCompany, PlatformLead, PlatformPlan, PlatformStats alineados exactamente con los schemas de src/db/schema/platform.ts (documento 2).

Orden de implementación sugerido para la próxima sesión: (1) tipos en platform.ts, (2) los 4 hooks, (3) Plans/page.tsx (más simple), (4) Companies/page.tsx, (5) Leads/page.tsx, (6) Dashboard/page.tsx (más complejo, agrega todo).