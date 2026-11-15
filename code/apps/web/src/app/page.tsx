"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Boxes } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import Label from "@/components/ui/Label";
import SiloMark from "@/components/ui/SiloMark";

const STEPS = [
  { n: "01", title: "Upload", body: "Drop in a .zip or a single .py file. Silo works out how to run it." },
  { n: "02", title: "Share", body: "Send a link. Teammates join with their own account and a role." },
  { n: "03", title: "Edit together", body: "Change the same code at the same time, with comments beside it." },
  { n: "04", title: "Publish", body: "Build a preview of the saved draft, then make it the live app." },
];

const PROMISES = [
  { label: "Zero config", title: "No Dockerfile", body: "Entry point, dependencies, start command and port are detected for you." },
  { label: "Live together", title: "One shared draft", body: "Every edit is saved before it is shown to anyone else." },
  { label: "Publish safely", title: "Live stays live", body: "Drafts never touch the running app until someone publishes." },
];

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const login = `${process.env.NEXT_PUBLIC_API_BASE ?? ""}/auth/login`;

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/dashboard");
  }, [isLoading, isAuthenticated, router]);

  const cta = "inline-flex items-center gap-2 rounded-pill bg-black px-5 py-3 text-sm font-bold text-white hover:bg-neutral-800 transition-colors";

  return (
    <main className="min-h-screen bg-canvas text-black">
      <div className="bg-black text-canvas text-center font-mono text-[11px] uppercase py-2 px-4">
        Upload code · share a link · edit together · publish
      </div>

      <nav className="max-w-6xl mx-auto flex items-center justify-between px-5 py-5">
        <SiloMark />
        <div className="hidden md:flex gap-7 text-sm">
          <a href="#how" className="hover:underline">How it works</a>
          <a href="#why" className="hover:underline">Why Silo</a>
        </div>
        <a href={login} className="rounded-pill bg-black px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800">Open workspace</a>
      </nav>

      <section className="max-w-6xl mx-auto px-5 pt-10 pb-16 text-center">
        <Label>Google Docs for small software</Label>
        <h1 className="font-display font-bold leading-[0.9] my-6 text-[clamp(54px,9.3vw,134px)]">
          Your app,
          <br />
          shared{" "}
          <span className="inline-flex align-middle w-[0.72em] h-[0.72em] rounded-[0.16em] border-[3px] border-black bg-silo-green items-center justify-center">
            <Boxes className="w-1/2 h-1/2" strokeWidth={2.5} aria-hidden />
          </span>
        </h1>
        <p className="max-w-xl mx-auto text-neutral-500 text-[17px] leading-relaxed">
          Silo turns a small Python or web app into a live, shared workspace. Upload it once,
          send a link, and change it together like a document.
        </p>
        <div className="flex justify-center gap-3 mt-8">
          <a href={login} className={cta}><GoogleIcon /> Continue with Google</a>
          <a href="#how" className="inline-flex items-center rounded-pill border-[1.5px] border-neutral-300 bg-white px-5 py-3 text-sm font-bold hover:bg-neutral-100">How it works</a>
        </div>
      </section>

      <section id="why" className="max-w-6xl mx-auto px-5 pb-20 grid gap-4 md:grid-cols-3">
        {PROMISES.map((p) => (
          <div key={p.label} className="rounded-panel border-[1.5px] border-neutral-300 bg-white p-6">
            <div className="font-mono text-[11px] uppercase text-neutral-500">{p.label}</div>
            <div className="font-display font-bold text-[34px] leading-none mt-4 mb-2">{p.title}</div>
            <p className="text-sm text-neutral-500">{p.body}</p>
          </div>
        ))}
      </section>

      <section id="how" className="bg-silo-forest text-canvas">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <Label tone="mint">How it works</Label>
          <h2 className="font-display font-bold text-silo-green leading-[0.92] mt-5 mb-10 text-[clamp(38px,5vw,63px)]">
            Upload it.
            <br />
            Work on it together.
          </h2>
          <div className="grid gap-4 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-panel bg-canvas text-black p-6">
                <div className="font-mono text-[11px] text-neutral-500">{s.n}</div>
                <div className="font-display font-bold text-2xl mt-3 mb-2">{s.title}</div>
                <p className="text-sm text-neutral-500">{s.body}</p>
              </div>
            ))}
          </div>
          <a href={login} className="mt-10 inline-flex items-center gap-2 rounded-pill bg-silo-green px-5 py-3 text-sm font-bold text-onaccent hover:opacity-90">
            Start a shared app
          </a>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-5 py-8 flex justify-between font-mono text-[11px] uppercase text-neutral-500">
        <span>Silo</span>
        <span>UCS503P · small software, shared</span>
      </footer>
    </main>
  );
}
