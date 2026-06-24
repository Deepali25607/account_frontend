export default function PageHead({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.7rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
