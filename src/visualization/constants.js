/** Constantes exclusivas da visualização 3D (sem regras do jogo). */

export const BALL_COUNT = 25;
export const BALL_RADIUS = 0.26;
export const BALL_SHELL_RADIUS = 1.5;
export const GLOBE_RADIUS = 2.2;
export const CAMERA_FOV = 45;

/** Ponto interno e saída superior usados apenas pela animação de extração. */
export const EXTRACTION_OPENING = Object.freeze({
  x: 0,
  y: GLOBE_RADIUS - BALL_RADIUS * 1.4,
  z: 0,
});
export const EXTRACTION_EXIT = Object.freeze({
  x: 0,
  y: GLOBE_RADIUS + BALL_RADIUS * 1.2,
  z: 0.22,
});

export const COLORS = Object.freeze({
  background: 0x0b1220,
  shell: 0xdff3ff,
  frame: 0x94a3b8,
  frameDark: 0x334155,
  accent: 0x0e9f8a,
  ball: 0xf8fbff,
  ink: 0x0f172a,
  stage: 0x101a2e,
});
