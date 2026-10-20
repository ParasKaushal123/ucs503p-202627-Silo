"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { API, post, request } from "@/lib/workspace";
export default function Join() {
 const {token}=useParams<{token:string}>(),router=useRouter(),auth=useAuth();
 const [error,setError]=useState(""),[config,setConfig]=useState({google:false,local:false});
 useEffect(()=>{request("/auth/config").then(setConfig);},[]);
 useEffect(()=>{if(auth.isAuthenticated)post(`/invites/${token}/accept`).then(r=>router.replace(`/apps/${r.app_id}/workbench`)).catch(e=>setError(e.message));},[auth.isAuthenticated,token,router]);
 return <main className="min-h-screen flex items-center justify-center bg-silo-cream p-5"><div className="border border-black rounded-[24px] bg-white p-8 text-center max-w-md"><div className="font-display text-3xl mb-4">SILO</div><h1 className="font-display text-xl mb-3">JOIN A SHARED WORKBENCH</h1>{error?<p role="alert" className="text-sm text-silo-red">{error}</p>:auth.isAuthenticated||auth.isLoading?<p className="text-sm text-neutral-500">Opening your shared draft…</p>:<><p className="text-sm text-neutral-500 mb-5">Sign in to accept this invitation.</p>{config.google&&<a className="inline-block rounded-pill border border-black bg-black text-white px-5 py-2.5 text-xs font-bold" href={`${API}/auth/login?next=${encodeURIComponent(`/join/${token}`)}`}>Continue with Google</a>}{config.local&&<Link className="block underline text-xs mt-4" href={`/auth/local?next=${encodeURIComponent(`/join/${token}`)}`}>Use a local account</Link>}</>}</div></main>;
}
