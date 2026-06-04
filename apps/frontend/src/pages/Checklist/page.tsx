import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useChecklists } from "../../hooks/useChecklists";
import { useChecklistCategories } from "../../hooks/useChecklistCategories";
import { useAssets } from "../../hooks/useAssets";
import { useDrivers } from "../../hooks/useDrivers";
import { useMotors } from "../../hooks/useMotors";
import { ChecklistDrawer } from "./components/ChecklistDrawer";
import { CategoryModal } from "./components/CategoryModal";
import type {
  ChecklistInspectionItem,
  ChecklistItemCondition,
  ChecklistItemPresence,
  ChecklistStatus,
  ChecklistTargetKind,
} from "../../types/fleet";
import { usePermissions } from "../../hooks/usePermissions";

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildTimestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function assetLabel(a:{plate?:string;brand?:string;model?:string;code?:string;name?:string}){
  const id=a.plate||a.code||a.name||"Unidad";
  const detail=[a.brand,a.model].filter(Boolean).join(" ");
  return detail?`${id} — ${detail}`:id;
}
function motorLabel(m:{code?:string;brand?:string;model?:string;name?:string}){
  return `${m.code||m.name} — ${m.brand} ${m.model}`;
}

// ─── types ────────────────────────────────────────────────────────────────────

type WizardStep = 1|2|3;
type FormState = { targetKind:ChecklistTargetKind; targetId:string; inspectorId:string; categoryId:string };
const initialForm:FormState = { targetKind:"Vehiculo", targetId:"", inspectorId:"", categoryId:"" };
const initialDraft:ChecklistInspectionItem = { itemName:"", hasItem:"SI", condition:"Bueno", comment:"", imageName:"", imagePreview:"" };

// ─── step indicator ───────────────────────────────────────────────────────────

function StepBadge({n,active,done}:{n:number;active:boolean;done:boolean}){
  return (
    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
      done ? "bg-brand-500 text-white" :
      active ? "bg-brand-500/15 text-brand-500 ring-2 ring-brand-500/40 dark:bg-brand-500/20 dark:text-brand-400 dark:ring-brand-400/30" :
      "bg-gray-100 text-gray-400 dark:bg-white/[0.05] dark:text-gray-500"
    }`}>
      {done ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : n}
    </div>
  );
}

function WizardHeader({step,onStepClick}:{step:WizardStep;onStepClick:(s:WizardStep)=>void}){
  const steps=[
    {n:1 as WizardStep,label:"Configurar"},
    {n:2 as WizardStep,label:"Hallazgos"},
    {n:3 as WizardStep,label:"Confirmar"},
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s,i)=>(
        <div key={s.n} className="flex items-center">
          <button type="button"
            onClick={()=>s.n<step&&onStepClick(s.n)}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-all ${s.n<step?"cursor-pointer hover:bg-gray-100 dark:hover:bg-white/[0.05]":"cursor-default"}`}
          >
            <StepBadge n={s.n} active={step===s.n} done={step>s.n}/>
            <span className={`text-sm font-medium transition-colors ${
              step===s.n?"text-gray-800 dark:text-white":
              step>s.n?"text-brand-500 dark:text-brand-400":
              "text-gray-400 dark:text-gray-500"
            }`}>{s.label}</span>
          </button>
          {i<steps.length-1&&(
            <div className={`mx-1 h-px w-6 transition-colors duration-500 ${step>s.n?"bg-brand-500/50":"bg-gray-200 dark:bg-white/[0.08]"}`}/>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── primitives ───────────────────────────────────────────────────────────────

function Field({label,error,hint,children}:{label:string;error?:string;hint?:string;children:React.ReactNode}){
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</label>
      {children}
      {hint&&!error&&<p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
      {error&&<p className="text-xs font-medium text-error-500">{error}</p>}
    </div>
  );
}

const selectCls="w-full appearance-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 [&>option]:bg-white dark:[&>option]:bg-gray-800";
const textareaCls="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-200 dark:placeholder:text-gray-500";

function Select({value,onChange,options,error}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];error?:boolean}){
  return (
    <div className="relative">
      <select value={value} onChange={e=>onChange(e.target.value)}
        className={`${selectCls} pr-8 ${error?"border-error-300 focus:border-error-500 focus:ring-error-500/10 dark:border-error-500/40":""}`}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

function StatusPill({status}:{status:ChecklistStatus|"Pendiente"}){
  const map={
    Aprobado:"bg-success-50 text-success-700 border-success-200 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20",
    Observado:"bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-500/10 dark:text-warning-400 dark:border-warning-500/20",
    Pendiente:"bg-gray-100 text-gray-500 border-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:border-white/[0.08]",
  };
  return <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${map[status]}`}>{status}</span>;
}

function ConditionBadge({c}:{c:ChecklistItemCondition}){
  const map={Bueno:"text-success-600 dark:text-success-400",Regular:"text-warning-600 dark:text-warning-400",Malo:"text-error-600 dark:text-error-400"};
  return <span className={`text-sm font-semibold ${map[c]}`}>{c}</span>;
}

function StatCard({label,value,sub,colorCls}:{label:string;value:string|number;sub:string;colorCls:string}){
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{label}</p>
      <p className={`mt-1.5 text-3xl font-black tabular-nums ${colorCls}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export function ChecklistPage(){
  const {assets}=useAssets();
  const {drivers}=useDrivers();
  const {motors}=useMotors();
  const {categories}=useChecklistCategories();
  const {checklists,createChecklist}=useChecklists();

  const [step,setStep]=useState<WizardStep>(1);
  const [form,setForm]=useState<FormState>(initialForm);
  const [draft,setDraft]=useState<ChecklistInspectionItem>(initialDraft);
  const [items,setItems]=useState<ChecklistInspectionItem[]>([]);
  const [errors,setErrors]=useState<Partial<Record<keyof FormState,string>>>({});
  const [submitting,setSubmitting]=useState(false);
  const [drawerChecklist,setDrawerChecklist]=useState<typeof checklists[0]|null>(null);
  const [categoryModalOpen,setCategoryModalOpen]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  const { can } = usePermissions();

  const inspectors=useMemo(()=>drivers.filter(d=>d.status==="Activo"),[drivers]);

  const equipmentOptions=useMemo(()=>{
    if(form.targetKind==="Motor") return motors.map(m=>({value:m.id,label:motorLabel(m)}));
    return assets.map(a=>({value:a.id,label:assetLabel(a)}));
  },[assets,motors,form.targetKind]);

  const selectedCategory=useMemo(()=>categories.find(c=>c.id===form.categoryId),[categories,form.categoryId]);

  const selectedTargetLabel=useMemo(()=>{
    if(form.targetKind==="Motor"){const m=motors.find(m=>m.id===form.targetId);return m?motorLabel(m):"";}
    const a=assets.find(a=>a.id===form.targetId);return a?assetLabel(a):"";
  },[assets,motors,form.targetId,form.targetKind]);

  const availableItems=useMemo(()=>{
    const used=new Set(items.map(i=>i.itemName));
    return(selectedCategory?.items??[]).filter(i=>!used.has(i));
  },[items,selectedCategory]);

  const observedCount=items.filter(i=>i.hasItem==="NO"||i.condition!=="Bueno").length;
  const computedStatus:ChecklistStatus=items.length>0&&observedCount===0?"Aprobado":"Observado";

  const history=useMemo(()=>{
    const q=searchQuery.toLowerCase();
    return [...checklists].sort((a,b)=>b.date.localeCompare(a.date))
      .filter(c=>!q||c.targetLabel.toLowerCase().includes(q)||c.inspector.toLowerCase().includes(q)||c.categoryName.toLowerCase().includes(q));
  },[checklists,searchQuery]);

  function validateStep1(){
    const e:Partial<Record<keyof FormState,string>>={};
    if(!form.targetId) e.targetId=`Selecciona un ${form.targetKind.toLowerCase()}`;
    if(!form.inspectorId) e.inspectorId="Selecciona un inspector activo";
    if(!form.categoryId) e.categoryId="Selecciona una categoría";
    setErrors(e);
    return Object.keys(e).length===0;
  }

  function goToStep2(){
    if(!validateStep1()) return;
    setStep(2);
    if(availableItems.length>0) setDraft(d=>({...d,itemName:availableItems[0]}));
  }

  function addItem(){
    if(!draft.itemName){toast.error("Selecciona un punto de inspección");return;}
    if(items.some(i=>i.itemName===draft.itemName)){toast.error("Ese punto ya fue agregado");return;}
    setItems(prev=>[...prev,draft]);
    const remaining=availableItems.filter(i=>i!==draft.itemName);
    setDraft({...initialDraft,itemName:remaining[0]??""});
    toast.success(`"${draft.itemName}" agregado`);
  }

  async function handleImageUpload(file:File|null){
    if(!file){setDraft(d=>({...d,imageName:"",imagePreview:""}));return;}
    const preview=await new Promise<string>((res,rej)=>{
      const reader=new FileReader();
      reader.onload=()=>res(typeof reader.result==="string"?reader.result:"");
      reader.onerror=()=>rej();
      reader.readAsDataURL(file);
    });
    setDraft(d=>({...d,imageName:file.name,imagePreview:preview}));
  }

  async function handleSubmit(){
    if(items.length===0){toast.error("Agrega al menos un punto antes de registrar");return;}
    const inspector=inspectors.find(d=>d.id===form.inspectorId);
    if(!inspector||!selectedCategory||!selectedTargetLabel){toast.error("Falta información requerida");return;}
    setSubmitting(true);
    try{
      const createdAt=buildTimestamp();
      const findings=items.map(i=>`${i.itemName}: ${i.hasItem} / ${i.condition}${i.comment?` / ${i.comment}`:""}`).join(" | ");
      await createChecklist({
        targetKind:form.targetKind,targetId:form.targetId,targetLabel:selectedTargetLabel,
        assetId:form.targetKind==="Vehiculo"?form.targetId:"",
        inspectorId:form.inspectorId,inspector:inspector.name,
        categoryId:form.categoryId,categoryName:selectedCategory.name,
        date:createdAt,status:computedStatus,
        summary:`${selectedCategory.name} / ${computedStatus}`,
        findings,items,
      });
      toast.success("Checklist registrado correctamente");
      setForm(initialForm);setItems([]);setDraft(initialDraft);setStep(1);
    }catch(err){
      toast.error(err instanceof Error?err.message:"Error al registrar checklist");
    }finally{setSubmitting(false);}
  }

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-brand-600 dark:bg-brand-500/[0.12] dark:text-brand-400">
            Cumplimiento
          </span>
          <h1 className="mt-2 text-2xl font-bold text-gray-800 dark:text-white">Checklist</h1>
          <p className="mt-1 max-w-xl text-sm text-gray-500 dark:text-gray-400">
            Inspecciona equipos paso a paso. Elige el equipo, agrega hallazgos y registra el checklist completo.
          </p>
        </div>
        {can("checklist", "checklist", "crear") && (
          <button type="button" onClick={()=>setCategoryModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/20 dark:bg-brand-500/[0.08] dark:text-brand-400 dark:hover:bg-brand-500/[0.15]">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            Gestionar categorías
          </button>
        )}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Aprobados" value={checklists.filter(c=>c.status==="Aprobado").length} sub="Sin observaciones" colorCls="text-success-600 dark:text-success-400"/>
        <StatCard label="Observados" value={checklists.filter(c=>c.status==="Observado").length} sub="Con novedades" colorCls="text-warning-600 dark:text-warning-400"/>
        <StatCard label="Categorías" value={categories.length} sub="Plantillas activas" colorCls="text-brand-600 dark:text-brand-400"/>
        <StatCard label="Inspecciones" value={checklists.length} sub="Historial total" colorCls="text-gray-700 dark:text-gray-200"/>
      </div>

      {/* wizard card */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        {/* wizard nav */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-white/[0.06]">
          <WizardHeader step={step} onStepClick={setStep}/>
          {step>1&&(
            <button type="button" onClick={()=>setStep(s=>(s-1) as WizardStep)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.05] dark:hover:text-gray-300">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Atrás
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1 */}
          {step===1&&(
            <motion.div key="s1" initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}} transition={{duration:0.18}} className="p-5">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Configurar inspección</h2>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Selecciona el equipo, inspector y categoría.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Tipo de equipo">
                  <Select value={form.targetKind} onChange={v=>{setForm({...initialForm,targetKind:v as ChecklistTargetKind});setItems([]);setDraft(initialDraft);}}
                    options={[{value:"Vehiculo",label:`Vehículo (${assets.length})`},{value:"Motor",label:`Motor (${motors.length})`},{value:"Generador",label:"Generador"}]}/>
                </Field>
                <Field label={form.targetKind} error={errors.targetId}>
                  <Select value={form.targetId} onChange={v=>{setForm(f=>({...f,targetId:v}));setErrors(e=>({...e,targetId:undefined}));}} error={!!errors.targetId}
                    options={[{value:"",label:`Seleccione ${form.targetKind.toLowerCase()}`},...equipmentOptions]}/>
                </Field>
                <Field label="Inspector" error={errors.inspectorId} hint="Debe ser conductor activo">
                  <Select value={form.inspectorId} onChange={v=>{setForm(f=>({...f,inspectorId:v}));setErrors(e=>({...e,inspectorId:undefined}));}} error={!!errors.inspectorId}
                    options={[{value:"",label:"Seleccione inspector"},...inspectors.map(d=>({value:d.id,label:`${d.name}${d.licenseType?` / ${d.licenseType}`:""}`}))]}/>
                </Field>
                <Field label="Categoría" error={errors.categoryId}>
                  <Select value={form.categoryId} onChange={v=>{const cat=categories.find(c=>c.id===v);setForm(f=>({...f,categoryId:v}));setItems([]);setDraft({...initialDraft,itemName:cat?.items[0]??""});setErrors(e=>({...e,categoryId:undefined}));}} error={!!errors.categoryId}
                    options={[{value:"",label:"Seleccione categoría"},...categories.map(c=>({value:c.id,label:`${c.name} (${c.items.length})`}))]}/>
                </Field>
              </div>
              {(assets.length===0||inspectors.length===0||categories.length===0)&&(
                <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/[0.08] dark:text-warning-400">
                  Necesitas al menos un equipo activo, un inspector y una categoría para continuar.
                </div>
              )}
              <div className="mt-5 flex justify-end">
                <button type="button" onClick={goToStep2}
                  disabled={assets.length===0||inspectors.length===0||categories.length===0||!can("checklist","checklist","crear")}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:opacity-40">
                  Continuar
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2 */}
          {step===2&&(
            <motion.div key="s2" initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}} transition={{duration:0.18}} className="p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Agregar hallazgos</h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">Registra cada punto revisado uno por uno.</p>
                </div>
                {selectedTargetLabel&&(
                  <div className="rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-500/20 dark:bg-brand-500/[0.08]">
                    <p className="font-semibold text-brand-600 dark:text-brand-400">{form.targetKind}</p>
                    <p className="mt-0.5 text-gray-600 dark:text-gray-300">{selectedTargetLabel}</p>
                  </div>
                )}
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
                {/* form */}
                <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  {availableItems.length===0&&items.length>0?(
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-50 dark:bg-success-500/10">
                        <svg className="h-5 w-5 text-success-500" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      </div>
                      <p className="font-semibold text-gray-700 dark:text-gray-200">Todos los puntos agregados</p>
                      <p className="text-sm text-gray-400 dark:text-gray-500">Continúa al paso 3 para confirmar.</p>
                    </div>
                  ):(
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Punto revisado">
                          <Select value={draft.itemName} onChange={v=>setDraft(d=>({...d,itemName:v}))}
                            options={[{value:"",label:"Seleccione punto"},...availableItems.map(i=>({value:i,label:i}))]}/>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="¿Tiene?">
                            <Select value={draft.hasItem} onChange={v=>setDraft(d=>({...d,hasItem:v as ChecklistItemPresence}))}
                              options={[{value:"SI",label:"SI"},{value:"NO",label:"NO"}]}/>
                          </Field>
                          <Field label="Estado">
                            <Select value={draft.condition} onChange={v=>setDraft(d=>({...d,condition:v as ChecklistItemCondition}))}
                              options={[{value:"Bueno",label:"Bueno"},{value:"Regular",label:"Regular"},{value:"Malo",label:"Malo"}]}/>
                          </Field>
                        </div>
                      </div>
                      <Field label="Comentario">
                        <textarea value={draft.comment??""} onChange={e=>setDraft(d=>({...d,comment:e.target.value}))}
                          placeholder="Describe lo que encontraste…" rows={3} className={textareaCls}/>
                      </Field>
                      <Field label="Evidencia (opcional)">
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-400 transition hover:border-brand-400 hover:text-brand-500 dark:border-white/[0.10] dark:hover:border-brand-400 dark:hover:text-brand-400">
                          <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="5" width="16" height="12" rx="2"/><circle cx="10" cy="11" r="3"/>
                            <path d="M7 5l1.5-2.5h3L13 5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span>{draft.imageName||"Adjuntar imagen"}</span>
                          <input type="file" accept="image/*" className="hidden"
                            onChange={e=>handleImageUpload(e.target.files?.[0]??null).catch(()=>toast.error("No se pudo cargar la imagen"))}/>
                        </label>
                        {draft.imagePreview&&(
                          <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-white/[0.08]">
                            <img src={draft.imagePreview} alt="Preview" className="h-32 w-full object-cover"/>
                          </div>
                        )}
                      </Field>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={()=>setDraft({...initialDraft,itemName:availableItems[0]??""})}
                          className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.05]">
                          Limpiar
                        </button>
                        <button type="button" onClick={addItem}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 active:scale-95">
                          Agregar al checklist
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* items list */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Items agregados{" "}
                      <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-600 dark:bg-brand-500/[0.15] dark:text-brand-400">
                        {items.length}
                      </span>
                    </p>
                    {items.length>0&&<StatusPill status={computedStatus}/>}
                  </div>
                  {items.length===0?(
                    <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">Los hallazgos que agregues aparecerán aquí</p>
                  ):(
                    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-0.5">
                      <AnimatePresence initial={false}>
                        {items.map(item=>(
                          <motion.div key={item.itemName}
                            initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,x:16,height:0}} transition={{duration:0.15}}
                            className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                            <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.condition==="Bueno"?"bg-success-400":item.condition==="Regular"?"bg-warning-400":"bg-error-400"}`}/>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{item.itemName}</p>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                                <span>Tiene: <span className={item.hasItem==="SI"?"text-success-600 dark:text-success-400":"text-error-600 dark:text-error-400"}>{item.hasItem}</span></span>
                                <span>·</span>
                                <ConditionBadge c={item.condition}/>
                                {item.comment&&<><span>·</span><span className="truncate">{item.comment}</span></>}
                              </div>
                            </div>
                            <button type="button" onClick={()=>setItems(prev=>prev.filter(i=>i.itemName!==item.itemName))}
                              className="shrink-0 text-gray-300 transition hover:text-error-500 dark:text-gray-600 dark:hover:text-error-400" aria-label="Quitar">
                              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button type="button" onClick={()=>{if(items.length===0){toast.error("Agrega al menos un hallazgo");return;}setStep(3);}}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95">
                  Revisar y confirmar
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3 */}
          {step===3&&(
            <motion.div key="s3" initial={{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-16}} transition={{duration:0.18}} className="p-5">
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Confirmar checklist</h2>
              <p className="mt-0.5 mb-4 text-sm text-gray-500 dark:text-gray-400">Revisa el resumen antes de registrar. Esta acción no se puede deshacer.</p>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Resumen</p>
                  {[
                    {label:"Tipo",value:form.targetKind},
                    {label:"Equipo",value:selectedTargetLabel},
                    {label:"Inspector",value:inspectors.find(d=>d.id===form.inspectorId)?.name??""},
                    {label:"Categoría",value:selectedCategory?.name??""},
                    {label:"Items",value:`${items.length} punto${items.length!==1?"s":""} revisados`},
                    {label:"Observados",value:`${observedCount} con novedad`},
                    {label:"Fecha estimada",value:buildTimestamp()},
                  ].map(row=>(
                    <div key={row.label} className="flex items-start justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-0 dark:border-white/[0.06]">
                      <span className="text-gray-400 dark:text-gray-500">{row.label}</span>
                      <span className="text-right font-medium text-gray-800 dark:text-gray-200">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-sm text-gray-400 dark:text-gray-500">Resultado</span>
                    <StatusPill status={computedStatus}/>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-400">Detalle de hallazgos</p>
                  <div className="max-h-[280px] space-y-2 overflow-y-auto">
                    {items.map((item,i)=>(
                      <div key={item.itemName} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2 text-sm dark:border-white/[0.06]">
                        <span className="text-xs text-gray-300 dark:text-gray-600">{i+1}</span>
                        <span className="flex-1 font-medium text-gray-700 dark:text-gray-300">{item.itemName}</span>
                        <ConditionBadge c={item.condition}/>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={()=>setStep(2)}
                  className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-400 dark:hover:bg-white/[0.05]">
                  Volver a editar
                </button>
                <button type="button" onClick={handleSubmit} disabled={submitting || !can("checklist", "checklist", "crear")}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/20 transition hover:bg-brand-600 active:scale-95 disabled:opacity-50">
                  {submitting?(
                    <><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Registrando…</>
                  ):"Registrar checklist"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* history */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.06]">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Historial de inspecciones</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{history.length} resultado{history.length!==1?"s":""}</p>
          </div>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input type="text" placeholder="Buscar equipo, inspector…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
              className="h-9 w-64 rounded-xl border border-gray-200 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-700 placeholder:text-gray-400 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 dark:border-white/[0.08] dark:text-gray-300 dark:placeholder:text-gray-500"/>
          </div>
        </div>
        {history.length===0?(
          <div className="py-16 text-center text-sm text-gray-400 dark:text-gray-500">
            {searchQuery?"Sin resultados para esa búsqueda":"Cuando completes un checklist aparecerá aquí"}
          </div>
        ):(
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.06]">
                  {["#","Tipo","Equipo","Inspector","Categoría","Fecha","Estado",""].map((h,i)=>(
                    <th key={i} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.04]">
                {history.map((c,i)=>(
                  <tr key={c.id} className="group transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 text-xs text-gray-300 dark:text-gray-600">{i+1}</td>
                    <td className="px-5 py-3.5">
                      <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">{c.targetKind}</span>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-gray-800 dark:text-gray-200">{c.targetLabel||"—"}</td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{c.inspector}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-gray-700 dark:text-gray-300">{c.categoryName}</p>
                      <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{c.items?.length??0} items</p>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 dark:text-gray-400">{c.date}</td>
                    <td className="px-5 py-3.5"><StatusPill status={c.status}/></td>
                    <td className="px-5 py-3.5">
                      <button type="button" onClick={()=>setDrawerChecklist(c)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 opacity-0 transition-all group-hover:opacity-100 hover:border-brand-300 hover:text-brand-600 dark:border-white/[0.08] dark:text-gray-400 dark:hover:border-brand-500/30 dark:hover:text-brand-400">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ChecklistDrawer checklist={drawerChecklist} onClose={()=>setDrawerChecklist(null)}/>
      <CategoryModal open={categoryModalOpen} onClose={()=>setCategoryModalOpen(false)}/>
    </div>
  );
}