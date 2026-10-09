/** Salida de los CLIs. Nunca recibe tokens ni contraseñas: quien llama no se los pasa. */
export const log = {
  step: (message: string) => console.log(`\n▸ ${message}`),
  info: (message: string) => console.log(`  ${message}`),
  ok: (message: string) => console.log(`  ✓ ${message}`),
  warn: (message: string) => console.warn(`  ! ${message}`),
};
