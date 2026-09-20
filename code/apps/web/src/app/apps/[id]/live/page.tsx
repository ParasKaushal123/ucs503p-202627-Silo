"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { request } from "@/lib/workspace";
import PillButton from "@/components/ui/PillButton";
export default function LiveApp() {
  const { id } = useParams<{ id: string }>(), auth = useAuth(), router = useRouter();
  const [app,setApp] = useState<any>(null), [error,setError] = useState("");
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) router.replace(`/?next=${encodeURIComponent(`/apps/${id}/live`)}`);
    if (!auth.isAuthenticated) return;
    let active = true;
    const load = () => request(`/apps/${id}/live`).then(result => { if (active) { setApp((old: any) => old?.id === result.id ? old : result); setError(""); } }).catch(e => { if (active) { setError(e.message); setApp(null); } });
    load(); const timer=setInterval(load,10000);
    return () => { active=false;clearInterval(timer); };
  },[auth.isAuthenticated,auth.isLoading,id,router]);
  return <main className="h-screen flex flex-col bg-silo-cream"><header className="h-14 shrink-0 border-b border-black bg-white flex items-center px-4 gap-4"><Link href="/dashboard" className="font-display text-2xl">SILO</Link><strong className="text-sm">{app?.name || "Published app"}</strong><span className="rounded-pill border border-black bg-silo-green px-3 py-1 text-[10px] font-bold">LIVE</span><Link href={`/apps/${id}/workbench`} className="ml-auto"><PillButton size="sm" variant="secondary">Workbench</PillButton></Link></header>{app ? <iframe title={app.name} srcDoc={app.html || undefined} src={app.html ? undefined : app.url} sandbox={app.html ? "allow-scripts" : "allow-scripts allow-forms allow-same-origin"} className="w-full flex-1 border-0"/> : <div className="flex-1 flex items-center justify-center text-sm text-neutral-500">{error || <Loader2 className="animate-spin" size={24}/>}</div>}</main>;
}
