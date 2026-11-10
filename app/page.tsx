"use client";
import Link from "next/link";
import {
  ArrowRight,
  Files,
  UserCheck,
  ChartNoAxesCombined,
} from "lucide-react";
import { useWorkflow } from "@/lib/workflow";
export default function Home() {
  const { state } = useWorkflow();
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-white p-7 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-700">
          Management workspace
        </p>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight md:text-4xl">
          Apakah tim kita siap memenuhi kebutuhan proyek?
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          Pahami pekerjaan, validasi kebutuhan Data & Design, lalu cocokkan
          skill talent dan konfirmasi alokasinya. Temukan gap yang perlu
          ditindaklanjuti dengan Build, Buy, atau Borrow.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/validasi"
            className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-5 py-3 text-sm font-medium text-white"
          >
            {state.intake ? "Lanjutkan workspace" : "Mulai validasi proyek"}
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/katalog"
            className="rounded-lg border border-line px-5 py-3 text-sm"
          >
            Lihat katalog capability
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">
          Simpan sesi untuk melanjutkan setelah menutup tab. File dan API key
          tidak disimpan di server.
        </p>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            Icon: Files,
            title: "Pahami sumber",
            text: "WBS berbagai format dan sheet, KAK, charter, serta dokumen pendukung menjadi informasi proyek yang bisa direview.",
          },
          {
            Icon: UserCheck,
            title: "Validasi kebutuhan",
            text: "Konfirmasi role, tinjau breakdown dan skill, lalu bandingkan UCP dengan bottom-up per bulan.",
          },
          {
            Icon: ChartNoAxesCombined,
            title: "Putuskan tindakan",
            text: "Lihat assignment talent, usulkan alokasi, konfirmasi availability, dan tindak lanjuti gap dengan Build · Buy · Borrow.",
          },
        ].map(({ Icon, title, text }) => (
          <section
            key={title}
            className="rounded-xl border border-line bg-white p-6"
          >
            <Icon size={22} className="text-accent-600" />
            <h2 className="mt-4 font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
          </section>
        ))}
      </div>
      <section className="rounded-xl bg-accent-50 p-6">
        <h2 className="font-semibold">Skill fit bukan bukti ketersediaan</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Jumlah assignment membantu reviewer mempertimbangkan beban kerja.
          Sistem tidak mengubah jumlah proyek menjadi FTE. Usulan, alokasi
          terkonfirmasi, dan qualified delivery ditampilkan terpisah.
        </p>
      </section>
    </div>
  );
}
