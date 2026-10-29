import { Outlet, useNavigation } from "react-router";
import BottomTabs from "~/components/bottomTabs";
import Header from "~/components/header";
import { Skeleton } from "~/components/ui/skeleton";

/** Stands in for the page while its code downloads after a nav click. */
function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8 lg:p-12" role="status" aria-label="Loading page">
      <Skeleton className="aspect-[4/3] w-full rounded-2xl sm:aspect-[16/6]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="aspect-video rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function Layout() {
  const navigation = useNavigation();
  const navigating = navigation.state === "loading";

  return (
    <div className="min-h-screen flex flex-col">
        <Header />

      <main className="flex-1 pb-28">
        {navigating ? <PageSkeleton /> : <Outlet />}
      </main>

        <BottomTabs />
    </div>
  );
}
