"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { post, request } from "@/lib/workspace";
import PillButton from "@/components/ui/PillButton";
function LocalAccount() {
  const auth = useAuth(), router = useRouter(), params = useSearchParams();
  const [register,setRegister] = useState(false), [email,setEmail] = useState("");
  const [password,setPassword] = useState(""), [name,setName] = useState("");
  const [enabled,setEnabled] = useState(false), [error,setError] = useState(""), [busy,setBusy] = useState(false);
  const raw=params.get("next"), next=raw?.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
  useEffect(() => { request("/auth/config").then(c => setEnabled(c.local)).catch(e=>setError(e.message)); },[]);
  useEffect(() => { if(auth.isAuthenticated) router.replace(next); },[auth.isAuthenticated,next,router]);
  return <main className="min-h-screen flex items-center justify-center bg-silo-cream px-5"><div className="w-full max-w-md rounded-[24px] border border-black bg-white overflow-hidden"><div className="border-b border-black bg-silo-yellow px-6 py-5"><Link href="/" className="font-display text-3xl">SILO</Link><h1 className="text-sm font-semibold mt-2">{register?"Create a local account":"Sign in to your local workspace"}</h1></div><div className="p-6">{error&&<p role="alert" className="text-xs text-silo-red mb-3">{error}</p>}{enabled?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{await post(register?"/auth/register":"/auth/password",{name,email,password});auth.refresh();router.replace(next);}catch(e){setError(e instanceof Error?e.message:"Sign-in failed");}finally{setBusy(false);}}}>{register&&<label className="block text-xs font-bold mb-4">Your name<input className="w-full border border-black rounded-pill px-4 py-2.5 mt-2 text-sm outline-none" value={name} onChange={e=>setName(e.target.value)} required autoComplete="name"/></label>}<label className="block text-xs font-bold mb-4">Email address<input className="w-full border border-black rounded-pill px-4 py-2.5 mt-2 text-sm outline-none" type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label><label className="block text-xs font-bold mb-5">Password<input className="w-full border border-black rounded-pill px-4 py-2.5 mt-2 text-sm outline-none" type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete={register?"new-password":"current-password"}/></label><PillButton disabled={busy}>{busy?"Please wait…":register?"Create account":"Sign in"}</PillButton><button type="button" className="block text-xs underline mt-4" onClick={()=>{setRegister(!register);setError("");}}>{register?"Already have an account? Sign in":"Create a local account"}</button></form>:<p className="text-sm text-neutral-500">Local accounts are disabled for this instance. <Link className="underline" href="/">Use the existing Google sign-in</Link>.</p>}</div></div></main>;
}
export default function Page(){return <Suspense><LocalAccount/></Suspense>;}
