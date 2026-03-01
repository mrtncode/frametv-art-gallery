import { type RouteConfig, layout, index, route } from "@react-router/dev/routes";

export default [
  layout("routes/_layout.tsx", [
    index("routes/home.tsx"),
    route("settings", "routes/settings.tsx"),
    route("gallery", "routes/gallery.tsx"),
    route("/album/:albumId", "routes//albumPage.tsx"),
  ]),
] satisfies RouteConfig;
