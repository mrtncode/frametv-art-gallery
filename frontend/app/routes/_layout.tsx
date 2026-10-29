import { Outlet } from "react-router";
import BottomTabs from "~/components/bottomTabs";
import Header from "~/components/header";

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
        <Header />

      <main className="flex-1 pb-16">
        <Outlet />
      </main>

        <BottomTabs />
    </div>
  );
}
