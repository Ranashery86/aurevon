export default async function ServicePage({
  params,
}: {
  params: Promise<{ serviceKey: string }>;
}) {
  const { serviceKey } = await params;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight capitalize text-navy">
        {serviceKey}
      </h1>
      <div className="flex h-48 items-center justify-center rounded-2xl bg-white p-6 shadow-[0_24px_48px_-24px_rgba(15,42,74,0.18)] ring-1 ring-navy/[0.05]">
        <p className="text-sm text-slate-400">
          {serviceKey} service placeholder
        </p>
      </div>
    </div>
  );
}