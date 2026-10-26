import { Skeleton } from "@/components/ui/skeleton";

// Shown instantly on navigation while the server renders the next page
export default function DashboardLoading() {
  return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 border-b flex items-center px-4 md:px-6">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="flex-1 p-4 md:p-6 space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
