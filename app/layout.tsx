import type { Metadata } from "next";
import { Shell } from "@/components/shell";
import { StoreProvider } from "@/lib/store";
import { WorkflowProvider } from "@/lib/workflow";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIX Talent Validation",
  description:
    "Validasi kebutuhan talent dari WBS dengan Use Case Points dan bottom-up, dibantu agent AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <StoreProvider>
          <WorkflowProvider>
            <Shell>{children}</Shell>
          </WorkflowProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
