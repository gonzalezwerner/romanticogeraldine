import type { Metadata } from "next";
import RomanticStory from "./RomanticStory";

export const metadata: Metadata = {
  title: "Una galaxia para ti ✦",
  description:
    "Un pequeño universo creado para celebrar el amor este 1 de agosto, Día de la Novia.",
};

export default function Home() {
  return <RomanticStory />;
}
