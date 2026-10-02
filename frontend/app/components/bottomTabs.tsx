import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router"; // Achtung: react-router-dom
import { HomeIcon, UserIcon, PlusIcon, Cog6ToothIcon, PhotoIcon, SparklesIcon, TvIcon } from "@heroicons/react/24/outline";

const items = [
  { id: "home", label: "Home", icon: <HomeIcon className="w-6 h-6" />, href: "/" },
  { id: "gallery", label: "Gallery", icon: <PhotoIcon className="w-6 h-6" />, href: "/gallery" },
  { id: "discover", label: "Discover", icon: <SparklesIcon className="w-6 h-6" />, href: "/discover" },
  { id: "tv-gallery", label: "TV Gallery", icon: <TvIcon className="w-6 h-6" />, href: "/tv-gallery" },
  { id: "settings", label: "Settings", icon: <Cog6ToothIcon className="w-6 h-6" />, href: "/settings" },
];

export type TabItem = {
  id: string;
  label: string;
  icon: ReactNode;
  href: string;
};

export default function BottomTabs() {
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);
  }, []);

  return (
    <div className={`fixed z-50 w-full max-w-lg -translate-x-1/2 ${isIOS ? 'bottom-0' : 'bottom-4'} left-1/2`} >
      <div className="grid h-16 grid-cols-5 mx-auto bg-card border border-border rounded-full overflow-hidden shadow-[var(--shadow-card)]">
        <style>{`
          .bottom-tab-icon {
            transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s;
          }
          .bottom-tab-icon:hover {
            transform: scale(1.2) rotate(-6deg);
          }
          .bottom-tab-active {
            color: var(--selection-foreground);
            background: var(--selection);
          }
          .bottom-tab-active .bottom-tab-icon {
            transform: scale(1.2);
          }
        `}</style>

        {items.map((item) => (
          <NavLink
            key={item.id}
            to={item.href}
            className={({ isActive }) =>
              `inline-flex flex-col items-center justify-center px-5 h-full group focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-[3px] focus-visible:ring-ring/60 ${
                isActive ? "bottom-tab-active" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`
            }
          >
            <span className="bottom-tab-icon">{item.icon}</span>
            <span className="sr-only">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
