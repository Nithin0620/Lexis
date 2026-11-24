"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

interface NavProps {
  showAuth?: boolean;
}

export default function LexisNav({ showAuth = true }: NavProps) {
  const router = useRouter();

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <nav className="lexis-nav">
      <Link href="/dashboard" className="lexis-nav__logo">
        LEXIS
      </Link>

      {showAuth && (
        <div className="lexis-nav__links">
          <Link href="/dashboard" className="lexis-nav__link">
            Dashboard
          </Link>
          <button
            onClick={handleLogout}
            className="btn btn--ghost btn--sm"
            style={{ cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  );
}
