"use client";

import { useCallback, useEffect, useState } from "react";
import GalaxyCanvas from "./GalaxyCanvas";

const memories = [
  "Tu manera de hacerme reír.",
  "La paz de sentirte cerca.",
  "Todo lo que seguimos descubriendo.",
  "Los recuerdos que aún nos faltan.",
  "Elegirnos también en los días comunes.",
];

function sendGalaxyBurst(x?: number, y?: number) {
  window.dispatchEvent(
    new CustomEvent("romance:burst", {
      detail: {
        x: x ?? window.innerWidth / 2,
        y: y ?? window.innerHeight / 2,
      },
    }),
  );
}

export default function RomanticStory() {
  const [selectedMemory, setSelectedMemory] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    const storedPreference = window.localStorage.getItem("galaxy-motion");
    const systemPrefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const shouldReduce =
      storedPreference === "reduced" ||
      (storedPreference === null && systemPrefersReduced);

    setReducedMotion(shouldReduce);
    document.documentElement.dataset.motion = shouldReduce
      ? "reduced"
      : "full";

    const revealItems = document.querySelectorAll<HTMLElement>(".reveal");
    if (shouldReduce || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.24 },
    );

    revealItems.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  const toggleMotion = useCallback(() => {
    setReducedMotion((current) => {
      const next = !current;
      document.documentElement.dataset.motion = next ? "reduced" : "full";
      window.localStorage.setItem("galaxy-motion", next ? "reduced" : "full");
      window.dispatchEvent(
        new CustomEvent("romance:motion", { detail: { reduced: next } }),
      );
      return next;
    });
  }, []);

  const beginJourney = useCallback(() => {
    window.dispatchEvent(new CustomEvent("romance:journey"));
    sendGalaxyBurst();
    document.getElementById("primera-luz")?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [reducedMotion]);

  const chooseMemory = useCallback((index: number, x: number, y: number) => {
    setSelectedMemory(index);
    window.dispatchEvent(
      new CustomEvent("romance:memory", { detail: { index } }),
    );
    sendGalaxyBurst(x, y);
  }, []);

  const shareGalaxy = useCallback(async () => {
    const shareData = {
      title: "Una galaxia para ti ✦",
      text: "Hice este pequeño universo para recordarte cuánto significa para mí compartir la vida contigo. Feliz Día de la Novia.",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus("Galaxia compartida.");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareStatus("Enlace copiado. Ya puedes enviarlo a tu persona favorita.");
      }
      sendGalaxyBurst();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("No se pudo compartir. Copia el enlace desde tu navegador.");
    }
  }, []);

  return (
    <main className="experience">
      <div className="galaxy-layer">
        <GalaxyCanvas />
      </div>
      <div className="cosmic-veil" aria-hidden="true" />

      <header className="site-chrome" aria-label="Controles de la experiencia">
        <a className="brand-mark" href="#inicio" aria-label="Volver al inicio">
          <span aria-hidden="true">✦</span>
          <span>Universo 3D · Para ti</span>
        </a>
        <button
          className="motion-toggle"
          type="button"
          aria-pressed={reducedMotion}
          onClick={toggleMotion}
        >
          <span className="motion-dot" aria-hidden="true" />
          {reducedMotion ? "Animar galaxia" : "Calmar galaxia"}
        </button>
      </header>

      <section className="story-section hero-section" id="inicio">
        <div className="hero-copy reveal is-visible">
          <p className="date-pill">
            <span aria-hidden="true">✦</span>
            1 de agosto · Día de la Novia
          </p>
          <p className="experience-label">
            <i aria-hidden="true" />
            <span>Experiencia 3D en tiempo real</span>
            <small>Toca · mueve · desliza</small>
          </p>
          <h1>
            Hay personas que cambian la forma en que miramos el
            <em> universo.</em>
          </h1>
          <p className="hero-lede">
            Esta pequeña galaxia existe para celebrar a una de ellas:
            <strong> tú.</strong>
          </p>
          <button className="primary-button" type="button" onClick={beginJourney}>
            Explorar nuestra galaxia
            <span aria-hidden="true">↘</span>
          </button>
        </div>

        <a className="scroll-cue" href="#primera-luz">
          <span>Desliza para comenzar</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <section className="story-section chapter chapter-left" id="primera-luz">
        <article className="story-card reveal">
          <p className="chapter-number">I · La primera luz</p>
          <h2>Desde que llegaste, algo brilla distinto.</h2>
          <p>
            No porque todo sea perfecto, sino porque incluso los días normales
            tienen algo especial cuando los compartimos.
          </p>
        </article>
      </section>

      <section className="story-section memory-section" id="nuestra-orbita">
        <div className="memory-copy reveal">
          <p className="chapter-number">II · Nuestra órbita</p>
          <h2>Lo bonito también vive en lo cotidiano.</h2>
          <p>
            En las conversaciones sin prisa, las risas inesperadas y esa calma
            de poder ser nosotros mismos.
          </p>
          <p className="touch-instruction">Toca una estrella</p>
          <p className="three-hint">
            Cada una ilumina un cristal alrededor del corazón 3D.
          </p>
        </div>

        <div className="memory-orbit reveal" aria-label="Pequeños recuerdos">
          {memories.map((memory, index) => (
            <button
              className={`memory-star ${selectedMemory === index ? "is-active" : ""}`}
              type="button"
              key={memory}
              aria-label={memory}
              aria-pressed={selectedMemory === index}
              onClick={(event) =>
                chooseMemory(index, event.clientX, event.clientY)
              }
            >
              <span aria-hidden="true">✦</span>
              <small>{String(index + 1).padStart(2, "0")}</small>
            </button>
          ))}
          <div className="memory-message" aria-live="polite">
            <span aria-hidden="true">✦</span>
            <p>{memories[selectedMemory]}</p>
          </div>
        </div>
      </section>

      <section className="story-section chapter chapter-right" id="constelacion">
        <article className="story-card reveal">
          <p className="chapter-number">III · Nuestra constelación</p>
          <h2>No somos un destino escrito.</h2>
          <p>
            Somos momentos, decisiones y caminos que se encuentran una y otra
            vez. Y todavía queda mucho cielo por recorrer.
          </p>
        </article>
      </section>

      <section className="story-section final-section" id="para-siempre">
        <article className="final-card reveal">
          <p className="chapter-number">IV · Este 1 de agosto</p>
          <div className="heart-orbit" aria-hidden="true">
            <span>♥</span>
          </div>
          <h2>Hoy celebro que estés en mi vida.</h2>
          <p>
            Feliz Día de la Novia. Gracias por convertir tantos instantes
            sencillos en recuerdos que quiero conservar.
          </p>
          <blockquote>
            “Si pudiera pedirle algo al universo, sería seguir coincidiendo
            contigo.”
          </blockquote>
          <div className="final-actions">
            <button className="primary-button" type="button" onClick={shareGalaxy}>
              Compartir esta galaxia
              <span aria-hidden="true">↗</span>
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                document.getElementById("inicio")?.scrollIntoView({
                  behavior: reducedMotion ? "auto" : "smooth",
                })
              }
            >
              Volver a recorrerla
            </button>
          </div>
          <p className="share-status" role="status" aria-live="polite">
            {shareStatus}
          </p>
        </article>

        <footer>
          Una fecha que internet convirtió en una bonita excusa para regalar
          amor. <span aria-hidden="true">✦</span>
        </footer>
      </section>
    </main>
  );
}
