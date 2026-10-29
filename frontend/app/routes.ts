import { type RouteConfig, layout, index, route } from "@react-router/dev/routes";

export default [
  layout("routes/_layout.tsx", [
    index("routes/home.tsx"),
    route("gallery", "routes/gallery.tsx"),
    route("tv-gallery", "routes/tvGallery.tsx"),
    route("settings", "routes/settings.tsx"),
    route("/album/:albumId", "routes//albumPage.tsx"),
  ]),
] satisfies RouteConfig;
