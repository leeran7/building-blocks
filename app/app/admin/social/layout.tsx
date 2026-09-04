"use client";

import { Navbar } from "../../../src/components/Navbar";
import { SocialAdminNav } from "../../../src/components/Social/SocialAdminNav";
import SocialAdminGate from "./SocialAdminGate";

export default function SocialAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void">
      <Navbar contextLabel="Social Admin" />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <SocialAdminGate>
          <div className="flex flex-col gap-8 md:flex-row">
            <aside className="md:w-48 flex-shrink-0">
              <SocialAdminNav />
            </aside>
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </SocialAdminGate>
      </div>
    </div>
  );
}
