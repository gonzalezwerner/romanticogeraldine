import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Una galaxia para ti ✦",
    template: "%s · Una galaxia para ti",
  },
  description:
    "Un pequeño universo creado para celebrar el amor este 1 de agosto, Día de la Novia.",
  applicationName: "Una galaxia para ti",
  openGraph: {
    title: "Una galaxia para ti ✦",
    description:
      "Hice este pequeño universo para recordarte cuánto significa para mí compartir la vida contigo.",
    type: "website",
    locale: "es_GT",
  },
  twitter: {
    card: "summary",
    title: "Una galaxia para ti ✦",
    description:
      "Un pequeño universo para celebrar el amor este 1 de agosto.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080611",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
