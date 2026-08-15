import Link from "next/link";
import { btnPrimary, pageContainer } from "@/lib/uiClasses";

export default function AnalysisNotFound() {
  return (
    <div className={`${pageContainer} flex min-h-[60vh] flex-col items-center justify-center text-center`}>
      <h1 className="text-2xl font-semibold text-white">Analysis Not Found</h1>
      <p className="mt-3 max-w-md text-slate-400">
        No persisted analysis results exist for this report. Submit and analyse a
        report first.
      </p>
      <Link href="/reports" className={`${btnPrimary} mt-6`}>
        Go to Report Management
      </Link>
    </div>
  );
}
