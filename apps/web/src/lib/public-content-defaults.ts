import type {
  MarketingContent,
  MarketingFaq,
  MarketingFlyer,
  MarketingTestimonial,
  PublicContentSnapshot,
  PublicPlatformSettings,
} from "@/types/platform";

export const defaultMarketingContent: MarketingContent = {
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
  footerTagline: "ApliSmart Motors: control vehicular, mantenimiento y equipos motorizados en una sola plataforma.",
};

export const defaultFaqs: MarketingFaq[] = [
  {
    id: "faq-001",
    question: "ApliSmart Motors sirve solo para autos y camionetas?",
    answer: "No. Tambien puede ayudarte a controlar motores, generadores electricos, camiones y otros equipos de trabajo.",
  },
  {
    id: "faq-002",
    question: "Puedo controlar varias sedes o bases de operacion?",
    answer: "Si. Puedes organizar la informacion por sede, responsable, disponibilidad y estado operativo.",
  },
  {
    id: "faq-003",
    question: "Sirve para empresas con cuadrillas tecnicas o proveedores de internet?",
    answer: "Si. Es ideal para empresas que trabajan con camionetas de servicio, tecnicos en campo, motores y equipos de respaldo.",
  },
];

export const defaultTestimonials: MarketingTestimonial[] = [
  {
    id: "tst-001",
    name: "Carla Medina",
    role: "Jefa de operaciones",
    company: "RedNet Servicios",
    quote: "Ahora tenemos mejor control de camionetas tecnicas, responsables y mantenimientos sin depender de hojas sueltas.",
  },
  {
    id: "tst-002",
    name: "Luis Paredes",
    role: "Administrador de flota",
    company: "Energia y Respaldo Andino",
    quote: "Pudimos ordenar vehiculos, motores y generadores en una sola vista y reaccionar mas rapido ante mantenimientos y alertas.",
  },
];

export const defaultFlyers: MarketingFlyer[] = [
  {
    id: "flyer-isp",
    title: "Servicios para proveedores de internet",
    subtitle: "Controla cuadrillas, camionetas de soporte y equipos de respaldo con una vista operativa clara.",
    audience: "ISP y cuadrillas tecnicas",
    ctaLabel: "Solicitar asesoria",
    ctaHref: "/solicitar-demo?segmento=isp",
    imageUrl: "https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=1400",
    tone: "sky",
    status: "Activo",
  },
  {
    id: "flyer-logistica",
    title: "Mas control para flotas y distribucion",
    subtitle: "Supervisa vehiculos, mantenimientos, combustible y responsables sin depender de hojas sueltas.",
    audience: "Logistica y distribucion",
    ctaLabel: "Ver solucion",
    ctaHref: "/solicitar-demo?segmento=logistica",
    imageUrl: "https://images.pexels.com/photos/2199293/pexels-photo-2199293.jpeg?auto=compress&cs=tinysrgb&w=1400",
    tone: "teal",
    status: "Activo",
  },
  {
    id: "flyer-energia",
    title: "Respaldo tecnico para energia critica",
    subtitle: "Gestiona motores y generadores con alertas, checklist y seguimiento de contingencia.",
    audience: "Energia y respaldo",
    ctaLabel: "Agendar demo",
    ctaHref: "/solicitar-demo?segmento=energia",
    imageUrl: "https://images.pexels.com/photos/35042792/pexels-photo-35042792.jpeg?auto=compress&cs=tinysrgb&w=1400",
    tone: "amber",
    status: "Activo",
  },
];

export const defaultPublicSettings: PublicPlatformSettings = {
  brandName: "ApliSmart Motors",
  brandTagline: "Control de flota y equipos motorizados",
  supportEmail: "ventas@aplismartmotors.app",
  supportPhone: "+593 99 100 2200",
  publicUrl: "https://motors.aplismart.com",
  defaultLanguage: "Espanol",
  defaultTimezone: "America/Guayaquil",
  allowDemoAccess: false,
  showPublicPricing: true,
  rememberSessionDefault: true,
};

export function createDefaultPublicContentSnapshot(): PublicContentSnapshot {
  return {
    marketingContent: defaultMarketingContent,
    faqs: defaultFaqs,
    testimonials: defaultTestimonials,
    flyers: defaultFlyers,
    settings: defaultPublicSettings,
    updatedAt: new Date().toISOString(),
  };
}
