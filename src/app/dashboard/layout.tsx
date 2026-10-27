import SectionNav from "@/components/hub/SectionNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh overflow-hidden bg-[#010313]">
      <SectionNav variant="strip" />
      <div className="h-[calc(100dvh-2.25rem)] min-h-0 overflow-hidden [&>div]:!h-full [&>div]:!min-h-0">
        {children}
      </div>
    </div>
  );
}
