"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const api = process.env.NEXT_PUBLIC_API_BASE ?? "";

  return (
    <nav className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          Silo
        </Link>

        {isAuthenticated && user?.authenticated && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">{user.email}</span>
            <a
              href={`${api}/auth/logout`}
              className="text-neutral-400 hover:text-neutral-700 transition-colors"
            >
              Log out
            </a>
          </div>
        )}
      </div>
    </nav>
  );
}
