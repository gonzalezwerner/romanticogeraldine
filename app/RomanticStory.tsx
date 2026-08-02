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
  const [hasEntered, setHasEntered] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
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

  useEffect(() => {
    if (!introComplete) {
      document.documentElement.classList.add("portal-locked");
      return () => document.documentElement.classList.remove("portal-locked");
    }
    document.documentElement.classList.remove("portal-locked");
  }, [introComplete]);

  useEffect(() => {
    if (!hasEntered) return;
    const finishTimer = window.setTimeout(
      () => {
        setIntroComplete(true);
        document.getElementById("inicio")?.focus({ preventScroll: true });
      },
      reducedMotion ? 480 : 3900,
    );
    return () => window.clearTimeout(finishTimer);
  }, [hasEntered, reducedMotion]);

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

  const enterUniverse = useCallback(() => {
    setHasEntered(true);
    window.dispatchEvent(new CustomEvent("romance:intro"));
    if ("vibrate" in navigator) navigator.vibrate([18, 38, 24]);
  }, []);

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
    <main
      className={`experience ${
        introComplete ? "is-entered" : hasEntered ? "is-travelling" : "is-awaiting"
      }`}
    >
      <div className="galaxy-layer">
        <GalaxyCanvas />
      </div>
      <div className="cosmic-veil" aria-hidden="true" />

      <div
        className={`entry-gate ${hasEntered ? "is-opening" : ""}`}
        role="dialog"
        aria-modal={!hasEntered}
        aria-hidden={hasEntered}
        aria-label="Entrada a la experiencia 3D"
      >
        <div className="entry-aura" aria-hidden="true" />
        <div className="entry-copy">
          <p className="entry-kicker">Transmisión privada · 01.08</p>
          <h2>Antes de entrar: esto no es una galaxia.</h2>
          <p className="entry-lede">
            Es todo lo que no siempre sé decirte.
          </p>
          <button className="portal-button" type="button" onClick={enterUniverse}>
            <i className="portal-ring portal-ring-one" aria-hidden="true" />
            <i className="portal-ring portal-ring-two" aria-hidden="true" />
            <span>
              Toca
              <small>para abrirla</small>
            </span>
          </button>
          <p className="entry-instruction">Toca · inclina · desliza</p>
        </div>
        <p className="entry-signature" aria-hidden="true">
          Para ti, con amor.
        </p>
      </div>

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

      <section className="story-section hero-section" id="inicio" tabIndex={-1}>
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
            En un universo inmenso, mi lugar favorito sigue siendo
            <em> contigo.</em>
          </h1>
          <p className="hero-lede">
            No hice esto para explicarte cuánto te quiero. Lo hice para que
            pudieras entrar un momento en ello.
          </p>
          <button className="primary-button" type="button" onClick={beginJourney}>
            Sigue la primera luz
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
          <h2>No llegaste haciendo ruido. Solo cambiaste la luz de todo.</h2>
          <p>
            Desde entonces, incluso los días normales tienen algo especial
            cuando los compartimos.
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
          <h2>No quiero prometerte un cielo perfecto.</h2>
          <p>
            Quiero seguir encontrándote en él: en los momentos, las decisiones
            y todos los caminos que aún nos faltan.
          </p>
        </article>
      </section>

      <section className="story-section final-section" id="para-siempre">
        <article className="final-card reveal">
          <p className="chapter-number">IV · Este 1 de agosto</p>
          <div className="heart-orbit" aria-hidden="true">
            <span>♥</span>
          </div>
          <h2>La fecha es una excusa. Tú eres la razón.</h2>
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
